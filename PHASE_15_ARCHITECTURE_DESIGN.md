# PHASE 15 — PULSETRACE DISTRIBUTED NOTIFICATION ARCHITECTURE DESIGN

**Document Version:** 1.1.0  
**Status:** Architecture Proposal / Specification — Human Approved with Amendments  
**Author:** Senior Distributed Systems Architect  
**Scope:** Distributed notification backbone design, transactional outbox, Kafka event topology, idempotent delivery, retry/DLQ mechanics, partition/scaling model, provider-level idempotency, and execution roadmap (Phases 16–29).  
**Implementation Mode:** Architecture Design Only — Zero Source / Config / DB Modifications.

---

## 1. Executive Summary

PulseTrace is an open-source, developer-first notification infrastructure platform and observability engine. In its current implementation (Phases 0–14), PulseTrace operates as a modular monolith running on Express, TypeScript, PostgreSQL (via Prisma ORM), and Redis with BullMQ managing an in-process background worker. It provides complete lifecycle event auditability, immutable timeline recording, replay capabilities, delivery analytics, and an interactive React operator dashboard.

While this foundation exhibits strong software hygiene and clear module boundaries, it operates under single-point-of-failure and ordering constraints common to simple job queue architectures:
1. **Dual-write vulnerability:** HTTP requests write to PostgreSQL and enqueue to Redis/BullMQ in separate, non-atomic operations. A crash between DB commit and queue enqueue leads to silent notification drop (or 503 error handling where DB records orphaned `FAILED` status).
2. **Single queue bottleneck and lack of partition ordering:** All notifications share a single BullMQ Redis list without partition-based key hashing, per-recipient partition ordering, or decoupled consumer group scaling.
3. **Simulated delivery and missing provider layer:** The delivery worker currently hardcodes a direct state transition (`PROCESSING` → `DELIVERED`) without invoking real third-party providers (Email/SMS/Push) or handling network timeouts, socket disconnects, and provider rate-limiting.
4. **Queue-coupled retry and missing dead-letter replay pipeline:** Retries rely on BullMQ job delay metadata; when attempts exhaust, jobs enter BullMQ failed state without a dedicated, queryable DLQ topic or stream-based operator replay mechanism.

This architecture specification details the next evolution of PulseTrace into an industrial-grade, event-driven, distributed notification engine capable of horizontal worker scale, partition-level ordered streaming, transactional outbox reliability, at-least-once event processing with duplicate-safe idempotency, and multi-channel resilience.

---

## 2. Current Architecture

### 2.1 Request and Processing Flow (Audit Verified)

In the existing codebase (`apps/api/src`), the execution flow for a notification is as follows:

```
[External Client / Dashboard]
              │ (HTTP POST /api/v1/notifications)
              ▼
    [Express API (app.ts)]
              │
    [Rate Limiter (in-memory, IP-keyed)]
              │
    [NotificationController.createNotification]
              │
    [NotificationService.createNotification]
              │
      ┌───────┴───────────────────────────────────────────────────────┐
      │ Step 1: FK Validation (User & Template lookup via Prisma)     │
      │ Step 2: DB Write -> Notifications table (Status: CREATED)      │
      │ Step 3: Event Writes -> NotificationEvents table              │
      │         (NOTIFICATION_CREATED, REQUEST_VALIDATED,             │
      │          NOTIFICATION_STORED)                                 │
      │ Step 4: DB Write -> Notifications table (Status: QUEUED)       │
      │ Step 5: Redis Write -> BullMQ Queue.add("process-notification")│
      │ Step 6: Event Write -> JOB_QUEUED                             │
      │ Step 7: HTTP 202 Accepted returned to client                  │
      └───────────────────────────────────────────────────────────────┘
                                      │
                         [Redis 7 (BullMQ List)]
                                      │
                         [NotificationWorker (server.ts)]
                                      │ (concurrency: 1)
      ┌───────────────────────────────┴───────────────────────────────┐
      │ Step 8:  Worker receives job (jobId, notificationId)          │
      │ Step 9:  Check ReplayExecution (if replayed, emit             │
      │          REPLAY_STARTED event)                                │
      │ Step 10: DB Update -> Status: PROCESSING                      │
      │ Step 11: Event Write -> WORKER_STARTED                        │
      │ Step 12: Simulated Delivery (Hardcoded transition)           │
      │ Step 13: DB Update -> Status: DELIVERED                       │
      │ Step 14: Event Write -> WORKER_COMPLETED                      │
      │ Step 15: If replayed, emit REPLAY_COMPLETED event             │
      └───────────────────────────────────────────────────────────────┘
                                      │
                       [PostgreSQL (Event Timeline)]
                                      │
                       [React Dashboard (Polling/React Query)]
```

### 2.2 Component State Classification

Based on direct file inspection of the repository:

| Component / Subsystem | Repository Implementation File | Current Implementation State | Audit Observations |
|---|---|---|---|
| **REST API Routing** | `apps/api/src/modules/notifications/routes/` | **Confirmed Implementation** | Express 4.x, Helmet, strict DTO schema validation, UUID formatting, pagination, RFC-compliant error envelope. |
| **Persistence Layer** | `apps/api/src/infrastructure/database/prisma.ts` | **Confirmed Implementation** | PostgreSQL 16 with Prisma ORM; 6 models (`User`, `Template`, `Notification`, `NotificationEvent`, `ReplayExecution`, `UserPreference`). |
| **Job Queue** | `apps/api/src/infrastructure/queue/notification-queue.ts` | **Confirmed Implementation** | BullMQ 5.x backed by Redis 7; single queue named `notifications`, single job name `process-notification`. |
| **Worker Engine** | `apps/api/src/infrastructure/queue/notification-worker.ts` | **Confirmed Implementation** | Single worker instance instantiated directly inside `server.ts` with `concurrency: 1`. |
| **Channel Delivery** | `apps/api/src/modules/notifications/services/notification-service.ts` | **Simulated Behavior** | Lines 76–80: Direct mock status update (`PROCESSING` → `DELIVERED`). No external provider SDKs (Resend, Twilio, SendGrid, FCM, APNS) are integrated. |
| **Preference Engine** | `apps/api/prisma/schema.prisma` | **Partial / Missing Execution** | `UserPreference` table exists with unique constraint `(userId, channel, category)`, but preference evaluation logic is bypassed during job execution in `NotificationService`. |
| **Template Rendering** | `apps/api/prisma/schema.prisma` | **Partial / Missing Execution** | `Template` table exists with body and subject strings, but variable substitution / mustache rendering is not executed in `processNotification`. |
| **Replay System** | `apps/api/src/modules/replay/services/replay-service.ts` | **Confirmed Implementation** | Clones original notification, creates `ReplayExecution` audit record, emits `REPLAY_REQUESTED`, queues new notification. |
| **Analytics Engine** | `apps/api/src/modules/analytics/repositories/prisma-analytics-repository.ts` | **Confirmed Implementation** | Native PostgreSQL aggregation queries (`date_trunc`, `COUNT(*) FILTER`, `groupBy`) for dashboard metric cards and charts. |
| **Monitoring Probes** | `apps/api/src/modules/monitoring/repositories/bullmq-monitoring-repository.ts` | **Confirmed Implementation** | Probes DB (`SELECT 1`), Redis ping, BullMQ queue pause state, and returns active/waiting/failed counts. |
| **Rate Limiting** | `apps/api/src/shared/middleware/rate-limit.ts` | **Partial (In-Memory)** | Uses `express-rate-limit` with default MemoryStore. Resets upon server restart and does not share state across multiple API instances. |

---

## 3. Current Limitations & Architectural Gaps

The current architecture, while robust for an MVP, presents fundamental distributed systems bottlenecks:

1. **Dual-Write Vulnerability (Lack of Transactional Outbox):**
   In `NotificationService.createNotification`, the application creates a notification in PostgreSQL and then calls `queue.addNotificationJob(notification.id)`. If Redis is partitioned or the API process terminates between the DB commit and the Redis call, the notification remains in `QUEUED` or `FAILED` state without ever being processed. Conversely, if queueing succeeded before committing the DB transaction, the worker would read a non-existent notification ID.
2. **BullMQ as a Global FIFO Queue (Lack of Sharded Key Partitioning):**
   BullMQ operates on Redis lists/zsets. It lacks native partition key hashing. In a high-throughput multi-user environment, high-volume transactional traffic from a single user blocks critical security notifications of other users unless separate queues are manually wired.
3. **In-Process Worker Co-location:**
   The BullMQ worker runs in the same Node.js event loop as the Express HTTP server (`server.ts:12-16`). CPU-intensive tasks (e.g., payload parsing, template rendering, compression) degrade HTTP request latency.
4. **Lack of Idempotent Consumer & Provider Deduplication Guards:**
   If a network glitch occurs after a worker invokes an external provider but before acknowledging BullMQ, the job is retried by BullMQ. Without atomic idempotency locking and provider-level idempotency key propagation, duplicate processing can occur.
5. **Memory-Bound Rate Limiting:**
   `express-rate-limit` uses an in-process memory hash table. When the API scales horizontally behind nginx or a cloud load balancer, rate limits are multiplied by the number of API replicas.
6. **Simulated Provider and Lack of Provider Fault Tolerance:**
   Because delivery is simulated, the system currently does not model provider timeouts, transient 5xx responses, circuit breaker trips, or provider-specific rate limit headers (`Retry-After`).
7. **No Real Event Streaming Log / Consumer Group Decoupling:**
   BullMQ removes completed jobs based on TTL (`removeOnComplete: { age: 86400 }`). It cannot serve as an immutable, replayable event log for downstream analytical pipelines, audit indexing, or secondary consumer groups.

---

## 4. Target Architecture

The target architecture decouples ingestion, persistence, event dispatch, and delivery execution into a resilient, event-driven distributed system.

```
                                  [EXTERNAL CLIENTS]
                                           │
                                           │ HTTPS (POST /api/v1/notifications)
                                           ▼
                                    [NGINX REVERSE PROXY]
                                           │
                                           │ (X-Forwarded-For, X-Request-ID)
                                           ▼
                                 [PULSETRACE INGRESS API]
                               (Stateless Express Cluster)
                                           │
                        ┌──────────────────┴──────────────────┐
                        │  Distributed Redis Rate Limiter     │
                        │  (Sliding Window Token Bucket)      │
                        └──────────────────┬──────────────────┘
                                           │
                                           ▼
                              [POSTGRESQL ACID TRANSACTION]
                      ┌──────────────────────────────────────────────┐
                      │ 1. INSERT INTO "Notifications"               │
                      │ 2. INSERT INTO "NotificationEvents"          │
                      │ 3. INSERT INTO "OutboxEvents" (status=PENDING│
                      └──────────────────────┬───────────────────────┘
                                             │
                       HTTP 202 Accepted     │ (Async decoupled)
                       {"id": "...",         ▼
                        "status": "QUEUED"}  [TRANSACTIONAL OUTBOX PUBLISHER]
                                             │ (Polling Skip Locked / CDC Engine)
                                             │
                                             ▼
                                    [APACHE KAFKA CLUSTER]
    ┌────────────────────────────────────────┴────────────────────────────────────────┐
    │                                                                                 │
    ▼                                        ▼                                        ▼
[Topic: notifications.high]          [Topic: notifications.normal]           [Topic: notifications.low]
(Partitions 0..N-1, Key: userId)     (Partitions 0..N-1, Key: userId)        (Partitions 0..N-1, Key: userId)
    │                                        │                                        │
    └────────────────────────────────────────┼────────────────────────────────────────┘
                                             │
                                             ▼
                               [KAFKA CONSUMER WORKER POOL]
                           (Consumer Group: pulsetrace-delivery-workers)
                                             │
            ┌────────────────────────────────┼────────────────────────────────┐
            │                                │                                │
            ▼                                ▼                                ▼
    [Worker Instance 1]              [Worker Instance 2]              [Worker Instance N]
  (Assigned: Partitions)           (Assigned: Partitions)           (Assigned: Partitions)
            │                                │                                │
            └────────────────────────────────┼────────────────────────────────┘
                                             │
                                             ▼
                                 [EXECUTION PIPELINE]
  ┌──────────────────────────────────────────────────────────────────────────────────────────┐
  │ 1. Atomic Idempotency Check (Redis SET NX EX -> Key: idemp:delivery:{notification_id}) │
  │ 2. Preference Engine (Query cached UserPreferences -> verify channel/quiet hours)       │
  │ 3. Template Resolution & Rendering (Mustache compilation of variables + body)            │
  │ 4. Channel Adapter Invocation (Resend / Twilio with Idempotency Key & Timeout)           │
  │ 5. DB State Update ("Notifications" status -> DELIVERED / FAILED)                        │
  │ 6. Append Immutable Event ("NotificationEvents" -> DELIVERY_SUCCEEDED / DELIVERY_FAILED) │
  │ 7. Commit Kafka Partition Offset (Manual Ack)                                            │
  └──────────────────────────────────────────┬───────────────────────────────────────────────┘
                                             │
                  ┌──────────────────────────┴──────────────────────────┐
                  │                                                     │
         [SUCCESSFUL DELIVERY]                                  [TRANSIENT FAILURE]
                  │                                                     │
                  ▼                                                     ▼
      Notification: DELIVERED                                 [RETRY ENGINE]
      Event: DELIVERY_SUCCEEDED                               (Exponential Backoff + Jitter)
                                                                        │
                                              ┌─────────────────────────┴─────────────────────────┐
                                              │ Attempts < Max (e.g. 5)                           │ Attempts Exhausted
                                              ▼                                                   ▼
                                  [Delayed Retry Scheduler]                              [Topic: notifications.dlq]
                                  (Redis ZSET Delay Queue)                                        │
                                              │                                                   ▼
                                              ▼ (When timer expires)                    Notification: DLQ
                                  [Topic: notifications.retry]                          Event: DLQ_MOVED
                                              │                                                   │
                                              ▼                                                   ▼
                                  [Worker Consumes & Retries]                           [OPERATOR REPLAY DASHBOARD]
                                                                                        (POST /api/v1/replay)
                                                                                                  │
                                                                                                  ▼
                                                                                        [Publish to Ingress Kafka]
```

---

## 5. Technology Responsibility Matrix (Redis vs. Kafka vs. PostgreSQL)

To prevent technology sprawl and eliminate overlapping queue systems, each data store is assigned strict, non-negotiable boundaries:

| Technology | Core Responsibility | Prohibited Responsibility | Rationale |
|---|---|---|---|
| **PostgreSQL 16** | **Canonical Source of Truth & State Store**<br>• Relational entity persistence (`Notifications`, `Users`, `Templates`, `Preferences`)<br>• Append-only immutable audit log (`NotificationEvents`)<br>• Transactional Outbox table (`OutboxEvents`)<br>• Replay lineage mapping (`ReplayExecutions`) | Must NOT act as an in-memory job queue or high-frequency distributed lock manager. | Provides ACID transactional guarantees required for atomic outbox commits and relational integrity for timeline querying. |
| **Apache Kafka** | **Distributed Event Backbone & Pipeline Transport**<br>• Partition-ordered notification streaming (within individual topic partitions)<br>• Consumer group worker scaling and partition balancing<br>• Replayable event stream and Dead-Letter Queue buffer<br>• Decoupled analytical event consumption | Must NOT store mutable business entities or serve as the query engine for random-access UI dashboard reads. | High-throughput, distributed log partitioning provides per-partition sequential ordering while allowing linear horizontal consumer scaling. |
| **Redis 7** | **Ephemeral Coordination, Caching & Delayed Scheduling**<br>• Atomic idempotency locking (`SET NX EX`)<br>• Distributed sliding-window API rate limiting<br>• User preference and template compilation caching<br>• Delayed retry scheduling (ZSET timestamp score index) | Must NOT store canonical business data or primary event history without DB persistence. | Sub-millisecond in-memory data structures enable fast lock acquisition and rate limit checks without placing lock contention on PostgreSQL. |
| **BullMQ** | **Phase-Out / Replaced by Kafka + Redis ZSET**<br>• Core async notification queueing transitions to Kafka.<br>• Delayed retries handled via a lightweight Redis ZSET scheduler.<br>• Co-located BullMQ worker decommissioned. | Must NOT coexist as a parallel redundant queue for the primary notification pipeline. | Maintaining two distinct queuing systems (Kafka + BullMQ) creates operational overhead, split monitoring, and duplicate message lifecycles. |

---

## 6. Kafka Infrastructure & Topic Topology

### 6.1 Topic Definitions

The Kafka topology is designed with minimal topic complexity while maintaining strict segregation between standard execution, retries, priority traffic, and dead-letter handling.

| Topic Name | Purpose | Producers | Consumers | Retention Policy | Cleanup Policy |
|---|---|---|---|---|---|
| `notifications.high` | High/Critical priority notifications (e.g., OTPs, Security alerts, 2FA). | Outbox Publisher | Worker Pool (`pulsetrace-delivery-workers`) | 3 Days (259,200s) | `delete` |
| `notifications.normal` | Default/Standard priority notifications (e.g., Transactional receipts, Billing). | Outbox Publisher | Worker Pool (`pulsetrace-delivery-workers`) | 3 Days (259,200s) | `delete` |
| `notifications.low` | Low priority/Bulk notifications (e.g., Marketing, System digests, Informational). | Outbox Publisher | Worker Pool (`pulsetrace-delivery-workers`) | 2 Days (172,800s) | `delete` |
| `notifications.retry` | Re-enqueued notification attempts scheduled for immediate execution after backoff delay. | Retry Scheduler Daemon | Worker Pool (`pulsetrace-delivery-workers`) | 3 Days (259,200s) | `delete` |
| `notifications.dlq` | Poison pill messages, permanent failure events, and exhausted retry payloads for audit & manual triage. | Worker Pool | DLQ Monitor / Operator Replay Service | 14 Days (1,209,600s) | `delete` |

### 6.2 Partition Strategy & Message Key Hashing

#### Partition Count
* **Initial / Development Baseline:** All primary topics (`notifications.*`) are configured with **4 initial partitions** (Partitions 0, 1, 2, 3) for the development and initial rehearsal environment.
* **Production Sizing Criteria:** The partition count is an operational deployment parameter, not a static architecture constraint. In production environments, partition counts are determined based on:
  1. Target ingress throughput requirements.
  2. Desired consumer worker parallelism.
  3. Per-partition ordering constraints.
  4. Kafka broker cluster capacity and disk I/O characteristics.
  5. Data retention and disk storage limits.

#### Partitioning Key: `userId`
* **Selected Key:** `userId` (UUID string)
* **Kafka Partition Formula:** `partition = MurmurHash2(userId) % partition_count`
* **Tradeoff Analysis (`userId` vs `notificationId` vs `tenantId`):**
  * *`notificationId`:* Distributes load uniformly across all partitions with zero hot spotting, but provides **zero ordering guarantees** between related user notifications.
  * *`tenantId`:* Causes severe partition skew (hot partitions) if a single enterprise tenant sends a large fraction of platform traffic.
  * *`userId`:* Provides high-cardinality distribution across partitions via MurmurHash2 while ensuring events for a specific user on a given topic map to the same partition.

#### Priority Topics vs. Per-User Ordering (Architectural Clarification)

> [!IMPORTANT]
> **Ordering Guarantee Boundary:**
> Kafka guarantees message ordering **strictly within a single partition of a single topic**. When messages share the `userId` partition key, ordering is preserved only for events routed to the same topic partition.

**Tradeoff between Priority Isolation and Cross-Priority Ordering:**
* In this architecture, notifications are routed to separate priority topics (`notifications.high`, `notifications.normal`, `notifications.low`) to allow dedicated consumer worker allocations and prevent high-volume bulk traffic from starving urgent security alerts.
* **Limitation:** Because separate priority topics represent independent Kafka logs with independent consumer offsets and consumption speeds, strict cross-priority per-user FIFO ordering **cannot be guaranteed across multiple priority topics**.
* *Example:* If User X receives Notification A (NORMAL: Monthly Statement) followed 100ms later by Notification B (HIGH: 2FA Login Code), Notification B on `notifications.high` will be consumed and delivered ahead of Notification A. This is the desired behavior for priority latency, but it represents an explicit departure from global cross-priority FIFO ordering.
* **PulseTrace Design Position:** PulseTrace guarantees causal message ordering within a single topic partition for events sharing the same `userId` partition key. Cross-priority ordering across separate Kafka topics is explicitly not guaranteed.

#### Dynamic Partition Expansion Behavior
If partition count is scaled in production (e.g. from 4 to 8):
* Existing unconsumed messages in previous partitions continue being processed in sequence.
* New messages hash to the updated modulo (`% N`), routing to the new partition layout. Per-user ordering on a given topic is preserved once legacy partition lags drain.

### 6.3 Consumer Group Architecture & Rebalance Behavior

```
               [Topic: notifications.normal (4 Initial Partitions)]
               ┌─────────────┬─────────────┬─────────────┬─────────────┐
               │ Partition 0 │ Partition 1 │ Partition 2 │ Partition 3 │
               └──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┘
                      │             │             │             │
        ┌─────────────┴─────────────┐             │             │
        │                           │             │             │
        ▼                           ▼             ▼             ▼
[Worker Node A]             [Worker Node B] [Worker Node C] [Worker Node D (Idle/Standby)]
(Assigned: P0, P1)          (Assigned: P2)  (Assigned: P3)  (No partition assigned)
```

* **Consumer Group ID:** `pulsetrace-delivery-workers`
* **Assignment Strategy:** `CooperativeStickyAssignor` (prevents stop-the-world rebalances during rolling deployments).
* **Failure & Rebalance Scenarios:**
  * **Worker Crash:** If Worker B crashes, Kafka Broker detects missed heartbeats (`session.timeout.ms = 45000`, `heartbeat.interval.ms = 15000`). Broker triggers a cooperative rebalance, revoking Partition 2 and reassigning it to Worker A or Worker D without interrupting Partition 0, 1, or 3.
  * **Worker Scale-Up (1 → 2 → 4):**
    * *1 Worker:* Handles Partitions 0, 1, 2, 3.
    * *2 Workers:* Worker 1 handles P0, P1; Worker 2 handles P2, P3.
    * *4 Workers:* Each worker handles exactly 1 partition.
    * *N > Partitions:* Surplus workers enter standby, ready to assume partitions immediately upon worker failure.
  * **Offset Commit Strategy:** **Manual Asynchronous Offset Commit (`enable.auto.commit = false`).** A message offset is committed only after:
    1. Provider response is received.
    2. PostgreSQL `Notification` status and `NotificationEvents` are successfully committed.

---

## 7. Event Model Specification

All events traversing the Kafka cluster and persisting in PostgreSQL follow a strictly typed, immutable JSON Schema specification.

### 7.1 Distributed Event Schema (`PulseTraceEvent`)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PulseTraceEvent",
  "type": "object",
  "required": [
    "eventId",
    "eventType",
    "notificationId",
    "userId",
    "templateId",
    "channel",
    "category",
    "priority",
    "payload",
    "idempotencyKey",
    "correlationId",
    "timestamp",
    "retryCount"
  ],
  "properties": {
    "eventId": {
      "type": "string",
      "format": "uuid",
      "description": "Unique identifier for this specific event occurrence."
    },
    "eventType": {
      "type": "string",
      "enum": [
        "NOTIFICATION_CREATED",
        "REQUEST_VALIDATED",
        "NOTIFICATION_STORED",
        "OUTBOX_PUBLISHED",
        "WORKER_STARTED",
        "WORKER_COMPLETED",
        "PREFERENCE_CHECKED",
        "TEMPLATE_RESOLVED",
        "TEMPLATE_RENDERED",
        "CHANNEL_SELECTED",
        "PROVIDER_INVOKED",
        "DELIVERY_SUCCEEDED",
        "DELIVERY_FAILED",
        "RETRY_SCHEDULED",
        "RETRY_STARTED",
        "DLQ_MOVED",
        "REPLAY_REQUESTED",
        "REPLAY_STARTED",
        "REPLAY_COMPLETED"
      ]
    },
    "notificationId": {
      "type": "string",
      "format": "uuid",
      "description": "Canonical ID of the target notification record in PostgreSQL."
    },
    "userId": {
      "type": "string",
      "format": "uuid",
      "description": "Target recipient user ID (also acts as Kafka partition key)."
    },
    "templateId": {
      "type": "string",
      "format": "uuid",
      "description": "Associated notification template identifier."
    },
    "channel": {
      "type": "string",
      "enum": ["EMAIL", "SMS", "IN_APP", "PUSH"]
    },
    "category": {
      "type": "string",
      "enum": ["TRANSACTIONAL", "SECURITY", "SYSTEM", "INFORMATIONAL"]
    },
    "priority": {
      "type": "string",
      "enum": ["LOW", "NORMAL", "HIGH", "CRITICAL"]
    },
    "payload": {
      "type": "object",
      "description": "Dynamic template variables and substitution data."
    },
    "idempotencyKey": {
      "type": "string",
      "description": "Client-supplied or system-generated unique deduplication key."
    },
    "correlationId": {
      "type": "string",
      "description": "Distributed trace identifier propagating across all micro-hops and logs."
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO-8601 UTC timestamp of event generation."
    },
    "retryCount": {
      "type": "integer",
      "minimum": 0,
      "description": "Zero-indexed counter of previous failed attempts."
    },
    "metadata": {
      "type": "object",
      "properties": {
        "executionId": { "type": "string" },
        "workerId": { "type": "string" },
        "provider": { "type": "string" },
        "providerMessageId": { "type": "string" },
        "latencyMs": { "type": "number" },
        "error": { "type": "string" },
        "replayedFrom": { "type": "string" }
      }
    }
  }
}
```

### 7.2 Event Immutability Rules
* **Immutable Fields:** Once an event is written to `NotificationEvents` or published to Kafka, its fields can never be updated, patched, or deleted.
* **State Evolution through Append-Only Progression:** Status changes from `QUEUED` to `PROCESSING`, `DELIVERED`, or `FAILED` generate new timestamped event rows referencing the immutable `notificationId`.

---

## 8. Transactional Outbox Pattern Design

To eliminate dual-write inconsistencies between PostgreSQL and Kafka, PulseTrace implements the **Transactional Outbox Pattern**.

### 8.1 Database Schema (`OutboxEvents`)

```sql
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');

CREATE TABLE "OutboxEvents" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "aggregateType" VARCHAR(64) NOT NULL DEFAULT 'Notification',
    "aggregateId" UUID NOT NULL,
    "eventType" VARCHAR(64) NOT NULL,
    "topic" VARCHAR(128) NOT NULL,
    "partitionKey" VARCHAR(128) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INT NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lockedAt" TIMESTAMPTZ,
    "lockedBy" VARCHAR(128),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "publishedAt" TIMESTAMPTZ
);

-- Compound index for fast batch polling by outbox publisher workers
CREATE INDEX "idx_outbox_status_created" ON "OutboxEvents" ("status", "createdAt") 
WHERE "status" IN ('PENDING', 'FAILED');

CREATE INDEX "idx_outbox_aggregate" ON "OutboxEvents" ("aggregateId");
```

### 8.2 Ingress Ingestion Workflow

When a client calls `POST /api/v1/notifications`:

```
POST /api/v1/notifications
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ BEGIN PostgreSQL Transaction (SERIALIZABLE / READ COMMITTED with Locks)     │
│                                                                             │
│ 1. INSERT INTO "Notifications" (id, userId, templateId, channel,           │
│                                 status='QUEUED', payload, metadata)         │
│ 2. INSERT INTO "NotificationEvents" (notificationId, eventType='NOTIFICATION_STORED',│
│                                     statusBefore='CREATED', statusAfter='QUEUED')    │
│ 3. INSERT INTO "OutboxEvents" (aggregateId=notification.id,                │
│                                topic='notifications.normal',                │
│                                partitionKey=userId,                         │
│                                payload=PulseTraceEventJSON,                 │
│                                status='PENDING')                            │
│                                                                             │
│ COMMIT Transaction                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
HTTP 202 Accepted {"id": "...", "status": "QUEUED"}
```

### 8.3 Outbox Publisher Engine & Lock-Free Batch Claiming

The Outbox Publisher runs as a dedicated, lightweight background process (or cluster of processes) executing a continuous polling loop with PostgreSQL `SKIP LOCKED`:

```sql
-- Batch claiming query (Safe for multiple concurrent outbox publisher nodes)
UPDATE "OutboxEvents"
SET 
    "status" = 'PROCESSING',
    "lockedAt" = NOW(),
    "lockedBy" = 'outbox-publisher-pod-1'
WHERE "id" IN (
    SELECT "id"
    FROM "OutboxEvents"
    WHERE "status" IN ('PENDING', 'FAILED')
      AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - INTERVAL '30 seconds')
      AND "retryCount" < 5
    ORDER BY "createdAt" ASC
    LIMIT 100
    FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

#### Step-by-Step Publishing Lifecycle:
1. Publisher claims a batch of 100 rows using `FOR UPDATE SKIP LOCKED`.
2. For each row, publisher produces to Kafka:
   * **Topic:** `row.topic`
   * **Key:** `row.partitionKey` (`userId`)
   * **Value:** `row.payload`
   * **Producer Config:** `acks = all`, `enable.idempotence = true`, `retries = 3`.
3. Upon Kafka producer ACK receipt:
   ```sql
   UPDATE "OutboxEvents"
   SET "status" = 'PUBLISHED', "publishedAt" = NOW(), "lockedAt" = NULL
   WHERE "id" = :id;
   ```
4. If Kafka publishing rejects or times out:
   ```sql
   UPDATE "OutboxEvents"
   SET "status" = 'FAILED', "retryCount" = "retryCount" + 1, 
       "lastError" = :errorMessage, "lockedAt" = NULL
   WHERE "id" = :id;
   ```

### 8.4 Failure Scenarios & Self-Healing Guarantees

```
Scenario A: DB Write Succeeds, Kafka Broker is Down
────────────────────────────────────────────────────
1. Client transaction commits to PostgreSQL successfully.
2. HTTP 202 is returned to client. Outbox row exists with status='PENDING'.
3. Outbox Publisher attempts to publish to Kafka -> Broker connection fails.
4. Outbox Publisher marks row status='FAILED', logs error, backs off.
5. Notification data is 100% safe in PostgreSQL.
6. When Kafka recovers, next polling cycle claims the PENDING/FAILED row and publishes. Zero data loss.

Scenario B: Kafka Publish Succeeds, Outbox Publisher Crashes Before DB Update
────────────────────────────────────────────────────────────────────────────
1. Publisher sends message to Kafka; Kafka appends message to topic log.
2. Publisher process is SIGKILLed before executing `UPDATE "OutboxEvents" SET status='PUBLISHED'`.
3. Outbox row remains with status='PROCESSING' and lockedAt timestamp.
4. After 30 seconds, lock expires. Another publisher instance reclaims the row and publishes to Kafka.
5. Result: Kafka receives a duplicate message.
6. Target Mitigation: Downstream worker idempotency layer and provider-level idempotency keys handle duplicate events safely.
```

---

## 9. Delivery Semantics, Idempotency & Provider Boundaries

### 9.1 Delivery Semantic Classification

> [!IMPORTANT]
> **Architectural Position on Delivery Semantics:**
> PulseTrace uses **at-least-once event processing with duplicate-safe idempotency**. Exactly-once external delivery effects depend on downstream provider support for idempotency keys or equivalent deduplication semantics. PulseTrace does NOT claim universal exactly-once external notification delivery.

#### Layer-by-Layer Semantic Boundaries:

| Architectural Layer | Processing Semantics | System Behavior & Edge Case Analysis |
|---|---|---|
| **Kafka Event Transport** | **At-Least-Once** | Guaranteed zero message loss. Producer retries, network glitches, or consumer rebalances can cause identical messages to arrive at worker nodes more than once. |
| **PulseTrace Database State** | **At-Least-Once / Durable** | PostgreSQL ACID transactions ensure `Notifications` status and append-only `NotificationEvents` transition consistently. |
| **Worker Execution Pipeline** | **Idempotent Consumer** | Redis fast-locking (`SET NX EX`) and PostgreSQL conditional updates prevent redundant internal processing of the same notification. |
| **Downstream Provider API** | **Provider-Dependent** | • **Idempotent Providers (e.g., Resend, Stripe, modern SMS APIs):** Accept `Idempotency-Key` or client request ID. Replayed requests return the original result without re-sending the message.<br>• **Non-Idempotent Providers:** Standard HTTP POST without deduplication. Repeated requests will result in repeated external delivery. |
| **Actual External Delivery** | **At-Least-Once (Realistic)** | If a worker crashes immediately after a non-idempotent provider accepts a message but before the worker records the state change or commits the Kafka offset, redelivery will invoke the provider again. This crash window is an inherent physical limitation of non-transactional third-party APIs. |

### 9.2 Two-Tier Idempotency Mechanism & Provider-Level Deduplication

To maximize delivery safety and close the duplicate window whenever supported by downstream vendors:

```
[Worker Consumes Event A (notificationId: 9b1deb4d...)]
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Redis Distributed Lock Check                             │
│    Command: SET "idemp:delivery:9b1deb4d" "PROCESSING"      │
│             NX EX 300                                       │
└────────────────────────┬────────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │ Key Already Exists (False)       │ Lock Acquired (True)
        ▼                                 ▼
┌───────────────────────────────┐ ┌───────────────────────────────────────────────┐
│ DUPLICATE DETECTED / IN-FLIGHT│ │ 2. Query PostgreSQL Current Status            │
│ Action:                       │ │    SELECT status FROM "Notifications"         │
│ - Check DB Status:            │ │    WHERE id = '9b1deb4d'                      │
│   If DELIVERED -> Commit Ack  │ └───────────────────────┬───────────────────────┘
│   If PROCESSING -> Drop & Ack │                         │
│ - Skip Provider Call          │         ┌───────────────┴───────────────┐
└───────────────────────────────┘         │ Status = DELIVERED/DLQ/SKIPPED│ Status = QUEUED/PROCESSING
                                          ▼                               ▼
                                ┌───────────────────┐ ┌───────────────────────────────────┐
                                │ Already Finalized │ │ 3. Execute Notification Engine:   │
                                │ Action:           │ │    - Resolve Template             │
                                │ - Commit Kafka    │ │    - Derive Stable Idempotency Key│
                                │   Offset          │ │      (notificationId + attempt)   │
                                │ - Return          │ │    - Call Channel Adapter with Key│
                                └───────────────────┘ └─────────────────┬─────────────────┘
                                                                        │
                                                                        ▼
                                                      ┌───────────────────────────────────┐
                                                      │ 4. Provider Call & Deduplication: │
                                                      │    Adapter sends Idempotency-Key  │
                                                      │    Provider returns 200 OK / Ack  │
                                                      └─────────────────┬─────────────────┘
                                                                        │
                                                                        ▼
                                                      ┌───────────────────────────────────┐
                                                      │ 5. Atomic PostgreSQL Update:      │
                                                      │    UPDATE "Notifications"         │
                                                      │    SET status='DELIVERED'         │
                                                      │    WHERE id='9b1deb4d'            │
                                                      │    AND status != 'DELIVERED';     │
                                                      │    INSERT INTO "NotificationEvents│
                                                      └─────────────────┬─────────────────┘
                                                                        │
                                                                        ▼
                                                      ┌───────────────────────────────────┐
                                                      │ 6. Finalize Coordination:         │
                                                      │    SET "idemp:delivery:9b1deb4d"  │
                                                      │    "DELIVERED" EX 86400 (24h)     │
                                                      │ 7. Commit Kafka Partition Offset  │
                                                      └───────────────────────────────────┘
```

#### Detailed Crash-Window Analysis:
* **Case 1: Provider Supports Idempotency Keys (Recommended):**
  1. Worker transmits request to provider with `Idempotency-Key: 9b1deb4d-...`.
  2. Provider accepts and delivers message.
  3. Worker node suffers sudden power loss before committing DB or Kafka offset.
  4. Kafka rebalances; Worker 2 picks up Event A.
  5. Worker 2 sends the request with the identical `Idempotency-Key`.
  6. Provider recognizes duplicate key, returns previous success response, and **does not send a second notification**. Duplicate avoided at the provider boundary.
* **Case 2: Provider Lacks Idempotency Support:**
  1. Worker transmits request; provider sends message.
  2. Worker crashes before committing DB or Kafka offset.
  3. Worker 2 re-consumes Event A and invokes provider again.
  4. Provider delivers message a second time.
  5. *Conclusion:* Internal Redis locking and PostgreSQL checks prevent redundant concurrency inside PulseTrace, but cannot prevent provider-side duplication without provider API cooperation.

---

## 10. Retry Engine, Exponential Backoff & Dead-Letter Queue (DLQ)

### 10.1 Error Classification

Not all errors should be retried. The Delivery Engine categorizes every provider error:

| Error Category | HTTP / System Codes | Retryable? | Behavior |
|---|---|---|---|
| **Transient Network Failure** | `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN` | **YES** | Schedule for exponential backoff retry. |
| **Provider Rate Limiting** | HTTP `429 Too Many Requests` | **YES** | Parse `Retry-After` header; schedule delayed retry. |
| **Provider Internal Server Error** | HTTP `500`, `502`, `503`, `504` | **YES** | Schedule for exponential backoff retry. |
| **Invalid Recipient / Payload** | HTTP `400 Bad Request`, `422 Unprocessable` | **NO** | Immediately mark `FAILED`, emit `DELIVERY_FAILED`, do not retry. |
| **Authentication / Config Error** | HTTP `401 Unauthorized`, `403 Forbidden` | **NO** | Immediately mark `FAILED`, trigger critical system alert. |
| **Recipient Unsubscribed / Blocked** | Preference Engine Suppression | **NO** | Mark `SKIPPED`, emit `PREFERENCE_CHECKED` with skip metadata. |

### 10.2 Exponential Backoff with Full Jitter Formula

To prevent the "thundering herd" problem on downstream providers during outages, PulseTrace uses Decorrelated Full Jitter:

$$\text{Delay}(n) = \text{random\_between}\left(0,\, \min\left(\text{Cap},\, \text{Base} \times 2^{n}\right)\right)$$

* **Base Delay:** $1.0\text{ second}$ ($1,000\text{ ms}$)
* **Multiplier:** $2.0$
* **Maximum Cap:** $300\text{ seconds}$ ($5\text{ minutes}$)
* **Maximum Attempts ($N_{\max}$):** $5\text{ attempts}$

```
Attempt 1 (Failure 1): delay = random(0, min(300, 1 * 2^1)) = random(0, 2s)
Attempt 2 (Failure 2): delay = random(0, min(300, 1 * 2^2)) = random(0, 4s)
Attempt 3 (Failure 3): delay = random(0, min(300, 1 * 2^3)) = random(0, 8s)
Attempt 4 (Failure 4): delay = random(0, min(300, 1 * 2^4)) = random(0, 16s)
Attempt 5 (Failure 5): delay = random(0, min(300, 1 * 2^5)) = random(0, 32s)
After Attempt 5 fails -> Transition to DLQ
```

### 10.3 Non-Blocking Delayed Retry Architecture (Kafka + Redis ZSET)

> [!CAUTION]
> **Anti-Pattern Warning:** Consumers must NEVER execute `Thread.sleep()` or in-memory `await delay()` inside a Kafka consumer loop. Pausing the thread halts partition consumption for all subsequent users on that partition and triggers Kafka heartbeat timeout rebalances.

PulseTrace resolves delayed retries without blocking Kafka partitions using a **Redis ZSET Delay Scheduler**:

```
[Worker Experiences Transient Error on Attempt n < 5]
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Calculate Jittered Backoff: delayMs                      │
│ 2. targetExecutionTime = Date.now() + delayMs               │
│ 3. ZADD "retry:delayed_jobs" targetExecutionTime            │
│    JSON_STRING(PulseTraceEvent with retryCount = n + 1)      │
│ 4. DB Write: Event -> RETRY_SCHEDULED                       │
│ 5. DB Write: Notification -> status = 'RETRY_PENDING'       │
│ 6. Commit Current Kafka Offset (Partition unblocked!)       │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
           [Background Retry Daemon (Polls every 500ms)]
┌─────────────────────────────────────────────────────────────┐
│ 1. ZRANGEBYSCORE "retry:delayed_jobs" -inf NOW() LIMIT 50   │
│ 2. For each ready job:                                      │
│    - Publish to Kafka Topic: "notifications.retry"          │
│    - ZREM "retry:delayed_jobs" jobPayload                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
         [Worker Pool Consumes "notifications.retry"]
         [Executes Attempt n + 1]
```

### 10.4 Dead-Letter Queue (DLQ) & Operator Replay Pipeline

When all 5 retry attempts are exhausted without successful delivery:
1. Worker creates a `DLQPayload` containing:
   * Full original notification and payload.
   * Total attempts executed ($5$).
   * Array of past error stack traces, timestamps, and provider responses.
2. Worker produces the message to Kafka topic: `notifications.dlq`.
3. Worker updates PostgreSQL:
   * `Notifications.status = 'DLQ'`.
   * Inserts `NotificationEvents` row with `eventType = 'DLQ_MOVED'`.
4. Worker commits the offset for the retry topic.

#### Replay Mechanics (Operator UI → Replay Pipeline):
When an operator investigates a failure on the dashboard and clicks **Replay**:
1. API receives `POST /api/v1/notifications/:id/replay` with `{ "reason": "Provider outage resolved" }`.
2. `ReplayService` executes within a database transaction:
   * Validates original notification is in a replayable state (`FAILED`, `DLQ`, `DELIVERED`).
   * Creates a **NEW** `Notification` record (with fresh UUID `newNotificationId`).
   * Inserts a `ReplayExecution` row (`originalNotificationId` $\to$ `newNotificationId`, `reason`, `triggeredBy`).
   * Writes `REPLAY_REQUESTED` event to `NotificationEvents`.
   * Inserts an Outbox row for the new notification targeting `notifications.normal` (or `notifications.high`).
3. The Outbox Publisher pushes the new notification into Kafka.
4. Normal delivery pipeline processes the notification with full end-to-end tracing.
5. Original notification history remains 100% immutable and intact.

---

## 11. Channel Architecture & Provider Abstraction Layer

### 11.1 Channel Adapter Interface & Idempotency Propagation

All delivery providers conform to a unified TypeScript interface with strict input normalization, timeout guards, stable idempotency keys, and normalized response structures:

```typescript
export interface DeliveryPayload {
  notificationId: string;
  idempotencyKey: string; // Stable idempotency key propagated to external vendor API
  attemptNumber: number;
  recipient: {
    userId: string;
    email?: string;
    phone?: string;
    deviceTokens?: string[];
  };
  content: {
    subject?: string;
    body: string;
    html?: string;
  };
  metadata: Record<string, unknown>;
}

export interface DeliveryResult {
  success: boolean;
  provider: string;
  providerMessageId?: string;
  latencyMs: number;
  error?: {
    code: string;
    message: string;
    isRetryable: boolean;
    rawResponse?: unknown;
  };
}

export interface ChannelAdapter {
  readonly channel: Channel;
  readonly providerName: string;
  readonly supportsProviderIdempotency: boolean;
  deliver(payload: DeliveryPayload): Promise<DeliveryResult>;
}
```

### 11.2 Concrete Adapters Scope

1. **Email Adapter (`EmailChannelAdapter`):**
   * *Primary Production Provider:* Resend SDK / AWS SES / SendGrid.
   * *Idempotency Support:* Passes `Idempotency-Key` header (`notificationId` or custom client key) to prevent double sending across retries.
   * *Fallback / Local Development:* Mock Email Adapter with configurable latency ($50\text{--}200\text{ ms}$) and failure simulation flags (`SIMULATE_EMAIL_FAILURE=true`).
   * *Timeout:* Hard abort controller timeout at $5,000\text{ ms}$.
2. **SMS Adapter (`SmsChannelAdapter`):**
   * *Primary Provider:* Twilio / MessageBird.
   * *Idempotency Support:* Twilio client-provided unique identifiers where supported.
   * *Timeout:* Hard abort controller timeout at $4,000\text{ ms}$.
3. **In-App Adapter (`InAppChannelAdapter`):**
   * *Primary Provider:* WebSocket / PostgreSQL direct In-App notification store.
   * *Timeout:* $1,000\text{ ms}$.

---

## 12. User Preferences & Dynamic Filtering

The Delivery Engine evaluates user preferences before invoking any provider adapter:

```
[Worker Fetches Notification for userId: X, channel: EMAIL, category: INFORMATIONAL]
                                   │
                                   ▼
          [Check Redis Cache: "pref:user:X" (TTL: 1 Hour)]
                                   │
                  ┌────────────────┴────────────────┐
                  │ Cache Miss                      │ Cache Hit
                  ▼                                 │
     [Query PostgreSQL "UserPreferences"]           │
     [Cache Result in Redis]                        │
                  │                                 │
                  └────────────────┬────────────────┘
                                   │
                                   ▼
                   [Evaluate Eligibility Rules]
 1. Is User Preference enabled for (channel=EMAIL, category=INFORMATIONAL)?
    - IF false -> Transition to SKIPPED, Emit PREFERENCE_CHECKED (status='SKIPPED'), Stop.
 2. Is current time within User's configured Quiet Hours (e.g. 22:00 - 08:00)?
    - IF category == 'SECURITY' or 'TRANSACTIONAL' -> Bypass Quiet Hours (Deliver).
    - IF category == 'INFORMATIONAL' -> Reschedule to next morning via Delay Scheduler.
```

---

## 13. End-to-End Failure Mode Matrix

| Failure Mode | Point of Failure | System Reaction & Recovery Protocol | Data Preserved? | Risk of Duplicate / Lost Notification? |
|---|---|---|---|---|
| **PostgreSQL Unreachable** | Ingress API POST | API returns `HTTP 503 Service Unavailable`. In-flight workers fail DB update and pause Kafka consumer partition. | Client never received 202 Ack; client retries. | **Zero Data Loss. Zero Duplicates.** |
| **Kafka Broker Outage** | Outbox Publisher | Ingress API continues writing to PostgreSQL Outbox table (`status='PENDING'`). Publisher pauses until Kafka cluster resumes. | 100% preserved in `OutboxEvents`. | **Zero Data Loss. Zero Duplicates.** |
| **Outbox Publisher Crash** | Between Kafka publish and DB status update | New publisher instance takes over expired lock ($>30\text{s}$). Re-publishes event to Kafka. | 100% preserved in DB. | Duplicate event in Kafka; **Deduplicated by worker Redis/DB guards; external vendor deduplicates if idempotency key supported.** |
| **Worker Process Crash** | During Provider Call | Kafka detects consumer heartbeat loss. Rebalances partition to another worker node. | PostgreSQL has original state. | Worker 2 checks idempotency key; provider deduplicates if idempotency key supported. |
| **Provider Network Timeout** | Adapter HTTP Call | `AbortController` triggers after $5,000\text{ms}$. Error classified as `ETIMEDOUT` (Retryable). | Recorded in `NotificationEvents` as `DELIVERY_FAILED`. | Event moved to delayed retry ZSET; retried with jitter. |
| **Provider HTTP 429 Rate Limit** | Adapter HTTP Call | Adapter reads `Retry-After: 60`. Worker schedules delayed retry in Redis ZSET for $60\text{s}$ later. | Recorded in event history. | Clean delayed retry. |
| **Permanent 400 Bad Request** | Provider Validation | Adapter classifies error as `NON_RETRYABLE`. Worker updates `status='FAILED'`, records `DELIVERY_FAILED`. | Stored in PostgreSQL with full error metadata. | No retry attempted. Fail-fast logged. |
| **Max Retries Exhausted (5/5)** | Retry Engine | Worker writes payload and attempt history to `notifications.dlq`, updates `status='DLQ'`. | Stored in Kafka DLQ topic & PostgreSQL. | Available for operator inspection and 1-click dashboard replay. |
| **Redis Crash / Outage** | Idempotency / Rate Limit | Worker falls back to PostgreSQL row-level status verification (`status != 'DELIVERED'`). Rate limiter falls back to conservative in-memory limiter. | DB remains consistent. | Temporary slight latency increase; zero message loss. |

---

## 14. Horizontal Scalability & Partitioning Model

```
                                [INGRESS TIER]
                  [API Replica 1] [API Replica 2] [API Replica 3]
                         │               │               │
                         └───────────────┼───────────────┘
                                         ▼
                         [POSTGRESQL PRIMARY + OUTBOX]
                                         │
                                         ▼
                            [OUTBOX PUBLISHER POOL]
                                         │
                                         ▼
                          [KAFKA CLUSTER (N PARTITIONS)]
                 ┌──────────────┬──────────────┬──────────────┬──────────────┐
                 │ Partition 0  │ Partition 1  │ Partition 2  │Partition N-1 │
                 └──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┘
                        │              │              │              │
                        ▼              ▼              ▼              ▼
                 [Worker Pod 1] [Worker Pod 2] [Worker Pod 3] [Worker Pod N]
                        │              │              │              │
                        └──────────────┼──────────────┘              │
                                       ▼                             ▼
                          [REDIS 7 CLUSTER / SENTINEL]   [EXTERNAL PROVIDERS]
```

### Scaling Profiles & Baseline Capacity Dimensions

* **Initial Scale Configuration:** 4 partitions per topic in development/rehearsal environment with up to 4 worker consumer instances.
* **Production Scaling Parameters:** Partition count is expanded dynamically based on aggregate message ingress volume, partition lag metrics, and consumer worker resource utilization.
* **Database Maintenance:**
  * Outbox table kept lean via scheduled purge cron (`DELETE FROM "OutboxEvents" WHERE status='PUBLISHED' AND publishedAt < NOW() - INTERVAL '24 hours'`).
  * `NotificationEvents` partitioned by timestamp range (`RANGE (occurredAt)`) for scalable historical querying.

---

## 15. Observability & Distributed Metrics Model

To provide full visibility into distributed event flows, the following Prometheus-compatible metrics will be exposed via `/metrics` and surfaced in the dashboard:

```
# API Ingress Metrics
pulsetrace_api_requests_total{route, status, method}
pulsetrace_api_latency_seconds_bucket{route, le}
pulsetrace_api_rate_limit_rejections_total{ip}

# Outbox Publisher Metrics
pulsetrace_outbox_pending_count
pulsetrace_outbox_publish_latency_seconds_bucket{topic, le}
pulsetrace_outbox_publish_errors_total{topic, error_code}

# Kafka & Consumer Metrics
pulsetrace_kafka_consumer_lag{topic, partition, consumergroup}
pulsetrace_kafka_messages_consumed_total{topic, partition}
pulsetrace_kafka_offset_commit_latency_seconds_bucket{topic, le}

# Worker & Delivery Metrics
pulsetrace_worker_active_count{worker_id}
pulsetrace_notification_delivery_duration_seconds_bucket{channel, provider, le}
pulsetrace_notification_delivery_total{channel, provider, status}
pulsetrace_idempotency_deduplications_total{channel}

# Retry & DLQ Metrics
pulsetrace_retry_scheduled_total{channel, attempt_number}
pulsetrace_dlq_messages_total{channel, reason}
pulsetrace_replay_executions_total{trigger_type}
```

---

## 16. Load & Chaos Testing Validation Strategy

### 16.1 Load Testing Suite (Phase 25)

Testing will be implemented using **k6** or **Autocannon** targeting containerized rehearsal stacks:

| Test Scenario | Volume | Duration | Target Success Criteria |
|---|---|---|---|
| **Baseline Smoke Test** | 100 notifications | Single burst ($10\text{s}$) | $100\%$ delivery, zero errors, $p95 < 200\text{ms}$. |
| **Sustained Load Test** | 1,000 notifications | $50\text{ req/sec}$ for $2\text{ min}$ | Zero outbox lag, worker lag $< 5\text{s}$, $p99 < 500\text{ms}$. |
| **Stress / Saturation Test** | 10,000 notifications | $500\text{ req/sec}$ burst | Outbox recovers within $60\text{s}$, zero lost notifications. |
| **Partition Scaling Test** | 10,000 notifications | Initial 4 Partitions / 4 Workers | Uniform distribution across partitions ($\pm 10\%$). |

### 16.2 Chaos / Fault-Injection Suite (Phase 26)

| Injected Failure Scenario | Injection Method | Expected System Behavior | Verification Criteria |
|---|---|---|---|
| **Kafka Broker Crash during High Ingestion** | `docker stop pulsetrace-kafka` | API continues accepting notifications; PostgreSQL outbox rows accumulate in `PENDING` state. | No HTTP 500 errors. When Kafka restarts, all pending outbox rows publish automatically. |
| **Worker Kill during Delivery (`SIGKILL`)** | `docker kill --signal=SIGKILL pulsetrace-worker-1` | Kafka rebalances partition to remaining workers within $45\text{s}$. Uncommitted message is re-consumed. | Idempotency guard and provider key prevent duplicate delivery; status updates to `DELIVERED`. |
| **PostgreSQL Outage** | `docker stop pulsetrace-postgres` | API returns clean 503; worker pauses consumption loop without crashing. | Stack auto-recovers upon DB container restart. |
| **Provider 500 & 429 Simulation** | Mock adapter injected with $30\%$ failure rate | Worker retries with exponential backoff and jitter; after 5 attempts, message routes to DLQ. | Timeline reflects exact failure $\to$ retry sequence; DLQ count matches expected failure rate. |
| **Duplicate Message Storm** | Inject 1,000 identical `notificationId`s into Kafka | Worker executes 1 provider delivery and drops 999 duplicate events via Redis/DB locks. | `pulsetrace_idempotency_deduplications_total == 999`. Recipient receives message without duplicate processing. |

---

## 17. Architecture Decision Records (ADRs)

### ADR-01: Apache Kafka as Primary Distributed Event Backbone
* **Context:** BullMQ operates on Redis lists without native sharded key partitioning or multi-consumer-group replay streams.
* **Decision:** Adopt Apache Kafka (KRaft mode) as the distributed messaging backbone for notification transport and lifecycle event streaming, starting with 4 initial partitions in development.
* **Alternatives Considered:** RabbitMQ, AWS SQS/SNS, Redis Streams.
* **Reason:** Kafka provides high-throughput log persistence, deterministic key-partitioned ordering (`userId`) within topic partitions, cooperative consumer group rebalancing, and long-term replay capabilities.
* **Tradeoffs:** Introduces JVM/KRaft infrastructure overhead; mitigated via Docker Compose KRaft mode (no Zookeeper required).

### ADR-02: PostgreSQL as Canonical Source of Truth & ACID Anchor
* **Context:** Notification state and relational business entities must remain strictly consistent and auditable.
* **Decision:** PostgreSQL remains the sole canonical state store and transaction coordinator for notifications, events, and templates.
* **Alternatives Considered:** MongoDB, Cassandra, DynamoDB.
* **Reason:** ACID transactions enable atomic outbox persistence; JSONB provides flexible template schemas; rich SQL aggregations power developer analytics.

### ADR-03: Transactional Outbox Pattern for Zero Data Loss Ingestion
* **Context:** Writing to PostgreSQL and publishing to Kafka in separate application calls causes dual-write inconsistencies during network or node crashes.
* **Decision:** Implement the Transactional Outbox pattern with `SKIP LOCKED` batch publishing.
* **Alternatives Considered:** 2PC (Two-Phase Commit), Change Data Capture (Debezium).
* **Reason:** `SKIP LOCKED` polling requires zero additional daemon dependencies (unlike Debezium) while guaranteeing zero message loss and complete decoupling of API ingress from Kafka availability.

### ADR-04: At-Least-Once Processing + Idempotent Consumers with Provider Deduplication
* **Context:** Distributed networks cannot provide true end-to-end exactly-once delivery across external third-party HTTP providers without 2PC.
* **Decision:** Enforce at-least-once transport in Kafka combined with two-tier consumer deduplication (Redis fast-locking + PostgreSQL atomic status guards) and propagate stable idempotency keys to external provider APIs.
* **Alternatives Considered:** Naive best-effort delivery; claiming universal exactly-once delivery.
* **Reason:** Ensures zero notification loss while closing the duplicate-delivery window whenever supported by downstream providers.

### ADR-05: Non-Blocking Retry Strategy via Redis ZSET Delay Scheduling
* **Context:** In-memory consumer sleep blocks Kafka partition polling, halting processing for all users on that partition and triggering rebalances.
* **Decision:** Offload delayed retry scheduling to a Redis ZSET index polled by a dedicated retry daemon that republishes expired jobs to `notifications.retry`.
* **Alternatives Considered:** Kafka Retry Topics with consumer delay (blocks partition), RabbitMQ Dead-Letter Exchanges.
* **Reason:** Unblocks Kafka consumer loops immediately while maintaining precision exponential backoff and jitter.

### ADR-06: Decommissioning BullMQ to Eliminate Redundant Queue Systems
* **Context:** Retaining both BullMQ and Kafka creates redundant queues, split monitoring, and confusing lifecycle state ownership.
* **Decision:** Replace BullMQ entirely with Kafka and Redis ZSET delay scheduling.
* **Alternatives Considered:** Keeping BullMQ for retries only.
* **Reason:** Single messaging model streamlines architecture, simplifies debugging, and reduces container footprint.

### ADR-07: Partitioning Key on `userId` (Partition-Level Ordering)
* **Context:** Notifications require high concurrency across partitions but benefit from sequential ordering per recipient on a given topic.
* **Decision:** Partition Kafka topics using `userId` as the message key.
* **Alternatives Considered:** `notificationId` (no ordering), `tenantId` (hot partition risk).
* **Reason:** Guarantees causal ordering within a topic partition for a specific user with uniform MurmurHash2 distribution across partitions. Cross-priority ordering across separate Kafka topics is explicitly not guaranteed.

---

## 18. Database Schema Evolution Plan (Phase 16 Specification)

```prisma
// ============================================================================
// Proposed Target Prisma Schema Additions (For Phase 16 Execution)
// ============================================================================

enum OutboxStatus {
  PENDING
  PROCESSING
  PUBLISHED
  FAILED
}

model OutboxEvent {
  id            String       @id @default(uuid())
  aggregateType String       @default("Notification")
  aggregateId   String
  eventType     EventType
  topic         String
  partitionKey  String
  payload       Json         @db.JsonB
  status        OutboxStatus @default(PENDING)
  retryCount    Int          @default(0)
  lastError     String?
  lockedAt      DateTime?
  lockedBy      String?
  createdAt     DateTime     @default(now())
  publishedAt   DateTime?

  @@index([status, createdAt])
  @@index([aggregateId])
  @@map("OutboxEvents")
}

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

---

## 19. Current vs. Target Architecture Comparison

| Architectural Dimension | Current PulseTrace (v1.0 MVP) | Target PulseTrace (v2.0 Distributed Engine) |
|---|---|---|
| **Ingress Ingestion Pattern** | Direct Dual-Write (Postgres write $\to$ BullMQ Redis enqueue). Vulnerable to crash between operations. | **Transactional Outbox Pattern** (Postgres Notification + Outbox atomic commit $\to$ Async Publisher). |
| **Message Transport** | Redis-backed BullMQ single FIFO list. | **Apache Kafka** partitioned topic cluster (`notifications.high/normal/low`). |
| **Ordering Guarantees** | None (FIFO queue with global worker concurrency). | **Per-Partition Causal Per-User Ordering** within a topic via `userId` partition hashing. Cross-priority ordering across separate topics is not guaranteed. |
| **Worker Execution** | In-process worker thread running in Express event loop (`server.ts`). | **Decoupled Horizontal Worker Pool** with dynamic Kafka Consumer Group scaling. |
| **Idempotency** | Partial (DB status checks only; vulnerable to worker crash races). | **Two-Tier Distributed Idempotency** (Redis fast-lock `SET NX EX` + DB conditional update) + **Provider-level idempotency key propagation** where supported. At-least-once processing. |
| **Delivery Engine** | Simulated mock state change (`PROCESSING` $\to$ `DELIVERED`). | **Pluggable Channel Adapters** (Email, SMS, Push) with timeout guards, error normalization, and stable idempotency keys. |
| **Retry Processing** | BullMQ internal retry backoff metadata. | **Non-Blocking Jittered Retry Engine** via Redis ZSET scheduler and dedicated retry topic. |
| **Dead-Letter Handling** | BullMQ failed job retention list. | Dedicated `notifications.dlq` Kafka topic + `NotificationDeadLetters` DB entity + 1-Click Replay. |
| **Rate Limiting** | In-memory `express-rate-limit` (resets on restart; non-shared). | **Distributed Redis Sliding-Window Rate Limiter** across all ingress replicas. |
| **Observability** | Basic BullMQ job counts and DB query polling. | **Full Distributed Metrics** (Consumer lag, partition health, outbox throughput, provider latency). |

---

## 20. Phased Implementation Roadmap (Phases 16–29)

```
[Phase 16: DB & Outbox Foundation]
                │
                ▼
[Phase 17: Kafka Cluster Infrastructure]
                │
                ▼
[Phase 18: Kafka Ingress & Worker Pipeline] ─── (Replaces BullMQ Core)
                │
                ▼
[Phase 19: Non-Blocking Retry Engine]
                │
                ▼
[Phase 20: DLQ & Replay Pipeline]
                │
                ▼
[Phase 21: Distributed Idempotency Engine]
                │
                ▼
[Phase 22: Real Channel Delivery Adapters]
                │
                ▼
[Phase 23: Preferences & Quiet Hours Engine]
                │
                ▼
[Phase 24: Distributed Prometheus Observability]
                │
                ▼
[Phase 25: Load Testing & Capacity Benchmarking]
                │
                ▼
[Phase 26: Chaos Engineering & Failure Injection]
                │
                ▼
[Phase 27: Production Hardening & Compose Orchestration]
                │
                ▼
[Phase 28: End-to-End System Validation]
                │
                ▼
[Phase 29: Final Architecture Documentation & Evidence]
```

### Detailed Phase Scope:
* **Phase 16 — Database & Outbox Foundation:** Add `OutboxEvents` table, Prisma migrations, and Outbox Publisher polling daemon with `SKIP LOCKED`.
* **Phase 17 — Kafka Infrastructure Setup:** Add Apache Kafka (KRaft mode) to `docker-compose.yml` and `docker-compose.prod.yml`; configure topic provisioning scripts.
* **Phase 18 — Kafka Notification Pipeline:** Wire Outbox Publisher to Kafka producer; implement standalone Kafka consumer worker pool; decommission primary BullMQ queue.
* **Phase 19 — Non-Blocking Retry Engine:** Implement Redis ZSET delay scheduler and `notifications.retry` topic integration with full decorrelated jitter.
* **Phase 20 — DLQ & Operator Replay Pipeline:** Implement `notifications.dlq`, dead-letter table persistence, and link replay endpoint to Kafka ingress.
* **Phase 21 — Distributed Idempotency Engine:** Implement Redis distributed locking (`SET NX EX`) and atomic DB state guards across all worker consumers.
* **Phase 22 — Production Delivery Channel Adapters:** Integrate concrete Email adapter (Resend SDK / SMTP) with fallback simulation flags and strict timeout controllers.
* **Phase 23 — Preferences & Dynamic Content Engine:** Integrate user preference evaluation, quiet-hours rules, and Mustache template variable rendering into the delivery pipeline.
* **Phase 24 — Distributed Observability:** Implement Prometheus metrics exporter (`/metrics`) exposing consumer lag, outbox throughput, and delivery latency.
* **Phase 25 — Load & Performance Benchmarking:** Execute automated k6 test suites across $100$, $1,000$, and $10,000$ notification batches to measure p95/p99 latencies and throughput.
* **Phase 26 — Chaos & Fault-Tolerance Testing:** Execute automated failure scenarios (Kafka stop, DB disconnect, worker kill, provider timeout) to validate zero-loss guarantees.
* **Phase 27 — Production Hardening & Compose Orchestration:** Tune worker concurrency, memory limits, health probes, and secret rotation across production Docker Compose.
* **Phase 28 — End-to-End System Validation:** Full integration test run verifying Dashboard $\leftrightarrow$ API $\leftrightarrow$ Kafka $\leftrightarrow$ DB $\leftrightarrow$ Worker pipeline.
* **Phase 29 — Documentation, Architecture Diagrams & Evidence:** Finalize system documentation, post-load benchmark graphs, and portfolio resume documentation.

---

## 21. Non-Goals (Explicitly Excluded Technologies)

To maintain focus, architectural strength, and avoid unnecessary complexity:
* **No Kubernetes / Helm / Service Mesh (Istio):** PulseTrace will remain orchestrated via Docker Compose and production Docker containers.
* **No Microservice Fragmentation:** PulseTrace will remain a clean, highly decoupled modular architecture with independent worker processes rather than multiple separate microservices.
* **No Heavy Distributed Tracing Infrastructure (Jaeger / OpenTelemetry Collector Cluster):** Tracing is preserved via unified structured JSON logging and `correlationId` propagation.
* **No Secondary Analytical Databases (Elasticsearch, ClickHouse, Cassandra):** PostgreSQL with partitioned tables and `date_trunc` indexing fully satisfies analytics requirements.
* **No Multi-Region Active-Active Replication:** Out of scope for current single-region high-availability design.

---

## 22. Architecture Review Amendments — v1.1

This section formally records the architectural amendments incorporated from the correctness review prior to Phase 16 execution:

### A1 — Delivery Semantics
PulseTrace explicitly targets at-least-once event processing with duplicate-safe idempotent consumer guards. Exactly-once external delivery effects depend on downstream provider support for idempotency keys or equivalent deduplication mechanisms and are not universally guaranteed across non-idempotent third-party APIs.

### A2 — Kafka Partitioning and Ordering
Four partitions per topic represent the initial development and rehearsal configuration. In production, partition count is an operational scaling parameter determined by throughput, worker parallelism, and broker capacity. Message ordering is guaranteed strictly within an individual Kafka topic partition; separate priority topics represent independent streams and do not provide cross-topic per-user ordering.

### A3 — Provider Idempotency
Channel adapters propagate stable idempotency keys (derived from `notificationId` and event metadata) to external providers whenever supported. Provider-level idempotency is required to close the duplicate-delivery window caused by worker crashes following successful provider acceptance but preceding database or offset commits.

---

## 23. Key Architectural Decisions Summary

| Subsystem | Architecture Decision | Justification |
|---|---|---|
| **Kafka** | Adopt Apache Kafka (KRaft mode) as the distributed event backbone with 4 initial partitions in development; scalable based on workload and operational requirements. | Enables partition-keyed ordering within topic partitions, linear worker scaling across consumer groups, and durable replay streaming. |
| **BullMQ** | **Decommission BullMQ** entirely; replace with Kafka + Redis ZSET delay scheduling. | Eliminates redundant queue technologies, split operational monitoring, and duplicate message state models. |
| **Redis** | Retain Redis strictly for ephemeral coordination: distributed idempotency locks (`SET NX EX`), sliding-window API rate limiting, cache, and delayed retry scheduling. | Provides sub-millisecond locking and delay indexing without burdening PostgreSQL with lock contention. |
| **Outbox** | Implement Transactional Outbox table (`OutboxEvents`) with PostgreSQL `FOR UPDATE SKIP LOCKED` batch polling. | Guarantees atomic DB-Kafka ingestion without requiring external CDC (Debezium) container dependencies. |
| **Retry** | Non-blocking exponential backoff with decorrelated full jitter offloaded to Redis ZSET and republished to `notifications.retry`. | Prevents blocking Kafka partition consumption threads while eliminating thundering-herd provider spikes. |
| **DLQ** | Dedicated `notifications.dlq` topic + `NotificationDeadLetters` DB entity capturing full error lineage after 5 failed attempts. | Full auditability of poison pills and permanent failures for operator diagnosis. |
| **Idempotency** | Two-tier internal duplicate protection (Redis fast-lock `SET NX EX` + PostgreSQL conditional state guard) + **provider-level idempotency key propagation** where supported. At-least-once processing without universal exactly-once external delivery claims. | Minimizes duplicate risk across internal crashes and closes the external duplicate window whenever downstream provider APIs support idempotency keys. |
| **Provider Architecture** | Normalized `ChannelAdapter` abstraction with timeout controllers (`AbortController`), retryable error classification, stable idempotency keys, and concrete Email/SMS adapters. | Completely isolates third-party vendor SDKs from core notification business rules and standardizes idempotency key propagation. |

---
*End of Phase 15 Architecture Design Specification (Version 1.1.0).*
