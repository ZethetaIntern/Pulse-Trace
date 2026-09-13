# Phase 18 Implementation Report: Kafka Consumer Group & Notification Processing

## 1. Executive Summary

Phase 18 introduces Apache Kafka Consumer Groups and moves notification processing from the legacy BullMQ-only execution path toward an event-driven Kafka architecture for PulseTrace. Building upon the PostgreSQL Transactional Outbox (Phase 16) and Kafka Cluster Infrastructure (Phase 17), Phase 18 establishes:

- **Kafka Consumer Group (`pulsetrace-notification-consumers`)**: Consumes notification events from priority topics (`notifications.high`, `notifications.normal`, `notifications.low`) with cooperative partition rebalancing and configurable concurrency.
- **Strict Schema Validation**: Validates all incoming Kafka messages against the Phase 16 `PulseTraceOutboxPayload` schema and extracts Kafka headers (`x-event-id`, `x-correlation-id`, `x-event-type`).
- **Controlled Processing Ingress Mode**: Introduces `NOTIFICATION_PROCESSING_MODE` (`bullmq` vs `kafka`) to control delivery routing without breaking legacy clients or causing duplicate processing.
- **Truthful Timeline Semantics**: Enforces truthful event recording by emitting `JOB_QUEUED` exclusively when a BullMQ job is enqueued, and ensuring `REPLAY_STARTED`/`REPLAY_COMPLETED` are recorded exclusively for notifications linked to explicit `ReplayExecution` records.
- **Manual Offset Commit Semantics (`autoCommit: false`)**: Manually commits offsets (`nextOffset = offset + 1`) strictly after successful database state transition and delivery execution, guaranteeing resilient at-least-once delivery.
- **Comprehensive Verification**: 27 unit test suites (261 tests) and 9 integration test suites (65 tests) passing with 100% success rate across all modes and edge cases.

---

## 2. Implemented Architecture

The end-to-end event flow across PulseTrace in Kafka processing mode is:

```
External Application
        ↓
Express API (POST /api/v1/notifications)
        ↓
PostgreSQL Transaction (Atomic Commit)
    ├── Notification (Status: QUEUED)
    ├── NotificationEvent (REQUEST_VALIDATED, NOTIFICATION_STORED, NOTIFICATION_CREATED)
    └── OutboxEvent (Status: PENDING, Topic: notifications.<priority>)
            ↓
Transactional Outbox Publisher (Poller & Lease Worker)
            ↓
Kafka Producer (Idempotent, acks=all)
            ↓
Kafka Topic (notifications.high | notifications.normal | notifications.low)
            ↓
Kafka Consumer Group (pulsetrace-notification-consumers)
    ├── Message Validator (Schema validation & header extraction)
    ├── Replay Detector (Checks ReplayExecution association)
    ├── Notification Processing Pipeline (Provider Dispatch & Status Update)
    ├── Event Recorder (WORKER_STARTED, PROVIDER_ATTEMPT, WORKER_COMPLETED)
    └── Manual Offset Commit (commitOffsets: offset + 1)
            ↓
PostgreSQL Notification State (Status: DELIVERED)
```

In legacy mode (`NOTIFICATION_PROCESSING_MODE=bullmq`), ingress retains the atomic outbox commit for future audit/streaming, while continuing to enqueue to BullMQ and recording `JOB_QUEUED`.

---

## 3. Consumer Group Topology

### 3.1 Group Configuration
- **Group ID**: `pulsetrace-notification-consumers` (configured via `KAFKA_CONSUMER_GROUP_ID`).
- **Subscribed Topics**:
  - `notifications.high` (Priority partition consumption)
  - `notifications.normal`
  - `notifications.low`
- **Topics Excluded by Design (Phase 19 Scope)**:
  - `notifications.retry` (Scheduled delayed retries)
  - `notifications.dlq` (Dead-letter queue inspection)
- **Concurrency**: Configurable per worker node via `KAFKA_CONSUMER_CONCURRENCY` (default: 1 partition consumed concurrently per node).
- **Auto-Commit**: Explicitly set to `autoCommit: false`.

### 3.2 Partition Rebalancing & Assignment
The consumer hooks into KafkaJS lifecycle events:
- `CONNECT` / `DISCONNECT`: Tracks cluster connection state.
- `GROUP_JOIN`: Captures `memberAssignment` and logs partition allocations per topic.
- `REBALANCING`: Logs rebalance initiation for cluster awareness.
- `CRASH`: Captures uncaught consumer crashes and updates status diagnostics.

---

## 4. Message Contract & Validation

Messages consumed from Kafka are validated by `MessageValidator` against the authoritative Phase 16 payload contract (`PulseTraceOutboxPayload`).

### Required Fields Validated:
1. `eventId` (string)
2. `eventType` (string, e.g., `NOTIFICATION_CREATED`)
3. `notificationId` (string, UUID)
4. `userId` (string)
5. `templateId` (string)
6. `channel` (valid Channel enum: `EMAIL`, `SMS`, `PUSH`, `WEBHOOK`, `IN_APP`)
7. `category` (valid Category enum: `TRANSACTIONAL`, `MARKETING`, `ALERT`, `SYSTEM`)
8. `priority` (valid Priority enum: `LOW`, `NORMAL`, `HIGH`, `URGENT`)
9. `payload` (JSON object)
10. `timestamp` (valid ISO-8601 date string)

### Header Extraction:
- `x-event-id`: Traceable outbox event UUID.
- `x-correlation-id`: Request correlation ID passed through headers.
- `x-event-type`: Domain event type string.

### Malformed Message Handling:
If a message fails JSON parsing or schema validation, it is logged with `WARN` diagnostics containing partition and offset details, and its offset is committed immediately. This prevents unprocessable "poison-pill" messages from permanently stalling topic partition consumption.

---

## 5. Ingress Mode & Timeline Truthfulness

### 5.1 Controlled Processing Mode Switching
The environment configuration variable `NOTIFICATION_PROCESSING_MODE` governs ingress behavior:
- `bullmq` (default): Enqueues notification job to BullMQ queue and records `JOB_QUEUED` in `NotificationEvent` timeline.
- `kafka`: Bypasses BullMQ queue entirely; outbox publisher publishes the event to Kafka, and the Kafka consumer handles processing.

### 5.2 Truthful Event Semantics
In `NOTIFICATION_PROCESSING_MODE=kafka`, no BullMQ job is ever enqueued. Consequently:
- `JOB_QUEUED` is **never emitted** during ingress.
- Timeline transitions truthfully: `REQUEST_VALIDATED` → `NOTIFICATION_STORED` → `NOTIFICATION_CREATED` → `WORKER_STARTED` → `PROVIDER_ATTEMPT` → `WORKER_COMPLETED`.
- Timeline integrity is preserved across both modes.

---

## 6. Offset Commit Strategy & Semantics

### 6.1 Manual Commit Protocol
KafkaJS auto-commit is disabled (`autoCommit: false`). Offsets are committed explicitly via `consumer.commitOffsets`:

```typescript
const nextOffset = (BigInt(message.offset) + 1n).toString();
await this.consumer.commitOffsets([{ topic, partition, offset: nextOffset }]);
```

### 6.2 Commit Timing & Failure Resilience
- **Successful Processing**: The offset is committed only after `processingService.processNotification` completes and all database records (`Notification.status = DELIVERED`, `NotificationEvent` entries) are committed.
- **Processing Failure**: If provider delivery or database updates fail, the error is rethrown, leaving the partition offset uncommitted. Upon consumer restart or partition rebalance, Kafka replays the message for redelivery.
- **Poison-Pill Messages**: Messages failing schema validation commit offset immediately to unblock the partition.

---

## 7. Notification Delivery Integration

The Kafka consumer integrates cleanly with the existing delivery engine without altering provider interfaces:
- Calls `NotificationProcessingService.processNotification(notificationId, context)`.
- Context parameters provided:
  - `jobId`: Outbox event ID or deterministic `topic-partition-offset` fallback.
  - `workerId`: Identifier of the running consumer worker (`kafka-consumer-<pid>`).
  - `attemptNumber`: `(payload.retryCount || 0) + 1`.
  - `maxAttempts`: 1 (per consumer attempt).
- Updates delivery state, triggers template compilation, dispatches through provider adapters, and records granular provider attempt events.

---

## 8. Replay Engine Integration

Replay lifecycle semantics are strictly preserved:
- The consumer checks `replayExecutionRepository.findReplayExecutionByNewNotificationId(notificationId)`.
- If and only if an associated `ReplayExecution` is found:
  1. Records `REPLAY_STARTED` before notification processing.
  2. Executes standard delivery pipeline.
  3. Records `REPLAY_COMPLETED` after successful delivery.
- For normal notifications, replay events are omitted, preventing event timeline pollution.

---

## 9. Failure Handling & At-Least-Once Guarantees

### 9.1 At-Least-Once Delivery
- Database state transitions and outbox events are transactional at ingress.
- Consumer commits offsets only after successful execution.
- Redeliveries are idempotent due to database status checks in `processNotification`.

### 9.2 Boundary Clarifications
- Phase 18 does not implement retry delays or Dead-Letter Queues (DLQ); these belong to Phase 19.
- Transient processing failures fail fast, allowing Kafka consumer group redelivery or subsequent Phase 19 retry scheduling.

---

## 10. Consumer Observability & Lifecycle Instrumentation

`NotificationConsumer` provides status introspection via `getStatus()`:
- `isRunning`: Consumer active state.
- `isConnected`: Cluster connection state.
- `groupId`: Consumer group name.
- `subscribedTopics`: Array of subscribed topics.
- `assignedPartitions`: Real-time topic-partition assignment list.
- `totalProcessed`: Count of successfully processed events.
- `lastProcessedAt`: Timestamp of last processed notification.
- `lastError`: Error message of most recent failure.

---

## 11. Standalone Worker Execution Model

A dedicated standalone CLI worker entrypoint is provided:
- File: `apps/api/src/infrastructure/kafka/scripts/start-consumer.ts`
- NPM Script: `npm run worker:kafka` (in `apps/api`)
- Graceful Shutdown: Listens to `SIGTERM` and `SIGINT`, disconnecting consumer, database, and Redis connections cleanly within 10 seconds.

---

## 12. Comprehensive Test Verification

### 12.1 Unit Tests
- **API Unit Suite**: 27 test suites passed, 261 unit tests passed (`npm run test:api`).
- **`message-validator.test.ts`**: 5 tests verifying schema validity, channel/category/priority enums, missing field detection, invalid JSON handling, and header extraction.
- **`notification-consumer.test.ts`**: 6 tests verifying successful processing, offset commits, replay lifecycle event emission, uncommitted error resilience, malformed message offset commits, and lifecycle start/stop instrumentation.

### 12.2 Integration Tests
- **Integration Test Suite**: 9 test suites passed, 65 integration tests passed (`npm run test:integration`).
- **`kafka-consumer.integration.test.ts`**:
  - Controlled processing mode switching (`bullmq` vs `kafka`).
  - Truthful timeline verification (verifying absence of `JOB_QUEUED` in Kafka mode).
  - End-to-end ingestion → outbox publish → Kafka consumption → database delivery.
  - Replay execution event emission (`REPLAY_STARTED`, `REPLAY_COMPLETED`).
  - Error resilience and uncommitted offset verification.

### 12.3 Typecheck & Lint
- `npm run build --workspace=apps/api` (`tsc`): Passed with 0 errors.
- `npm run lint`: Passed with 0 errors.

---

## 13. Files Added and Modified

### Added:
- `apps/api/src/infrastructure/kafka/message-validator.ts`
- `apps/api/src/infrastructure/kafka/notification-consumer.ts`
- `apps/api/src/infrastructure/kafka/scripts/start-consumer.ts`
- `apps/api/src/__tests__/infrastructure/kafka/message-validator.test.ts`
- `apps/api/src/__tests__/infrastructure/kafka/notification-consumer.test.ts`
- `apps/api/src/__tests__/integration/kafka-consumer.integration.test.ts`

### Modified:
- `apps/api/src/config/env.ts` (Added `notificationProcessingMode`, `kafkaConsumerGroupId`, `kafkaConsumerConcurrency`)
- `.env.example` (Documented new consumer configuration variables)
- `apps/api/src/modules/notifications/services/notification-service.ts` (Conditional mode routing & truthful event emission)
- `apps/api/package.json` (Added `worker:kafka` script)

---

## 14. Production Readiness & Operational Verification

1. **Dual-Stack Support**: Operators can toggle `NOTIFICATION_PROCESSING_MODE=bullmq` or `NOTIFICATION_PROCESSING_MODE=kafka` without zero-downtime database migrations.
2. **Crash Resilience**: Uncommitted offsets ensure that killing worker processes results in seamless partition rebalance and re-processing.
3. **Log Correlation**: All consumer logs contain structured fields (`notificationId`, `eventId`, `topic`, `partition`, `offset`, `correlationId`).

---

## 15. Strict Scope Adherence & Out-of-Scope Boundaries

- **No Retries or DLQ Processing**: Consumer groups are NOT attached to `notifications.retry` or `notifications.dlq` (reserved for Phase 19).
- **No Provider Modifications**: Existing provider interfaces and delivery services remain untouched.
- **No Git Commits or Pushes**: Preserved local working directory state without committing.

---

## 16. Architectural Guarantees & Correctness Summary

| Property | Guarantee | Mechanism |
| :--- | :--- | :--- |
| **Atomicity** | Guaranteed | Database transaction commits Notification & OutboxEvent simultaneously |
| **Ordering** | Per-User Key Ordering | Kafka partition key = `userId` |
| **At-Least-Once** | Guaranteed | Offset committed only after PostgreSQL delivery state is updated |
| **Truthful Timeline** | Guaranteed | `JOB_QUEUED` omitted in Kafka mode; `REPLAY_*` emitted only for replays |
| **Non-Blocking Poison Pill** | Guaranteed | Malformed messages commit offset and log alert without halting queue |

---

## 17. Backward Compatibility Assessment

- BullMQ workers and existing BullMQ queues remain 100% operational.
- Existing REST endpoints (`POST /api/v1/notifications`, `GET /api/v1/notifications/:id`) operate transparently without breaking changes.
- All existing tests pass without regressions.

---

## 18. Key Decisions & Rationales

1. **Manual Commit over Auto-Commit**: Auto-commit creates at-most-once risk if workers crash mid-delivery. Disabling auto-commit guarantees at-least-once reliability.
2. **Conditional Mode Switch**: `NOTIFICATION_PROCESSING_MODE` allows safe canary testing and seamless transition between BullMQ and Kafka.
3. **Payload Contract Re-use**: Using the Phase 16 `PulseTraceOutboxPayload` schema ensures strict consistency between the Outbox table, Kafka topic, and consumer worker.

---

## 19. Transition to Phase 19

Phase 18 completes the core Kafka consumption and processing pipeline. PulseTrace is now ready for **Phase 19: Kafka Retry Topics & Dead-Letter Queue (DLQ) Architecture**, which will introduce delayed retry scheduling, retry consumer groups on `notifications.retry`, exponential backoff intervals, and DLQ routing on `notifications.dlq`.
