# PHASE 20 — DLQ & OPERATOR REPLAY PIPELINE REPORT

## Executive Summary

Phase 20 introduces operator-controlled Dead-Letter Queue (DLQ) investigation and replay capability for PulseTrace. Building upon the Phase 19 Retry Engine & DLQ baseline, Phase 20 establishes a robust, safe, and audited pipeline that allows operations and engineering teams to inspect failed/exhausted notifications, trigger replays with explicit reason and operator attribution, and trace the full replay lifecycle from ingestion to delivery without breaking invariants or corrupting historical audit logs.

---

## 1. Authoritative Architecture & Flow

### Replay Ingress & Ingestion Flow (Kafka Mode)

```
Operator
   ↓ POST /api/v1/notifications/:id/replay
ReplayController & ReplayValidator
   ├── 1. Validate original notification exists
   ├── 2. Validate original notification is in DLQ status & has NotificationDeadLetter
   └── 3. Check no active replay (REQUESTED / RUNNING) exists
   ↓
Atomic PostgreSQL Transaction
   ├── Notification (status: QUEUED, metadata.replayedFrom: originalId, metadata.retryCount: 0)
   ├── NotificationEvent (eventType: REPLAY_REQUESTED)
   ├── ReplayExecution (status: REQUESTED, triggeredBy: operatorId, reason: reason)
   └── OutboxEvent (topic: notifications.<channel>.<priority>, status: PENDING)
   ↓
Outbox Publisher
   ↓ (polls SKIP LOCKED → produces to Kafka)
Kafka Topic (notifications.<channel>.<priority>)
```

### Consumer Replay Execution & Deferred DLQ Resolution Flow

```
Kafka Topic
   ↓
NotificationConsumer (Consumer Group: pulsetrace-notifications)
   ├── Detects replayed notification via ReplayExecution lookup
   ├── Emits REPLAY_STARTED event & updates ReplayExecution.status = RUNNING
   ↓
Process Delivery
   ├── Case A: Immediate Delivery Success (Attempt 1)
   │     ├── Emits DELIVERY_SUCCEEDED + REPLAY_COMPLETED
   │     ├── Updates ReplayExecution.status = COMPLETED, completedAt = now()
   │     └── Resolves original DLQ: NotificationDeadLetter.resolvedAt = now(), resolvedBy = operatorId
   │
   ├── Case B: Transient Failure (Attempt 1)
   │     ├── Emits DELIVERY_FAILED + RETRY_SCHEDULED
   │     ├── Schedules retry job in Redis ZSET
   │     ├── ReplayExecution remains RUNNING; original DLQ remains UNRESOLVED
   │     ↓ (Redis Lease Scheduler -> notifications.retry -> RetryConsumer)
   │     ├── Retry Succeeded (Attempt 2..5):
   │     │     ├── Emits DELIVERY_SUCCEEDED + REPLAY_COMPLETED
   │     │     ├── Updates ReplayExecution.status = COMPLETED, completedAt = now()
   │     │     └── Resolves original DLQ: NotificationDeadLetter.resolvedAt = now()
   │     └── Max Retries Exhausted (Attempt 5/5):
   │           ├── Routes new notification to DLQ (DLQ_MOVED)
   │           ├── Updates ReplayExecution.status = FAILED, errorMessage stamped
   │           └── Original DLQ remains UNRESOLVED
   │
   └── Case C: Permanent Non-Retryable Failure (e.g., INVALID_RECIPIENT)
         ├── Routes new notification to DLQ (DLQ_MOVED)
         ├── Updates ReplayExecution.status = FAILED, errorMessage stamped
         └── Original DLQ remains UNRESOLVED
```

---

## 2. Core Invariants & Engineering Guarantees

1. **DLQ-Only Replay Invariant**:
   - Replay is strictly restricted to notifications in `DLQ` status with an associated `NotificationDeadLetter` record.
   - Non-DLQ notifications (e.g. `DELIVERED`, `CREATED`, `QUEUED`, `PROCESSING`) return `400 Bad Request` with code `REPLAY_NOT_ALLOWED`.

2. **Race Condition Prevention via Partial Unique Index**:
   - A native PostgreSQL Partial Unique Index prevents concurrent active replays for the same original notification:
     ```sql
     CREATE UNIQUE INDEX "unique_active_replay_per_original"
     ON "ReplayExecutions"("originalNotificationId")
     WHERE "status" IN ('REQUESTED', 'RUNNING');
     ```
   - Concurrent requests are rejected at the database level and mapped to `409 Conflict` (`ACTIVE_REPLAY_EXISTS`).

3. **Clean Notification Copy**:
   - Copies only immutable delivery configuration: `userId`, `templateId`, `channel`, `category`, `priority`, `payload`.
   - Erases ephemeral and runtime state: sets fresh `QUEUED` status, initializes `retryCount = 0`, and records lineage in `metadata.replayedFrom`.

4. **Correlation ID & Operator Attribution**:
   - Preserves `correlationId` from the original request or generates a new traceable identifier across `ReplayExecution`, new `Notification`, `OutboxEvent`, and Kafka message headers.
   - Tracks operator attribution via `operatorId` / `triggeredBy`.

5. **Accurate Lifecycle Semantics**:
   - `REPLAY_COMPLETED` is emitted and `ReplayExecution.status = COMPLETED` ONLY when the replayed notification reaches `DELIVERED` status (including across attempts 2..5 via `RetryConsumer`).
   - `REPLAY_FAILED` is recorded and `ReplayExecution.status = FAILED` when delivery permanently fails or exhausts 5 attempts.

6. **Deferred DLQ Resolution**:
   - The original `NotificationDeadLetter.resolvedAt` timestamp and `resolvedBy` field are updated ONLY upon confirmed delivery of the replayed notification.

7. **Dual-Pipeline Compatibility**:
   - Fully supports both Kafka mode (atomic Outbox transaction + consumer execution) and BullMQ mode (QueueService + NotificationWorker execution).

---

## 3. API Specifications

### 1. `GET /api/v1/notifications/:notificationId/dlq`
Inspects the durable dead-letter record for a failed notification.

### 2. `POST /api/v1/notifications/:notificationId/replay`
Triggers an asynchronous replay for a dead-lettered notification.

### 3. `GET /api/v1/notifications/:notificationId/replays`
Retrieves chronological replay execution history.

---

## 4. Database Schema Changes

### Prisma Schema Updates (`apps/api/prisma/schema.prisma`)
- Added `ReplayStatus` enum (`REQUESTED`, `RUNNING`, `COMPLETED`, `FAILED`).
- Added fields to `ReplayExecution`: `status`, `errorMessage`, `startedAt`, `completedAt`.
- Added migration `20260914000000_add_replay_execution_lifecycle`.
- Applied partial unique index `unique_active_replay_per_original`.

---

## 5. Dashboard UI Implementation

- **DeadLetterCard**: Added DLQ investigation card displaying error codes, error messages, failed attempt count, resolution status, and JSON error history.
- **Operator Replay Action**: Added replay modal triggering `POST /replay` with optional operator reason and operatorId. Restricted strictly to DLQ notifications.
- **Active Replay In-Progress Alert**: Displays a warning alert when an active replay is currently `REQUESTED` or `RUNNING`.
- **Replay History**: Renders replay executions with status badges (`REQUESTED`, `RUNNING`, `COMPLETED`, `FAILED`), duration timestamps, operator attribution, error messages on failure, and deep links to new replayed notification instances.

---

## 6. Test Suite & Verification Results

- **API Unit Tests**: 33 test suites, 286 tests passed (**100% GREEN**).
- **Integration Tests**: 11 test suites, 76 tests passed (**100% GREEN**).
- **Monorepo Builds**: `apps/api` and `apps/dashboard` compile with 0 errors.
- **Linting**: ESLint clean with 0 errors across all workspaces.

---

## 7. Next Steps (Phase 21+)

With Phase 20 complete, operator DLQ investigation and replay are fully operational and resilient. The baseline is ready for **Phase 21 — Distributed Idempotency Engine**.
