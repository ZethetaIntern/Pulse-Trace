# System Architecture Document

Project: PulseTrace

Version: 1.0

Status: Draft

---

# 1. Purpose

This document defines the overall architecture of PulseTrace.

It explains how every major component interacts, the responsibility of each layer, and the complete lifecycle of a notification.

This document is the single source of truth for architectural decisions.

Any implementation must follow this architecture unless explicitly changed.

---

# 2. High-Level Overview

PulseTrace is a Modular Monolith built using an event-driven architecture.

Applications send notification requests to PulseTrace.

PulseTrace validates the request, stores it, creates a background job, processes the notification asynchronously, records every important state transition, and exposes the execution history through a developer dashboard.

---

# 3. High-Level Architecture

                   External Application
                           │
                           │ REST API
                           ▼
                 ┌─────────────────────┐
                 │    Express Server    │
                 └─────────────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
      PostgreSQL                 BullMQ Queue
              │                         │
              │                         ▼
              │                  Notification Worker
              │                         │
              │                         ▼
              │                Notification Engine
              │                         │
      ┌───────┼───────────────┬─────────┴─────────┐
      ▼                       ▼                   ▼
Email Adapter           SMS Adapter         In-App Adapter
      │                       │                   │
      └──────────────┬────────┴───────────────────┘
                     ▼
             Notification Events
                     │
                     ▼
              React Dashboard

---

# 4. Core Components

PulseTrace consists of the following components.

1. REST API
2. Notification Service
3. PostgreSQL Database
4. BullMQ Queue
5. Notification Worker
6. Notification Engine
7. Notification Adapters
8. Event Store
9. Dashboard

Each component has a single responsibility.

---

# 5. Component Responsibilities

## REST API

Responsibilities

- Accept requests
- Validate input
- Call application services
- Return responses

Must NOT

- Send notifications
- Execute business logic
- Access providers directly

---

## Notification Service

Responsibilities

- Validate business rules
- Create notifications
- Store notification metadata
- Push jobs to BullMQ

Must NOT

- Send emails
- Process queues
- Render templates

---

## BullMQ Queue

Responsibilities

- Buffer notifications
- Decouple API from processing
- Retry failed jobs
- Delay jobs
- Manage job lifecycle

BullMQ acts as the communication layer between the API and background workers.

---

## Notification Worker

Responsibilities

- Consume jobs
- Execute notification pipeline
- Update status
- Emit events

Workers run asynchronously.

Multiple workers may exist in the future.

---

## Notification Engine

The Notification Engine contains the core business logic.

Responsibilities

- Check preferences
- Select channel
- Render templates
- Call adapters
- Generate events
- Handle retries
- Decide final status

This is the heart of PulseTrace.

---

## Notification Adapters

Each provider is wrapped inside an adapter.

Examples

Email Adapter

SMS Adapter

In-App Adapter

Responsibilities

- Transform payload
- Communicate with provider
- Return normalized response

Business logic must never exist inside adapters.

---

## Event Store

Every important state transition becomes an event.

Examples

Notification Created

Queued

Worker Started

Preference Checked

Template Rendered

Provider Called

Retry Started

Delivered

Failed

Events are immutable.

Events are append-only.

---

## Dashboard

The dashboard exists for developers.

It should answer questions like

"What happened?"

"Why did it happen?"

"Can I replay it?"

It is NOT a customer-facing interface.

---

# 6. Notification Lifecycle

A notification moves through the following lifecycle.

External Application

↓

API Request Received

↓

Validation

↓

Notification Created

↓

Notification Stored

↓

Job Added to Queue

↓

Worker Picks Job

↓

Preferences Checked

↓

Template Rendered

↓

Channel Selected

↓

Provider Called

↓

Success

OR

Retry

OR

Dead Letter Queue

↓

Final Status Updated

↓

Timeline Available

---

# 7. Data Flow

Application

↓

POST /notifications

↓

Notification Service

↓

Database

↓

BullMQ

↓

Worker

↓

Notification Engine

↓

Adapter

↓

Provider

↓

Database Update

↓

Event Created

↓

Dashboard

---

# 8. Architectural Style

PulseTrace follows a Modular Monolith architecture.

Reasons

- Easier to understand
- Easier to debug
- Easier to deploy
- Easier to explain in interviews
- Lower operational complexity

Microservices are intentionally excluded.

---

# 9. Layered Architecture

Presentation Layer

↓

Application Layer

↓

Domain Layer

↓

Infrastructure Layer

---

## Presentation Layer

Controllers

Routes

Validation

---

## Application Layer

Services

Use Cases

Business Workflows

---

## Domain Layer

Notification

Notification Events

Preferences

Templates

Status

Rules

---

## Infrastructure Layer

Prisma

BullMQ

Redis

Adapters

Database

External Providers

---

# 10. Communication Pattern

The API communicates synchronously.

Notification processing happens asynchronously.

API

↓

Queue

↓

Worker

↓

Adapter

This prevents slow providers from blocking HTTP requests.

---

# 11. Event-Driven Philosophy

State changes are represented as events.

Events are facts.

Events are never edited.

Current notification state is derived from completed processing.

Examples

NOTIFICATION_CREATED

JOB_QUEUED

WORKER_STARTED

PREFERENCES_CHECKED

CHANNEL_SELECTED

EMAIL_SENT

SMS_SENT

RETRY_STARTED

DLQ_MOVED

NOTIFICATION_COMPLETED

---

# 12. Reliability Strategy

PulseTrace uses

- Retry
- Exponential Backoff
- Dead Letter Queue
- Idempotency
- Structured Logging

Failures should never crash the application.

---

# 13. Scalability Strategy

Version 1

Single API

Single Worker

Single Database

Future

Multiple Workers

Horizontal Queue Scaling

Multiple Adapters

No architectural redesign should be required.

---

# 14. Design Decisions

Why BullMQ?

Simple

Reliable

Redis-based

Excellent TypeScript support

Production-ready

Easy to explain

---

Why PostgreSQL?

Reliable

Relational

Strong Prisma support

Widely used

---

Why Redis?

BullMQ backend

Fast

Simple

Production standard

---

Why Express?

Minimal

Easy to understand

Large ecosystem

---

Why React?

Modern

Industry standard

Good dashboard ecosystem

---

# 15. Architecture Principles

Every component has one responsibility.

Communication happens through defined interfaces.

Business logic stays inside services.

Workers perform asynchronous execution.

Providers are isolated through adapters.

Events record history.

Dashboard reads history.

---

# 16. Architecture Success Criteria

The architecture is considered successful if

A new notification channel can be added without changing business logic.

Failures are isolated.

Every notification is traceable.

Every major component is independently understandable.

Every design decision can be explained during a technical interview.

The architecture remains clean as new features are added.


One architectural improvement I'd make

I would not let the Notification Management module talk directly to BullMQ.

Instead, introduce a Queue Service abstraction:

Notification Service
        │
        ▼
Queue Service (Interface)
        │
        ▼
BullMQ Implementation

That way, your business logic depends on an interface rather than BullMQ itself. If you ever wanted to swap BullMQ for RabbitMQ, Kafka, or another queue, the NotificationService wouldn't need to change—only the queue implementation would. It's a small design choice that demonstrates good software engineering principles and gives you another strong talking point in interviews.