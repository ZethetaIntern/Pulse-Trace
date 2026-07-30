# Delivery Engine

Project: PulseTrace

Version: 1.0

Module: Delivery Engine

Status: Draft

---

# Purpose

The Delivery Engine is the core business module of PulseTrace.

It is responsible for transforming a queued notification into a successfully delivered notification by executing a well-defined processing pipeline.

The Delivery Engine coordinates validation, preference evaluation, template rendering, channel selection, provider communication, event generation, and final status updates.

It does **NOT** manage HTTP requests or queue scheduling.

---

# Why This Module Exists

Notification delivery is much more than calling an email API.

Before sending a notification, the system must determine:

- Should this notification be sent?
- Which channel should be used?
- Which template should be rendered?
- Which provider should deliver it?
- What happens if delivery fails?
- Which events should be recorded?

The Delivery Engine centralizes these decisions into a single, deterministic workflow.

---

# Responsibilities

The Delivery Engine is responsible for:

- Processing queued notifications
- Evaluating notification eligibility
- Checking user preferences
- Resolving templates
- Rendering notification content
- Selecting delivery channels
- Invoking provider adapters
- Handling provider responses
- Updating notification status
- Recording lifecycle events

The Delivery Engine is NOT responsible for:

- Receiving API requests
- Persisting initial notifications
- Queue management
- Worker scheduling
- Dashboard rendering

---

# Position in Architecture

Notification Worker

↓

Delivery Engine

↓

Preference Evaluation

↓

Template Rendering

↓

Channel Selection

↓

Provider Adapter

↓

Delivery Result

↓

Event Recording

↓

Final Status Update

---

# Business Goals

The engine must ensure:

Every notification is processed consistently.

Every processing decision is traceable.

Every failure is explainable.

Every delivery attempt produces an auditable history.

---

# Processing Pipeline

Every notification follows the same execution pipeline.

Queued Notification

↓

Load Notification

↓

Validate Current State

↓

Check User Preferences

↓

Resolve Template

↓

Render Content

↓

Select Channel

↓

Resolve Provider Adapter

↓

Send Notification

↓

Process Provider Response

↓

Update Status

↓

Generate Events

↓

Complete Processing

---

# Functional Requirements

## FR-001

The engine shall load notification data using Notification ID.

---

## FR-002

The engine shall verify that the notification is eligible for processing.

---

## FR-003

The engine shall evaluate user preferences before delivery.

---

## FR-004

The engine shall resolve the configured notification template.

---

## FR-005

The engine shall render template variables.

---

## FR-006

The engine shall determine the delivery channel.

---

## FR-007

The engine shall invoke the appropriate provider adapter.

---

## FR-008

The engine shall process provider responses.

---

## FR-009

The engine shall update notification status.

---

## FR-010

The engine shall generate lifecycle events for every major processing step.

---

# Notification Processing States

A notification may transition through:

QUEUED

↓

PROCESSING

↓

PREFERENCE_CHECKED

↓

TEMPLATE_RENDERED

↓

CHANNEL_SELECTED

↓

PROVIDER_INVOKED

↓

DELIVERED

OR

FAILED

OR

RETRY_PENDING

---

# Preference Evaluation

Before delivery, the engine evaluates whether the notification should be sent.

Checks include:

- Notification enabled
- Channel enabled
- Category enabled

Future checks:

- Quiet Hours
- Time Zone Rules
- Frequency Limits

If delivery is skipped, processing ends gracefully.

An event is recorded explaining why.

---

# Template Resolution

The engine retrieves the template associated with the notification.

Responsibilities:

- Load template
- Verify template exists
- Validate required variables
- Prepare rendering context

If template resolution fails:

Processing stops.

Failure event recorded.

---

# Template Rendering

Variables are injected into the template.

Example:

Template

Hello {{name}}

Variables

name = John

Output

Hello John

Rendering must never modify stored templates.

---

# Channel Selection

The engine determines the final delivery channel.

Version 1 supports:

Email

SMS (Mock)

In-App (Mock)

Future versions may support:

Push

Slack

Discord

WhatsApp

Webhook

---

# Provider Adapter Resolution

Each channel maps to a provider adapter.

Example

Email

↓

Email Adapter

SMS

↓

SMS Adapter

The Delivery Engine communicates only with adapters.

It never communicates directly with providers.

---

# Adapter Contract

Every adapter exposes a common interface.

Responsibilities:

- Accept normalized payload
- Communicate with provider
- Return normalized result

Adapters isolate provider-specific implementation.

---

# Provider Response

Provider responses are normalized into a common structure.

Result includes:

- Success
- Failure
- Provider Message
- External Message ID
- Timestamp

Business logic never depends on provider-specific responses.

---

# Event Generation

Every processing stage creates immutable events.

Examples

DELIVERY_STARTED

PREFERENCE_CHECKED

TEMPLATE_RESOLVED

TEMPLATE_RENDERED

CHANNEL_SELECTED

PROVIDER_INVOKED

DELIVERY_SUCCEEDED

DELIVERY_FAILED

RETRY_SCHEDULED

---

# Status Updates

The Delivery Engine owns processing-related status transitions.

Examples

PROCESSING

DELIVERED

FAILED

RETRY_PENDING

Delivery status must always match recorded events.

---

# Failure Handling

Failures include:

Template Failure

Preference Failure

Adapter Failure

Provider Failure

Unexpected Exception

Each failure must:

Generate event

Update status

Log structured information

Return control to retry mechanism

---

# Retry Integration

The Delivery Engine does NOT schedule retries.

It reports failures.

Retry scheduling belongs to the Queue & Workers module.

This separation keeps delivery logic independent of queue infrastructure.

---

# Logging Requirements

Each delivery attempt logs:

Notification ID

Execution ID

Channel

Provider

Processing Duration

Result

Failure Reason

Retry Count

Logs must be structured and machine-readable.

---

# Metrics

Track:

Deliveries Started

Deliveries Completed

Delivery Success Rate

Delivery Failure Rate

Average Processing Time

Template Failures

Preference Skips

Provider Failures

---

# Security Considerations

Never expose provider credentials.

Never log sensitive user data.

Sanitize template variables.

Validate rendered payload size.

Prevent template injection attacks.

---

# Performance Requirements

Target:

Average processing time under 500 ms (excluding provider latency).

Provider latency must not block other workers.

---

# Edge Cases

## Missing Template

Processing fails.

Failure event generated.

---

## Disabled Channel

Notification skipped.

Skip event generated.

---

## Missing Variables

Rendering fails.

Notification marked failed.

---

## Provider Timeout

Failure returned.

Retry delegated to Queue module.

---

## Unsupported Channel

Processing stops.

Failure event recorded.

---

# Acceptance Criteria

The feature is complete when:

✓ Notifications move through the complete processing pipeline.

✓ Preferences are evaluated.

✓ Templates render successfully.

✓ Provider adapters receive normalized payloads.

✓ Status updates correctly.

✓ Events are generated for every major stage.

✓ Failures are traceable.

✓ Delivery logic remains independent of queue infrastructure.

---

# Future Enhancements

Multiple Providers

Provider Failover

Smart Routing

Channel Priorities

Parallel Delivery

AI Provider Selection

Delivery Policies

Weighted Routing

---

# Dependencies

The Delivery Engine depends on:

- Notification Repository
- Template System
- User Preferences
- Event Service
- Provider Adapters

It must NOT depend on:

- HTTP Controllers
- Express Routes
- BullMQ Implementation
- Dashboard Components

---

# Success Definition

The Delivery Engine is successful when every notification follows a deterministic, observable, and extensible delivery pipeline where every decision, transition, and outcome is recorded and explainable without inspecting external logs.