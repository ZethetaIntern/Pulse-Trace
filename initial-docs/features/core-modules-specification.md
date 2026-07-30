# Core Modules Specification

Project: PulseTrace

Version: 1.0

Status: Draft

---

# Purpose

This document defines the behavior of every core module involved in notification processing.

It specifies the responsibilities, workflows, business rules, dependencies, and acceptance criteria for each module.

Implementation details are intentionally excluded and belong to technical design documents.

---

# Core Processing Pipeline

Every notification follows the same high-level journey.

External Application

↓

Notification Management

↓

Queue & Workers

↓

Delivery Engine

↓

Template System

↓

User Preferences

↓

Provider Adapter

↓

Event Timeline

↓

Analytics

↓

Dashboard

---

# 1. Queue & Workers

## Purpose

Provide asynchronous processing for notifications.

The queue decouples API requests from notification delivery, ensuring fast API responses and reliable background execution.

---

## Responsibilities

- Accept notification jobs
- Store jobs in BullMQ
- Execute jobs asynchronously
- Retry failed jobs
- Move permanently failed jobs to DLQ
- Maintain job state

---

## Business Rules

- API should never wait for delivery.
- Jobs must be processed exactly once whenever possible.
- Retry policy must be configurable.
- Dead Letter Queue stores unrecoverable jobs.
- Queue payload should remain lightweight.

---

## Job Lifecycle

Notification Created

↓

Job Queued

↓

Worker Picks Job

↓

Processing

↓

Completed

OR

Retry

OR

Dead Letter Queue

---

## Acceptance Criteria

✓ Jobs processed asynchronously

✓ Retry works correctly

✓ DLQ stores failed jobs

✓ Worker failures do not crash the system

---

## Future Scope

- Priority queues
- Delayed jobs
- Multiple workers
- Queue monitoring
- Horizontal scaling

---

# 2. Event Timeline

## Purpose

Provide complete visibility into the lifecycle of every notification.

The timeline serves as the primary debugging tool.

---

## Responsibilities

- Record every state transition
- Maintain chronological order
- Store immutable events
- Support debugging
- Support replay history

---

## Business Rules

Every important action must generate an event.

Events are immutable.

Events are append-only.

Events are never updated or deleted.

---

## Example Timeline

Notification Created

↓

Validated

↓

Queued

↓

Worker Started

↓

Template Rendered

↓

Provider Invoked

↓

Delivered

---

## Acceptance Criteria

✓ Every notification has a timeline

✓ Events remain immutable

✓ Timeline is chronological

✓ Developers can identify failures easily

---

## Future Scope

- Event filtering
- Event search
- Timeline comparison

---

# 3. Replay System

## Purpose

Allow developers to execute a previously processed notification again.

Replay is designed for debugging and recovery.

---

## Responsibilities

- Replay notification
- Preserve original execution
- Create new execution history
- Generate new events

---

## Business Rules

Replay never overwrites original history.

Every replay receives a new execution ID.

Replay remains linked to the original notification.

---

## Replay Flow

Original Notification

↓

Replay Requested

↓

New Execution

↓

Processing

↓

New Timeline

---

## Acceptance Criteria

✓ Original timeline preserved

✓ Replay generates new events

✓ Replay traceable independently

---

## Future Scope

- Replay with modified payload
- Bulk replay
- Scheduled replay

---

# 4. Template System

## Purpose

Separate notification content from application logic.

Templates provide reusable message structures.

---

## Responsibilities

- Store templates
- Validate variables
- Render content
- Support multiple channels

---

## Business Rules

Templates are reusable.

Rendering never modifies stored templates.

Missing variables generate validation errors.

---

## Rendering Flow

Template

+

Variables

↓

Rendered Content

---

## Acceptance Criteria

✓ Variables rendered correctly

✓ Invalid templates rejected

✓ Templates reusable across notifications

---

## Future Scope

- HTML templates
- Versioning
- Localization
- Live preview

---

# 5. User Preferences

## Purpose

Respect user notification choices.

---

## Responsibilities

- Manage channel preferences
- Manage category preferences
- Determine delivery eligibility

---

## Business Rules

Disabled notifications are skipped.

Skipped notifications still generate events.

Preference evaluation occurs before delivery.

---

## Evaluation Flow

Notification

↓

Load Preferences

↓

Allowed?

↓

Yes → Continue

No → Skip

---

## Acceptance Criteria

✓ Preferences respected

✓ Skip events generated

✓ Delivery prevented when disabled

---

## Future Scope

- Quiet hours
- Time zones
- Frequency limits

---

# 6. Analytics

## Purpose

Provide operational insights into notification processing.

Analytics aggregates historical data for engineering visibility.

---

## Metrics

- Total Notifications
- Success Rate
- Failure Rate
- Average Processing Time
- Retry Count
- DLQ Count
- Channel Distribution

---

## Business Rules

Analytics uses historical notification events.

Metrics should never modify notification data.

---

## Acceptance Criteria

✓ Metrics generated correctly

✓ Dashboard displays aggregated statistics

✓ Historical trends available

---

## Future Scope

- Time-series analytics
- SLA tracking
- Provider comparison

---

# 7. Monitoring

## Purpose

Monitor overall system health.

Unlike Analytics, Monitoring focuses on the current operational state.

---

## Responsibilities

- Monitor queue health
- Monitor worker health
- Monitor Redis
- Monitor database
- Monitor processing rate

---

## Health Indicators

Queue Length

Worker Status

Redis Status

Database Status

Error Rate

Processing Throughput

---

## Acceptance Criteria

✓ Current system health visible

✓ Critical failures detectable

✓ Queue bottlenecks identifiable

---

## Future Scope

- Alerts
- Notifications
- Prometheus integration
- Grafana dashboards

---

# 8. Dashboard

## Purpose

Provide developers with a unified interface for operating and debugging PulseTrace.

The dashboard is an engineering tool, not a customer-facing application.

---

## Pages

### Dashboard

System overview

---

### Notifications

Notification list

Search

Filters

---

### Notification Details

Complete notification information

---

### Timeline

Chronological execution history

---

### Replay

Replay notifications

View replay history

---

### Analytics

Performance metrics

Charts

---

### Monitoring

System health

Queue statistics

Worker statistics

---

### Settings

Application configuration

Templates

Future preferences

---

## Design Principles

The dashboard should answer:

- What happened?
- Why did it happen?
- What is happening now?
- Can I replay it?
- Is the system healthy?

Developers should rarely need direct database access.

---

## Acceptance Criteria

✓ Easy navigation

✓ Fast search

✓ Clear timeline

✓ Replay accessible

✓ Health information available

✓ Analytics understandable

---

# Cross-Module Principles

Every module must:

- Follow Clean Architecture
- Have a single responsibility
- Generate meaningful events
- Produce structured logs
- Be independently testable
- Be loosely coupled
- Support future extensibility

---

# Module Dependencies

Notification Management

↓

Queue & Workers

↓

Delivery Engine

↓

Template System

↓

User Preferences

↓

Provider Adapter

↓

Event Timeline

↓

Analytics

↓

Dashboard

Monitoring observes the entire system but does not participate in notification processing.

---

# Definition of Done

A module is considered complete when:

- Functional requirements are implemented
- Business rules are enforced
- Events are generated correctly
- Errors are handled gracefully
- Logs are structured
- Tests pass
- Documentation is updated
- Architecture principles are followed

---

# Future Evolution

Future versions of PulseTrace may introduce:

- Multi-provider routing
- Push notifications
- Webhooks
- AI-assisted failure explanation
- OpenTelemetry tracing
- Distributed workers
- Kubernetes deployment

These enhancements must preserve the architectural principles defined in the Vision & Engineering Principles document.