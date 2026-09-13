# Phase 19 Implementation Report: Retry Engine & Dead-Letter Queue (DLQ)

## 1. Executive Summary

Phase 19 establishes reliable notification delivery retry handling, delayed scheduling, and dead-letter queue (DLQ) processing for PulseTrace. Building upon the PostgreSQL Transactional Outbox (Phase 16), Kafka Cluster Infrastructure (Phase 17), and Kafka Consumer Groups (Phase 18), Phase 19 implements:

- **Failure Classification**: Distinguishes retryable transient failures (timeouts, 429 rate limits, 5xx server errors, network resets) from permanent non-retryable errors (invalid recipients, malformed payloads, 400/401/403/422, template mismatches).
- **Exponential Backoff with Configurable Bounded Jitter**: Implements exponential backoff ($2^{\text{nextAttempt} - 2}$) with a configurable delay cap (`RETRY_MAX_DELAY_MS`) and bounded randomized jitter (`RETRY_JITTER_FACTOR`) to prevent thundering-herd pressure on downstream providers.
- **Redis Claim/Lease Delay Scheduler**: Employs a dual-state ZSET lease model (`pulsetrace:retry:scheduled` and `pulsetrace:retry:processing`) to prevent lost retries during scheduler crashes, enabling non-blocking background polling and automatic expired lease recovery.
- **Dedicated Kafka Retry Consumer Group (`pulsetrace-notification-retry-consumers`)**: Consumes from `notifications.retry` with `autoCommit: false` and manual offset commit semantics.
- **Immediate DLQ Routing & Durable Persistence**: Routes permanent failures and notifications exhausting maximum attempts (5 total attempts) directly to PostgreSQL (`NotificationDeadLetters` table) and publishes DLQ events to `notifications.dlq`.
- **Truthful Event History**: Emits `RETRY_SCHEDULED`, `RETRY_STARTED`, and `DLQ_MOVED` events into `NotificationEvents`.
- **Comprehensive Verification**: 32 unit test suites (284 tests) and 10 integration test suites (71 tests) passing with 100% success rate across all retry, scheduling, backoff, jitter, DLQ, and crash boundary scenarios.

---

## 2. Retry Architecture

The end-to-end event and retry flow across PulseTrace is:

```
                          External Application
                                  ↓
                        Express Ingress API
                                  ↓
                    PostgreSQL Transaction (Atomic Commit)
                        ├── Notification (QUEUED)
                        ├── NotificationEvent (CREATED)
                        └── OutboxEvent (PENDING)
                                  ↓
                        Outbox Publisher
                                  ↓
             Kafka Topic (notifications.high | normal | low)
                                  ↓
              Primary Consumer (pulsetrace-notification-consumers)
                                  ↓
                       Delivery Provider Attempt
                                  │
          ┌───────────────────────┼────────────────────────┐
          │ (Success)             │ (Transient Failure)    │ (Permanent / 4xx)
          ▼                       ▼                        ▼
  Notification: DELIVERED  Backoff & Jitter Delay     DLQ Service
  commit primary offset    Redis ZSET Delay Scheduler      ├── DB: NotificationDeadLetters
                                  │                        ├── DB: Notification -> DLQ
                           commit primary offset           ├── DB: Event -> DLQ_MOVED
                                  │                        ├── Kafka: notifications.dlq
                                  ▼                        └── commit primary offset
                        Redis Claim/Lease Scheduler
                                  │ (Lease claimed)
                                  ▼
                         notifications.retry
                                  │
                                  ▼
             Retry Consumer (pulsetrace-notification-retry-consumers)
                                  │
                                  ▼
                         Delivery Retry Attempt
                                  │
          ┌───────────────────────┴────────────────────────┐
          │ (Success)             │ (Transient Failure)    │ (Max Attempts / Perm)
          ▼                       ▼                        ▼
  Notification: DELIVERED  Next Backoff Delay         DLQ Service
  commit retry offset      Redis ZSET Delay Scheduler      ├── DB: NotificationDeadLetters
                           commit retry offset             ├── DB: Notification -> DLQ
                                                           ├── Kafka: notifications.dlq
                                                           └── commit retry offset
```

---

## 3. Failure Classification

Failures are classified via [`FailureClassifier`](file:///C:/Users/Siddharth%20Puhan/cpp/.vscode/do.c/sidd%20workspace/Pulse-Trace/apps/api/src/modules/retry/services/failure-classifier.ts) against real error objects:

| Error Type / Signal | Error Codes / Status | Classification | Action Taken |
| :--- | :--- | :--- | :--- |
| **Provider Rate Limiting** | HTTP `429`, `RATE_LIMIT_EXCEEDED` | `RETRYABLE_TRANSIENT` | Calculate backoff + schedule retry in Redis |
| **Provider Server Error** | HTTP `500`, `502`, `503`, `504` | `RETRYABLE_TRANSIENT` | Calculate backoff + schedule retry in Redis |
| **Network Reset / Timeout** | `ETIMEDOUT`, `ECONNRESET`, `EAI_AGAIN`, `ENOTFOUND`, `ECONNREFUSED` | `RETRYABLE_TRANSIENT` | Calculate backoff + schedule retry in Redis |
| **Service Outage** | `QUEUE_UNAVAILABLE`, `PROVIDER_TIMEOUT`, `SERVICE_UNAVAILABLE` | `RETRYABLE_TRANSIENT` | Calculate backoff + schedule retry in Redis |
| **Invalid Client Request** | HTTP `400`, `422`, `INVALID_REQUEST`, `BAD_REQUEST` | `PERMANENT_NON_RETRYABLE` | Move directly to DLQ (persist DB + publish `notifications.dlq`) |
| **Authentication / Config** | HTTP `401`, `403`, `UNAUTHORIZED`, `FORBIDDEN` | `PERMANENT_NON_RETRYABLE` | Move directly to DLQ |
| **Domain Entity Errors** | `USER_NOT_FOUND`, `TEMPLATE_NOT_FOUND`, `TEMPLATE_CHANNEL_MISMATCH` | `PERMANENT_NON_RETRYABLE` | Move directly to DLQ |

---

## 4. Attempt Numbering & Semantics

PulseTrace enforces one authoritative 5-attempt lifecycle (`RETRY_MAX_ATTEMPTS = 5`):

- **Attempt 1**: Initial delivery execution (from primary Kafka priority topics or BullMQ).
- **Attempt 2**: 1st retry (scheduled after Attempt 1 fails).
- **Attempt 3**: 2nd retry (scheduled after Attempt 2 fails).
- **Attempt 4**: 3rd retry (scheduled after Attempt 3 fails).
- **Attempt 5**: 4th retry (scheduled after Attempt 4 fails).
- **Exhaustion**: When **Attempt 5 fails**, total allowed attempts (5/5) are exhausted $\to$ immediate transition to **DLQ**.

---

## 5. Backoff Formula

The base backoff delay is calculated by [`BackoffCalculator`](file:///C:/Users/Siddharth%20Puhan/cpp/.vscode/do.c/sidd%20workspace/Pulse-Trace/apps/api/src/modules/retry/services/backoff-calculator.ts) for `nextAttemptNumber` ($2 \le \text{nextAttemptNumber} \le 5$):

$$\text{exponentialDelay} = \text{baseDelayMs} \times 2^{\text{nextAttemptNumber} - 2}$$

With default `RETRY_BASE_DELAY_MS = 1000`:
- Next Attempt 2 (1st retry): $1000 \times 2^0 = 1000\text{ ms}$ ($1\text{s}$)
- Next Attempt 3 (2nd retry): $1000 \times 2^1 = 2000\text{ ms}$ ($2\text{s}$)
- Next Attempt 4 (3rd retry): $1000 \times 2^2 = 4000\text{ ms}$ ($4\text{s}$)
- Next Attempt 5 (4th retry): $1000 \times 2^3 = 8000\text{ ms}$ ($8\text{s}$)

The delay is capped at `RETRY_MAX_DELAY_MS` (default $300,000\text{ ms}$ = 5 minutes):

$$\text{cappedDelay} = \min(\text{maxDelayMs}, \text{exponentialDelay})$$

---

## 6. Jitter Formula
 
Configurable bounded jitter is applied to the capped delay using `RETRY_JITTER_FACTOR` ($J \in [0.0, 1.0]$, default `1.0`):
 
$$\text{jitteredDelay} = \lfloor \text{cappedDelay} \times (1 - J) + \text{random}(0, 1) \times (\text{cappedDelay} \times J) \rfloor$$
 
- When $J = 1.0$ (Full Bounded Jitter): delay is uniformly distributed across $[0, \text{cappedDelay}]$.
- When $J = 0.0$ (No Jitter): delay is strictly $\text{cappedDelay}$.
- When $J = 0.2$ (20% Bounded Jitter): delay is uniformly distributed across $[0.8 \times \text{cappedDelay}, \text{cappedDelay}]$.

---

## 7. Retry Scheduling (Redis Dual-State Claim/Lease Model)

To avoid blocking Kafka consumer threads while preventing retry loss during worker crashes:

1. **Storage Keys**:
   - `pulsetrace:retry:scheduled`: Redis ZSET where `score = targetExecutionTimestamp` (`Date.now() + delayMs`).
   - `pulsetrace:retry:processing`: Redis ZSET where `score = leaseExpiryTimestamp` (`Date.now() + leaseTtlMs`, default 30s).
2. **Atomic Dequeue / Claim**:
   An atomic Redis Lua script claims due entries (`score <= now`) from `scheduled` to `processing` and recovers expired leases.
3. **Publication & Acknowledgment**:
   - `RetryScheduler` publishes claimed entries to Kafka `notifications.retry`.
   - Upon successful Kafka publication: `ZREM pulsetrace:retry:processing <jobJson>`.
4. **Crash Recovery**:
   If the scheduler crashes after Kafka publish before `ZREM`, the lease expires and is recovered in subsequent sweeps. The retry consumer is duplicate-tolerant.
5. **Non-Busy Polling**:
   Queries strictly `score <= now` on a non-blocking timeout interval (default `500ms`).

---

## 8. Retry Topic Contract (`notifications.retry`)

The retry event envelope preserves full context:

```typescript
export interface RetryJobEnvelope {
  eventId: string;
  eventType: EventType;
  notificationId: string;
  userId: string;
  templateId: string;
  channel: Channel;
  category: Category;
  priority: Priority;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  correlationId: string;
  timestamp: string;
  retryCount: number; // 0-indexed count of prior attempts completed
  metadata: {
    attemptNumber: number;      // Failed attempt (e.g. 1)
    nextAttemptNumber: number;  // Upcoming retry attempt (e.g. 2)
    scheduledAt: string;        // ISO-8601
    scheduledFor: string;       // ISO-8601
    delayMs: number;
    reason: string;
    error: string;
    lastErrorCode?: string;
  };
}
```

---

## 9. Retry Consumer Group

[`RetryConsumer`](file:///C:/Users/Siddharth%20Puhan/cpp/.vscode/do.c/sidd%20workspace/Pulse-Trace/apps/api/src/infrastructure/kafka/retry-consumer.ts) manages `notifications.retry`:

- **Group ID**: `pulsetrace-notification-retry-consumers` (configured via `KAFKA_RETRY_CONSUMER_GROUP_ID`).
- **Processing Flow**:
  1. Validates message schema. Malformed messages commit offset immediately.
  2. Emits `RETRY_STARTED` in `NotificationEvents`.
  3. Executes `processingService.processNotification(notificationId, { jobId, workerId, attemptNumber, maxAttempts: 5 })`.
  4. On Success: Commits Kafka offset (`commitOffsets: offset + 1`).
  5. On Transient Failure (attempt $< 5$): Schedules next attempt in Redis $\to$ updates DB status `RETRY_PENDING` $\to$ emits `RETRY_SCHEDULED` $\to$ commits Kafka offset.
  6. On Permanent Failure / Max Attempts Exhausted (attempt $= 5$): Routes to `DlqService` $\to$ commits Kafka offset.
  7. On Infrastructure Crash: Rethrows error without committing offset, allowing Kafka redelivery.

---

## 10. DLQ Architecture & Persistence

### 10.1 PostgreSQL Entity (`NotificationDeadLetters`)
```prisma
model NotificationDeadLetter {
  id                 String       @id @default(uuid())
  notificationId     String       @unique
  originalPayload    Json         @db.JsonB
  failedAttempts     Int
  lastErrorCode      String?
  lastErrorMessage   String?
  errorDetails       Json         @default("[]") @db.JsonB
  createdAt          DateTime     @default(now())
  resolvedAt         DateTime?
  resolvedBy         String?

  notification       Notification @relation(fields: [notificationId], references: [id], onDelete: Restrict)

  @@index([createdAt])
  @@map("NotificationDeadLetters")
}
```

### 10.2 DLQ Service & Kafka Topic (`notifications.dlq`)
[`DlqService`](file:///C:/Users/Siddharth%20Puhan/cpp/.vscode/do.c/sidd%20workspace/Pulse-Trace/apps/api/src/modules/dlq/services/dlq-service.ts):
1. Inserts durable `NotificationDeadLetter` record in PostgreSQL.
2. Updates `Notification.status = DLQ`.
3. Records `EventType.DLQ_MOVED` in `NotificationEvents`.
4. Publishes DLQ event to Kafka topic `notifications.dlq`.

---

## 11. Offset Semantics

`autoCommit: false` is strictly enforced across primary and retry consumers:

| Scenario | Processing Action | Offset Commit Behavior |
| :--- | :--- | :--- |
| **Delivery Success** | Mark `DELIVERED`, emit `WORKER_COMPLETED` | Commit offset |
| **Retryable Failure** | Schedule in Redis, update `RETRY_PENDING`, emit `RETRY_SCHEDULED` | Commit offset *after* Redis & DB write |
| **Permanent Failure** | Persist `NotificationDeadLetter`, update `DLQ`, emit `DLQ_MOVED`, publish `notifications.dlq` | Commit offset *after* DLQ handling |
| **Max Retries Exhausted** | Persist `NotificationDeadLetter`, update `DLQ`, emit `DLQ_MOVED`, publish `notifications.dlq` | Commit offset *after* DLQ handling |
| **Malformed Message** | Log warning with offset details | Commit offset (unblocks partition) |
| **Infrastructure Crash** | Database down / Redis down / Fatal uncaught crash | **Leave offset uncommitted** (Kafka redelivery) |

---

## 12. Crash Windows & Failure Analysis

| Failure Boundary | Impact | Recovery Behavior |
| :--- | :--- | :--- |
| **Crash before retry scheduling** | Offset uncommitted | Kafka redelivers message to another consumer on partition rebalance |
| **Crash after retry scheduling before offset commit** | Offset uncommitted, Redis has job | Kafka redelivers message; subsequent execution finds notification in `RETRY_PENDING` and commits cleanly |
| **Crash after Kafka retry publication before Redis ACK** | Job remains in Redis `processing` | Lease expires; scheduler re-claims and re-publishes. Consumer processes duplicate safely |
| **Crash after DB DLQ persist before Kafka DLQ publish** | PostgreSQL has DLQ, Kafka misses event | PostgreSQL remains durable source of truth; dashboard / operators inspect DB directly |

---

## 13. Duplicate Considerations & At-Least-Once Semantics

- **At-Least-Once Delivery**: In Phase 19, Kafka retry consumer processing and Redis scheduler claims are strictly at-least-once.
- **Database Status Guard**: `processNotification` inspects DB notification status (`DELIVERED` / `DLQ`) prior to re-executing delivery to prevent sequential re-deliveries.
- **The Provider Crash Window**: If a worker dispatches a notification to an external provider (e.g., SendGrid/Twilio) and the provider accepts the message, but the worker process crashes *before* persisting `DELIVERED` status to PostgreSQL (or before committing the Kafka offset), the message will be redelivered upon consumer rebalance. The recovered worker will re-attempt delivery, resulting in a duplicate external delivery.
- **Phase 21 Resolution**: Database status checks alone do not provide atomic distributed idempotency. Eliminating duplicate external dispatches requires the **Distributed Idempotency Engine** (Phase 21), which introduces distributed Redis locks (`SET NX EX`), persistent idempotency keys, and provider-level idempotency key propagation.

---

## 14. Observability & Event Timeline

Lifecycle events emitted:
- `RETRY_SCHEDULED`: Recorded when a transient failure triggers delayed retry calculation.
- `RETRY_STARTED`: Recorded when `RetryConsumer` picks up a retry event.
- `DLQ_MOVED`: Recorded when a notification transitions permanently to DLQ.

Structured logging includes: `notificationId`, `eventId`, `attemptNumber`, `nextAttemptNumber`, `delayMs`, `topic`, `partition`, `offset`, `errorCode`, `reason`.

---

## 15. Health & Monitoring Metrics

Backend monitoring exposes:
- `getQueueDepth()`: Count of scheduled and in-flight leased retries in Redis ZSET.
- `countDeadLetters()`: Count of dead-lettered notifications in PostgreSQL.
- `getStatus()`: Running and connection status of `NotificationConsumer` and `RetryConsumer`.

---

## 16. Comprehensive Test Verification

### 16.1 Automated Unit Tests
- **`backoff-calculator.test.ts`**: Verifies exponential scaling ($2^{\text{nextAttempt}-2}$), delay cap, $J = 0.0$, $J = 1.0$, and $J = 0.2$ jitter bounds.
- **`failure-classifier.test.ts`**: Verifies classification of 429, 500-504, network error codes, domain entity errors, and 4xx client errors.
- **`retry-scheduler.test.ts`**: Verifies Redis ZSET scheduling, atomic Lua claim/lease, Kafka publication, ACK removal, and queue depth.
- **`dlq-service.test.ts`**: Verifies DB persistence, `DLQ_MOVED` event emission, and `notifications.dlq` publication.
- **`retry-consumer.test.ts`**: Verifies retry consumption, success, transient failure re-scheduling, permanent failure DLQ routing, max attempt exhaustion, malformed messages, and offset commit ordering.

### 16.2 Automated Integration Tests
- **`retry-engine.integration.test.ts`**:
  1. Initial delivery failure $\to$ `RETRY_SCHEDULED` event, `RETRY_PENDING` status, Redis ZSET entry.
  2. Redis delay scheduler claims due retries and publishes to `notifications.retry`.
  3. `RetryConsumer` consumes from `notifications.retry` $\to$ emits `RETRY_STARTED` $\to$ delivers $\to$ `DELIVERED`.
  4. Permanent failure on Attempt 1 $\to$ moves directly to DLQ.
  5. Exhausted retries (5/5) $\to$ moves to DLQ and persists `NotificationDeadLetters` record.
  6. Crash boundary test: Expired processing lease in Redis is recovered without loss.

---

## 17. Exact Test Results

```
Test Suites: 32 passed, 32 total (API Unit Tests)
Tests:       284 passed, 284 total
Time:        25.511 s

Test Suites: 10 passed, 10 total (Integration Tests)
Tests:       71 passed, 71 total
Time:        21.565 s

TypeScript Build (tsc): Passed (0 errors)
ESLint:                 Passed (0 errors)
```

---

## 18. Files Changed & Created

### Added:
- `apps/api/prisma/migrations/20260913183000_add_notification_dead_letters/migration.sql`
- `apps/api/src/infrastructure/redis/redis-connection.ts`
- `apps/api/src/modules/retry/interfaces/retry-job-envelope.ts`
- `apps/api/src/modules/retry/services/failure-classifier.ts`
- `apps/api/src/modules/retry/services/backoff-calculator.ts`
- `apps/api/src/modules/retry/services/retry-scheduler.ts`
- `apps/api/src/modules/dlq/interfaces/dead-letter-repository.ts`
- `apps/api/src/modules/dlq/repositories/prisma-dead-letter-repository.ts`
- `apps/api/src/modules/dlq/services/dlq-service.ts`
- `apps/api/src/infrastructure/kafka/retry-consumer.ts`
- `apps/api/src/infrastructure/kafka/scripts/start-retry-consumer.ts`
- `apps/api/src/infrastructure/kafka/scripts/start-retry-scheduler.ts`
- `apps/api/src/__tests__/modules/retry/services/backoff-calculator.test.ts`
- `apps/api/src/__tests__/modules/retry/services/failure-classifier.test.ts`
- `apps/api/src/__tests__/modules/retry/services/retry-scheduler.test.ts`
- `apps/api/src/__tests__/modules/dlq/services/dlq-service.test.ts`
- `apps/api/src/__tests__/infrastructure/kafka/retry-consumer.test.ts`
- `apps/api/src/__tests__/integration/retry-engine.integration.test.ts`

### Modified:
- `apps/api/prisma/schema.prisma` (Added `NotificationDeadLetter` model and relation)
- `apps/api/src/config/env.ts` (Added retry and DLQ configuration)
- `.env.example` (Documented retry and DLQ environment variables)
- `apps/api/package.json` (Added `"worker:kafka:retry"` and `"worker:retry-scheduler"`)
- `apps/api/src/infrastructure/kafka/notification-consumer.ts` (Integrated failure classifier, retry scheduler, DLQ service, and safe offset commits)
- `apps/api/src/__tests__/integration/helpers.ts` (Updated `cleanTestDatabase` to clean `notificationDeadLetter`)

---

## 19. Known Limitations

1. **Non-Atomic DB DLQ + Kafka DLQ Publication**: In Phase 19, `NotificationDeadLetter` DB write and Kafka `notifications.dlq` publication execute sequentially. PostgreSQL is the durable source of truth.
2. **Approximate Scheduling Delay**: Redis polling operates on a non-blocking interval (`500ms`), making execution timing approximate.
3. **External Provider Duplicate Delivery Window**: In crash scenarios where external dispatch succeeds but the worker crashes before the PostgreSQL state update or Kafka offset commit, retry redelivery can cause duplicate provider dispatches until Phase 21 (Distributed Idempotency Engine).

---

## 20. Explicit Phase 20/21 Boundaries

- **Phase 20 Scope**: DLQ Operator Replay Pipeline, 1-click dashboard replay API (`POST /api/v1/notifications/:id/replay`), operator investigation endpoints.
- **Phase 21 Scope**: Distributed Idempotency Engine (`SET NX EX` Redis fast-locking and provider idempotency key propagation).

---

## 21. Recommended Next Steps

1. Proceed to **Phase 20: DLQ & Operator Replay Pipeline**.
2. Expose DLQ inspection and replay endpoints in Express API.
3. Verify replay execution over Kafka and DLQ reconciliation.
