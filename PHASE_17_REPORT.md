# PHASE 17 — KAFKA CLUSTER INFRASTRUCTURE: FINAL REPORT

**Status:** Completed & Verified  
**Date:** September 13, 2026  
**Repository:** `PulseTrace`  
**Phase:** 17 — Kafka Cluster Infrastructure  

---

## 1. Executive Summary

Phase 17 establishes Apache Kafka in KRaft mode as the distributed event backbone for PulseTrace and connects the transactional Outbox Publisher implemented in Phase 16 to Kafka.

### Core Deliverables Achieved
- **KRaft Kafka Cluster Infrastructure:** Configured Apache Kafka 7.6 (KRaft mode, zero ZooKeeper dependencies) in Docker Compose with single-node development configuration and persistent storage.
- **5 Core Topics with 4 Partitions Each:** Implemented deterministic, idempotent topic initialization for `notifications.high`, `notifications.normal`, `notifications.low`, `notifications.retry`, and `notifications.dlq`.
- **`KafkaPublisherSink` Integration:** Implemented the `OutboxPublisherSink` abstraction from Phase 16 using `kafkajs`, bridging `OutboxPublisher` to Kafka topics with partitioned per-user keys (`partitionKey = userId`) and metadata headers (`x-event-id`, `x-event-type`, `x-correlation-id`).
- **Resilient & Non-Blocking Architecture:** Ensured the API ingress pipeline and transactional outbox remain fully decoupled from Kafka uptime. Kafka outages surface cleanly as outbox publication retries without failing API requests or blocking server startup.
- **Full Backward Compatibility:** BullMQ remains the active notification delivery engine in Phase 17. No notification delivery jobs have been migrated to Kafka yet, and no consumer groups were introduced.

---

## 2. Kafka Architecture

The Phase 17 architecture connects the durable PostgreSQL Outbox to the Kafka event backbone:

```
External Application
        │
        ▼ (POST /api/v1/notifications)
   Express API
        │
        ▼
PostgreSQL Transaction (Prisma)
   ├── 1. Notification (CREATED)
   ├── 2. NotificationEvent (NOTIFICATION_CREATED)
   └── 3. OutboxEvent (PENDING, partitionKey=userId)
        │
        ▼
   Outbox Publisher (FOR UPDATE SKIP LOCKED)
        │
        ▼
   IOutboxPublisherSink
        │
        ▼
   KafkaPublisherSink (Producer send)
        │
        ▼
   Kafka Cluster (KRaft)
   ├── notifications.high    (4 partitions)
   ├── notifications.normal  (4 partitions)
   ├── notifications.low     (4 partitions)
   ├── notifications.retry   (4 partitions) [Phase 19]
   └── notifications.dlq     (4 partitions) [Phase 19]
```

---

## 3. KRaft Configuration

Kafka is configured to run in KRaft mode (Kafka Raft Metadata mode), eliminating the need for an external Apache ZooKeeper ensemble.

### Node Configuration
- **Node ID:** `1`
- **Process Roles:** `broker,controller` (Combined role for single-node development)
- **Cluster ID:** `MkU3OEVBNTcwNTJENDM2Qk` (Static UUID for reproducible local clusters)
- **Controller Quorum Voters:** `1@kafka:29093`
- **Controller Listener Name:** `CONTROLLER`
- **Inter-Broker Listener Name:** `PLAINTEXT`
- **Replication Factors:** `offsets.topic.replication.factor=1`, `transaction.state.log.replication.factor=1`, `transaction.state.log.min.isr=1`
- **Auto Topic Creation:** Disabled (`KAFKA_AUTO_CREATE_TOPICS_ENABLE=false`) to enforce deterministic administrative provisioning.

---

## 4. Docker Changes

Updated `docker-compose.yml` to include the `kafka` service and `kafka_data` volume:

```yaml
  kafka:
    image: confluentinc/cp-kafka:7.6.1
    container_name: pulsetrace-kafka
    ports:
      - '9092:9092'
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: 'CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT'
      KAFKA_ADVERTISED_LISTENERS: 'PLAINTEXT://kafka:29092,PLAINTEXT_HOST://localhost:9092'
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_PROCESS_ROLES: 'broker,controller'
      KAFKA_CONTROLLER_QUORUM_VOTERS: '1@kafka:29093'
      KAFKA_LISTENERS: 'PLAINTEXT://0.0.0.0:29092,CONTROLLER://0.0.0.0:29093,PLAINTEXT_HOST://0.0.0.0:9092'
      KAFKA_INTER_BROKER_LISTENER_NAME: 'PLAINTEXT'
      KAFKA_CONTROLLER_LISTENER_NAMES: 'CONTROLLER'
      KAFKA_LOG_DIRS: '/var/lib/kafka/data'
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'false'
      CLUSTER_ID: 'MkU3OEVBNTcwNTJENDM2Qk'
    volumes:
      - kafka_data:/var/lib/kafka/data
    healthcheck:
      test: ['CMD', 'kafka-broker-api-versions', '--bootstrap-server', 'localhost:9092']
      interval: 10s
      timeout: 10s
      retries: 5
      start_period: 15s

volumes:
  postgres_data:
  redis_data:
  kafka_data:
```

---

## 5. Topic Topology

All 5 core topics are initialized with the baseline configuration:

| Topic Name | Initial Partitions | Local Replication Factor | Purpose |
| :--- | :---: | :---: | :--- |
| `notifications.high` | 4 | 1 | Urgent notifications (CRITICAL, HIGH priorities) |
| `notifications.normal` | 4 | 1 | Standard notifications (NORMAL / MEDIUM priority) |
| `notifications.low` | 4 | 1 | Batch / informational notifications (LOW priority) |
| `notifications.retry` | 4 | 1 | Delayed retry scheduling (Phase 19) |
| `notifications.dlq` | 4 | 1 | Dead letter queue for permanently failed events (Phase 19) |

*Note:* 4 partitions is the initial development configuration and can be scaled up in production environments without schema or application code changes.

---

## 6. Partitioning Strategy

Every message produced to Kafka specifies `key = event.partitionKey`.

- For all notification events, `partitionKey` is strictly set to `userId`.
- Kafka hashes the `userId` to determine the destination partition within the topic:
  $$\text{Partition} = \text{murmur2}(\text{userId}) \pmod{\text{numPartitions}}$$
- All events for a specific user are consistently written to the same partition within a given topic.

---

## 7. Ordering Guarantees and Limitations

### Guaranteed
- **Strict Per-User Partition Ordering:** Events for the same user within the same topic partition are guaranteed to be published and consumed in strict chronological order.
- **At-Least-Once Delivery:** The transactional outbox guarantees that every committed notification event is published to Kafka at least once.

### Explicit Limitations & Tradeoffs
- **No Global Ordering:** Kafka does not guarantee ordering across different topic partitions.
- **No Cross-Topic Ordering:** Because priority routing distributes events across `notifications.high`, `notifications.normal`, and `notifications.low`, a high-priority event and normal-priority event for the same user exist in different topics and do not possess cross-topic ordering guarantees.
- **No Exactly-Once External Delivery:** At-least-once transport is maintained; duplicate protection is guaranteed via consumer idempotency keys in subsequent phases.

---

## 8. Kafka Producer Implementation

The `KafkaPublisherSink` class (`apps/api/src/modules/outbox/sinks/kafka-publisher-sink.ts`) implements `OutboxPublisherSink`:

```typescript
export class KafkaPublisherSink implements OutboxPublisherSink {
  private isConnected = false;
  private connectPromise: Promise<void> | null = null;

  constructor(private readonly producer: Producer = createKafkaProducer()) {}

  async publish(event: OutboxEvent): Promise<void> {
    await this.connect();

    const payloadObj = typeof event.payload === 'object' && event.payload !== null
      ? (event.payload as Record<string, unknown>)
      : {};

    const correlationId = typeof payloadObj.correlationId === 'string'
      ? payloadObj.correlationId
      : '';

    const payloadString = typeof event.payload === 'string'
      ? event.payload
      : JSON.stringify(event.payload);

    try {
      await this.producer.send({
        topic: event.topic,
        messages: [
          {
            key: event.partitionKey,
            value: payloadString,
            headers: {
              'x-event-id': event.id,
              'x-event-type': event.eventType,
              'x-correlation-id': correlationId,
            },
          },
        ],
      });
    } catch (error) {
      logger.error({ eventId: event.id, topic: event.topic, error: (error as Error).message }, 'Failed to publish outbox event to Kafka');
      throw error;
    }
  }
}
```

---

## 9. Outbox → Kafka Flow

1. **Batch Claiming:** `OutboxPublisher` claims a batch of `PENDING` / `FAILED` outbox records via PostgreSQL `FOR UPDATE SKIP LOCKED`.
2. **Sink Invocation:** `OutboxPublisher` invokes `sink.publish(event)`.
3. **Kafka Dispatch:** `KafkaPublisherSink` formats the message with `key = userId` and headers, sending it to Kafka broker.
4. **State Transition:**
   - **On Kafka ACK:** `OutboxPublisher` marks the outbox event as `PUBLISHED` (`publishedAt = NOW()`, locks cleared).
   - **On Transport Failure:** `KafkaPublisherSink` throws the error; `OutboxPublisher` catches it, transitions the event to `FAILED`, increments `retryCount`, records `lastError`, and clears the lock for subsequent polling attempts.

---

## 10. Environment Configuration

The following environment variables configure Kafka in `.env` and `apps/api/src/config/env.ts`:

| Variable | Dev Default | Description |
| :--- | :--- | :--- |
| `KAFKA_BROKERS` | `localhost:9092` | Comma-separated list of Kafka broker addresses. In Docker Compose: `kafka:29092`. |
| `KAFKA_CLIENT_ID` | `pulsetrace-api` | Client identifier passed in Kafka requests for logging and tracing. |

---

## 11. Health & Readiness Behavior

A dedicated, decoupled `KafkaHealthIndicator` (`apps/api/src/infrastructure/kafka/kafka-health-indicator.ts`) probes Kafka connectivity using the Kafka Admin client (`describeCluster`):

- **Reachable:** Returns `{ status: 'ok', latencyMs, brokersCount, clusterId }`.
- **Unreachable:** Returns `{ status: 'error', latencyMs, error: '...' }` without throwing unhandled exceptions.
- **Resilient API Startup:** Kafka is intentionally decoupled from API liveness and startup checks. If Kafka is down, the API starts normally and continues accepting notifications into PostgreSQL + Outbox.

---

## 12. Failure Semantics

- **No Application Retry Duplication:** Transport-level TCP and acknowledgment retries are managed by KafkaJS; application-level publication retry is managed exclusively by the `OutboxPublisher`.
- **Database Durability Boundary:** In the event of broker downtime, events remain durable in the PostgreSQL `outbox_events` table with `status = FAILED` and are automatically retried on subsequent polling intervals once the broker recovers.

---

## 13. Test Strategy

### Unit Tests
- `kafka-publisher-sink.test.ts`: Verifies message structure, headers, `key = userId`, connection reuse, and error rethrowing with mocked KafkaJS producer.
- `topic-initializer.test.ts`: Verifies topic creation calculations, partition counts, and idempotency.
- `kafka-health-indicator.test.ts`: Verifies cluster metadata reporting and graceful error handling.

### Integration Tests
- `kafka.integration.test.ts`:
  1. Verifies Kafka broker health via `KafkaHealthIndicator`.
  2. Verifies topic initialization ensures all 5 topics exist with 4 partitions each.
  3. Verifies priority routing for `notifications.high`, `notifications.normal`, and `notifications.low`.
  4. Consumes published events from Kafka and validates `key`, payload JSON integrity, and headers (`x-event-id`, `x-event-type`, `x-correlation-id`).
  5. Verifies broker failure simulation marks events `FAILED`, increments `retryCount`, and successfully republishes when healthy.

---

## 14. Test Results

```
API Unit Tests (npm run test:api):          25/25 Test Suites Passed (250/250 Tests Passed)
Integration Tests (npm run test:integration): 8/8 Test Suites Passed   (60/60 Tests Passed)
TypeScript Build (npm run build):             0 Errors
ESLint (npm run lint):                        0 Errors / 0 Warnings
```

---

## 15. Backward Compatibility Verification

- **BullMQ Operations:** BullMQ continues processing notification jobs synchronously after database commit.
- **No Duplicate Delivery:** `KafkaPublisherSink` only publishes to Kafka topics; it does not trigger duplicate worker execution.
- **API Contracts:** No breaking changes to existing REST endpoints or DTOs.

---

## 16. Files Changed & Created

### New Files
- `apps/api/src/infrastructure/kafka/kafka-client.ts`
- `apps/api/src/infrastructure/kafka/topic-initializer.ts`
- `apps/api/src/infrastructure/kafka/scripts/init-topics.ts`
- `apps/api/src/infrastructure/kafka/kafka-health-indicator.ts`
- `apps/api/src/modules/outbox/sinks/kafka-publisher-sink.ts`
- `apps/api/src/__tests__/infrastructure/kafka/topic-initializer.test.ts`
- `apps/api/src/__tests__/infrastructure/kafka/kafka-health-indicator.test.ts`
- `apps/api/src/__tests__/modules/outbox/sinks/kafka-publisher-sink.test.ts`
- `apps/api/src/__tests__/integration/kafka.integration.test.ts`
- `PHASE_17_REPORT.md`

### Modified Files
- `docker-compose.yml`
- `.env.example`
- `apps/api/package.json`
- `apps/api/src/config/env.ts`
- `apps/api/src/modules/outbox/composition.ts`
- `apps/api/src/modules/outbox/index.ts`

---

## 17. Known Limitations

- **Single-Broker Local Setup:** Docker Compose runs a single Kafka broker (`replicationFactor = 1`). Production deployments will require multi-broker ISR replication.
- **Publishing Only:** Kafka consumers are not implemented in this phase.
- **Dual Pipeline Coexistence:** BullMQ and Kafka Outbox operate in parallel during this transitional phase.

---

## 18. Explicit Phase 18 Boundary

- **What Phase 17 Did:** Added Kafka KRaft cluster, topic topologies, `KafkaPublisherSink`, and connected the transactional Outbox Publisher to Kafka.
- **What Phase 18 Will Do:** Implement Kafka Consumer Groups, worker pool ingestion from `notifications.high`, `notifications.normal`, and `notifications.low`, and begin migrating notification delivery from BullMQ to Kafka.

---

## 19. Recommended Next Steps for Phase 18

1. **Consumer Group Engine:** Build modular Kafka Consumer group workers with graceful rebalancing and commit handling.
2. **Priority Processing Pipeline:** Configure consumer concurrency tuned to topic priority (`notifications.high` > `notifications.normal` > `notifications.low`).
3. **Delivery Pipeline Integration:** Connect Kafka message processing directly to the notification dispatch pipeline.
4. **Gradual Cutover:** Implement feature-flagged worker processing transitioning from BullMQ to Kafka consumers.
