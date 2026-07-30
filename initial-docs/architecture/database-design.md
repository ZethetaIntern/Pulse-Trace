# Database Design

Project: PulseTrace

Version: 1.0

Status: Draft

---

# Purpose

This document defines the complete database design for PulseTrace.

It specifies:

- Database architecture
- Tables
- Relationships
- Constraints
- Indexes
- Enums
- Data ownership

The database is designed around the notification lifecycle and event history.

---

# Database Philosophy

PulseTrace uses PostgreSQL as the primary database.

The schema follows these principles:

- Normalize where appropriate
- Store immutable history
- Avoid duplicate data
- Keep provider-specific data isolated
- Design for observability
- Prefer append-only history

---

# Database Overview

Core tables:

Users

↓

Templates

↓

Notifications

↓

Notification Events

↓

Replay Executions

↓

Preferences

---

# Entity Relationship Diagram

Users
│
├──────────────┐
│              │
▼              ▼
Preferences   Notifications
                   │
                   │
                   ▼
          Notification Events
                   │
                   ▼
          Replay Executions

Templates
     │
     ▼
Notifications

---

# Table: Users

Purpose

Represents notification recipients.

Columns

id (UUID, PK)

email

phone

name

created_at

updated_at

Notes

Authentication is outside the scope of v1.

Users exist only for notification ownership.

---

# Table: Templates

Purpose

Stores reusable notification templates.

Columns

id (UUID)

name

channel

subject

body

version

status

created_at

updated_at

Business Rules

Templates are immutable after publishing.

Future versions may support version history.

---

# Table: Notifications

Purpose

Represents every notification created in PulseTrace.

Columns

id (UUID)

user_id (FK)

template_id (FK)

channel

category

priority

status

payload (JSONB)

metadata (JSONB)

created_at

updated_at

Business Rules

One record represents one notification.

Notification records are never deleted.

Status reflects current processing state.

Historical information belongs in Notification Events.

---

# Table: Notification Events

Purpose

Stores every state transition.

This is the heart of PulseTrace.

Columns

id (UUID)

notification_id (FK)

event_type

status_before

status_after

execution_id

metadata (JSONB)

occurred_at

Business Rules

Append only.

Immutable.

Never updated.

Every major state transition creates one event.

---

# Table: Replay Executions

Purpose

Tracks replay operations.

Columns

id (UUID)

original_notification_id (FK)

new_notification_id (FK)

reason

triggered_by

created_at

Business Rules

Replay never overwrites original notification.

Replay always creates a new notification execution.

Original history remains unchanged.

---

# Table: User Preferences

Purpose

Stores notification preferences.

Columns

id (UUID)

user_id (FK)

channel

category

enabled

created_at

updated_at

Business Rules

Preferences are evaluated before delivery.

Skipped notifications still generate events.

---

# Relationships

Users

1

↓

Many

Notifications

---

Templates

1

↓

Many

Notifications

---

Notifications

1

↓

Many

Notification Events

---

Notifications

1

↓

Many

Replay Executions

---

Users

1

↓

Many

Preferences

---

# Notification Status Enum

CREATED

QUEUED

PROCESSING

DELIVERED

FAILED

RETRY_PENDING

DLQ

SKIPPED

---

# Channel Enum

EMAIL

SMS

IN_APP

Future

PUSH

WHATSAPP

WEBHOOK

---

# Priority Enum

LOW

NORMAL

HIGH

CRITICAL

---

# Category Enum

TRANSACTIONAL

SECURITY

SYSTEM

INFORMATIONAL

---

# Event Type Enum

NOTIFICATION_CREATED

REQUEST_VALIDATED

NOTIFICATION_STORED

JOB_QUEUED

WORKER_STARTED

PREFERENCE_CHECKED

TEMPLATE_RESOLVED

TEMPLATE_RENDERED

CHANNEL_SELECTED

PROVIDER_INVOKED

DELIVERY_SUCCEEDED

DELIVERY_FAILED

RETRY_SCHEDULED

REPLAY_CREATED

DLQ_MOVED

---

# Indexing Strategy

Notifications

Index:

status

created_at

user_id

---

Notification Events

Index:

notification_id

occurred_at

event_type

execution_id

---

Replay Executions

Index:

original_notification_id

new_notification_id

---

Templates

Index:

name

channel

---

User Preferences

Index:

user_id

channel

category

---

# JSON Fields

The following fields use JSONB.

Notifications

payload

metadata

Notification Events

metadata

Reason

Notification payloads vary by template.

JSONB provides flexibility without schema changes.

---

# Cascade Rules

Deleting users

Restricted

Deleting notifications

Not allowed

Deleting templates

Restricted

Deleting events

Not allowed

Reason

PulseTrace is an observability platform.

Historical records must remain intact.

---

# Soft Delete Strategy

Version 1

No soft delete.

Records remain permanently.

Future

Optional archival strategy.

---

# Data Ownership

Notifications own:

Current status

Current metadata

Notification Events own:

Historical state

Execution history

Replay Executions own:

Replay relationships

Templates own:

Notification content

Preferences own:

Delivery eligibility

---

# Database Constraints

Notification must reference an existing user.

Notification must reference an existing template.

Events require notification.

Replay requires original notification.

Preferences require existing user.

---

# Sample Notification Lifecycle

Notifications

id

123

status

DELIVERED

↓

Notification Events

NOTIFICATION_CREATED

↓

REQUEST_VALIDATED

↓

JOB_QUEUED

↓

WORKER_STARTED

↓

PREFERENCE_CHECKED

↓

TEMPLATE_RENDERED

↓

PROVIDER_INVOKED

↓

DELIVERY_SUCCEEDED

---

# Performance Goals

Support:

100,000+

notification records

Millions of events

Fast timeline queries

Fast notification search

Fast analytics aggregation

---

# Future Database Extensions

Provider table

Notification Channels

Attachments

Audit Logs

Scheduled Notifications

Rate Limits

API Keys

Organizations

Multi-tenancy

---

# Database Design Principles

Current state lives in Notifications.

Historical state lives in Notification Events.

Events are immutable.

Relationships use UUIDs.

JSONB stores flexible payloads.

Every notification remains traceable throughout its lifecycle.

The database favors observability over aggressive normalization.

---

# Success Criteria

The schema is considered successful when:

- Every notification is traceable.
- Every state transition is preserved.
- Replay relationships are maintained.
- Timeline queries are efficient.
- New notification channels can be added without schema redesign.
- The schema remains understandable and extensible.