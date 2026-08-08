# API Specification

Project: PulseTrace

Version: 1.0

Status: Draft

---

# Purpose

This document defines every public API exposed by PulseTrace.

The API is designed around business capabilities rather than database entities.

The API follows REST principles and returns consistent JSON responses.

---

# API Design Principles

- RESTful design
- Resource-oriented endpoints
- Consistent response format
- Predictable status codes
- Asynchronous processing
- Validation before execution
- No provider-specific information exposed
- No internal implementation details leaked

---

# Base URL

/api/v1

---

# Response Format

## Success Response

```json
{
  "success": true,
  "message": "Notification created successfully",
  "data": {}
}
```

---

## Error Response

```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "INVALID_REQUEST",
    "details": []
  }
}
```

---

# HTTP Status Codes

200 OK

201 Created

202 Accepted

204 No Content

400 Bad Request

401 Unauthorized (Future)

403 Forbidden (Future)

404 Not Found

409 Conflict

422 Unprocessable Entity

429 Too Many Requests (Future)

500 Internal Server Error

---

# Notification APIs

## Create Notification

POST /notifications

Purpose

Create a new notification.

The request is accepted immediately.

Actual delivery occurs asynchronously.

---

### Request

```json
{
  "userId": "uuid",
  "templateId": "uuid",
  "channel": "EMAIL",
  "category": "TRANSACTIONAL",
  "priority": "NORMAL",
  "variables": {
    "name": "John"
  },
  "metadata": {}
}
```

---

### Success

HTTP 202 Accepted

```json
{
  "success": true,
  "message": "Notification accepted for processing",
  "data": {
    "notificationId": "uuid",
    "status": "CREATED"
  }
}
```

---

### Validation Rules

Required

- userId
- templateId
- channel
- category

Optional

- priority
- metadata

---

## Get Notification

GET /notifications/{notificationId}

Purpose

Retrieve notification details.

---

### Response

```json
{
  "success": true,
  "data": {
    "id": "...",
    "status": "...",
    "channel": "...",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

## List Notifications

GET /notifications

Purpose

Retrieve notifications.

---

### Query Parameters

page

limit

status

channel

category

userId

sort

search

---

### Example

GET /notifications?page=1&limit=20&status=FAILED

---

# Event Timeline APIs

## Get Timeline

GET /notifications/{notificationId}/timeline

Purpose

Retrieve chronological execution history.

---

### Response

```json
{
  "success": true,
  "data": [
    {
      "event": "NOTIFICATION_CREATED",
      "timestamp": "...",
      "metadata": {}
    },
    {
      "event": "JOB_QUEUED",
      "timestamp": "...",
      "metadata": {}
    }
  ]
}
```

---

# Replay APIs

## Replay Notification

POST /notifications/{notificationId}/replay

Purpose

Replay an existing notification.

---

### Request

```json
{
  "reason": "Provider recovered"
}
```

---

### Response

```json
{
  "success": true,
  "message": "Replay started",
  "data": {
    "replayId": "...",
    "notificationId": "..."
  }
}
```

---

## Replay History

GET /notifications/{notificationId}/replays

Purpose

Retrieve all replay executions.

---

# Template APIs

## List Templates

GET /templates

---

## Create Template

POST /templates

---

### Request

```json
{
  "name": "Welcome Email",
  "channel": "EMAIL",
  "subject": "Welcome",
  "body": "Hello {{name}}"
}
```

---

## Get Template

GET /templates/{templateId}

---

## Update Template

PUT /templates/{templateId}

---

## Delete Template

DELETE /templates/{templateId}

---

# User Preference APIs

## Get Preferences

GET /users/{userId}/preferences

---

## Update Preferences

PUT /users/{userId}/preferences

---

### Request

```json
{
  "email": true,
  "sms": false,
  "inApp": true
}
```

---

# Analytics APIs

## Dashboard Metrics

GET /analytics/dashboard

Purpose

Retrieve dashboard summary metrics.

---

### Response

```json
{
  "success": true,
  "data": {
    "totalNotifications": 1200,
    "successRate": 98.3,
    "failureRate": 1.7,
    "retryCount": 23,
    "dlqCount": 4
  }
}
```

---

## Notification Trends

GET /analytics/trends

Query Parameters

from

to

interval

---

## Channel Analytics

GET /analytics/channels

---

# Monitoring APIs

## System Health

GET /monitoring/health

---

### Response

```json
{
  "status": "healthy",
  "database": "up",
  "redis": "up",
  "workers": "running"
}
```

---

## Queue Statistics

GET /monitoring/queues

---

### Response

```json
{
  "waiting": 25,
  "active": 3,
  "completed": 1024,
  "failed": 12,
  "delayed": 8
}
```

---

## Worker Status

GET /monitoring/workers

---

# Search APIs

## Search Notifications

GET /search

Query Parameters

query

status

channel

category

dateFrom

dateTo

---

# Pagination

Collection endpoints support:

page

limit

---

### Example

GET /notifications?page=2&limit=25

---

# Sorting

Supported

sort=createdAt

sort=status

sort=priority

sort=channel

order=asc

order=desc

---

# Filtering

Supported

status

channel

category

priority

userId

date range

---

# Error Codes

INVALID_REQUEST

NOT_FOUND

TEMPLATE_NOT_FOUND

USER_NOT_FOUND

INVALID_CHANNEL

INVALID_PRIORITY

QUEUE_UNAVAILABLE

DELIVERY_FAILED

REPLAY_NOT_ALLOWED

INTERNAL_ERROR

---

# Versioning Strategy

All endpoints include versioning.

Example

/api/v1/...

Future versions

/api/v2/...

Breaking changes require a new API version.

---

# Security

Version 1

Authentication intentionally excluded.

Future

JWT

API Keys

OAuth

RBAC

---

# Rate Limiting

Future enhancement.

Initial version does not implement API rate limiting.

---

# Idempotency

Future enhancement.

POST /notifications may support

Idempotency-Key

header to prevent duplicate notifications.

---

# API Design Principles

Every API should:

- Validate input
- Return consistent responses
- Never expose internal implementation
- Never expose provider credentials
- Use proper HTTP status codes
- Be independently testable

---

# Definition of Done

The API layer is complete when:

✓ Every feature has a documented endpoint.

✓ Validation rules are defined.

✓ Response schemas are consistent.

✓ Error codes are documented.

✓ Pagination and filtering are standardized.

✓ APIs remain independent of internal implementation details.