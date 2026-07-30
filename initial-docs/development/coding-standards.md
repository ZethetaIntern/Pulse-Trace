# Coding Standards

Project: PulseTrace

Version: 1.0

Status: Draft

---

# Purpose

This document defines the coding standards for PulseTrace.

Its goals are to:

- Maintain consistency
- Improve readability
- Reduce bugs
- Simplify code reviews
- Help AI generate predictable code
- Keep the architecture clean

Every contribution should follow these standards.

---

# Core Principles

Write code that is:

- Readable
- Predictable
- Testable
- Modular
- Maintainable

Code is read far more often than it is written.

---

# General Rules

## Rule 1

Prefer clarity over cleverness.

Bad

```ts
const x = arr.filter(a=>a.x).map(a=>a.y)
```

Good

```ts
const activeUsers = users
  .filter(user => user.isActive)
  .map(user => user.email)
```

---

## Rule 2

Functions should do one thing.

Avoid functions that:

- validate
- query database
- send email
- publish events

all at once.

---

## Rule 3

Keep functions small.

Target

20–40 lines

Split large functions into smaller helpers.

---

## Rule 4

Avoid duplicate code.

If logic is repeated more than once,
extract it into a reusable function or service.

---

## Rule 5

Never leave dead code.

Delete unused:

- variables
- functions
- imports
- files

---

# Naming Conventions

## Variables

camelCase

```ts
notificationId
deliveryStatus
retryCount
```

---

## Functions

Use verbs.

Examples

```ts
createNotification()

queueNotification()

sendEmail()

renderTemplate()

publishEvent()
```

Avoid names like

```
process()

handle()

execute()

doStuff()
```

unless context makes them obvious.

---

## Classes

PascalCase

```ts
NotificationService

EmailProvider

ReplayService
```

---

## Interfaces

PascalCase

```ts
NotificationRepository

QueueService

EmailProvider
```

Do not prefix with "I".

Bad

```
INotificationRepository
```

---

## Enums

PascalCase

```ts
NotificationStatus

ChannelType

Priority
```

---

## Constants

UPPER_SNAKE_CASE

```ts
MAX_RETRIES

DEFAULT_TIMEOUT

QUEUE_NAME
```

---

## Files

kebab-case

```
notification-service.ts

queue-worker.ts

template-renderer.ts
```

---

## Folders

lowercase

```
services

repositories

controllers

validators
```

---

# TypeScript Standards

Always enable strict mode.

Never use

```ts
any
```

Prefer

```ts
unknown
```

or proper interfaces.

---

Always define types.

Bad

```ts
function send(data)
```

Good

```ts
function send(data: NotificationRequest)
```

---

Prefer interfaces for object contracts.

---

# Architecture Rules

Controllers

- Receive requests
- Validate input
- Call services
- Return responses

Controllers must never contain business logic.

---

Services

Contain business logic.

Services may call:

- repositories
- providers
- event publisher
- queue

---

Repositories

Only database access.

No business rules.

---

Validators

Only validation.

No database operations.

---

Providers

Only communicate with external systems.

Never access database.

---

# Dependency Rules

Allowed

Controller

↓

Service

↓

Repository

↓

Database

---

Service

↓

Queue

---

Service

↓

Provider

---

Not Allowed

Controller

↓

Database

Controller

↓

Queue

Repository

↓

HTTP

Provider

↓

Database

---

# Error Handling

Never swallow errors.

Bad

```ts
try {

}

catch {

}
```

Always log meaningful errors.

---

Create custom errors.

Examples

```ts
ValidationError

ProviderError

QueueError

TemplateError
```

---

Return user-friendly messages.

Never expose stack traces.

---

# Logging Standards

Log important business events.

Include

- notificationId
- executionId
- correlationId
- provider
- workerId

Avoid logging sensitive data.

---

# Comments

Prefer self-explanatory code.

Avoid

```ts
// increment i

i++
```

Good comments explain

WHY

not

WHAT.

---

# Async Programming

Always use async/await.

Avoid chained .then()

---

Await asynchronous operations.

Never ignore promises.

---

# Validation

Validate all external input.

Never trust:

- request body
- query params
- headers

---

# Database Rules

Repositories own queries.

Never write SQL in controllers.

Never duplicate queries.

Use transactions when modifying multiple records.

---

# Event Rules

Every important state transition must publish an event.

Events are immutable.

Never modify historical events.

---

# Queue Rules

Queue only lightweight payloads.

Pass IDs instead of large objects.

Good

```ts
{
  notificationId
}
```

Bad

Entire notification object

---

# Provider Rules

Every provider implements the same interface.

Example

```ts
send()

health()

```

Business logic must never depend on provider-specific APIs.

---

# API Rules

Always return consistent responses.

```json
{
  "success": true,
  "message": "...",
  "data": {}
}
```

Errors

```json
{
  "success": false,
  "message": "...",
  "error": {}
}
```

---

# Testing Rules

Every service should have unit tests.

Repositories require integration tests.

Critical workflows require end-to-end tests.

---

# Git Standards

Branch names

```
feature/notification-api

feature/replay-system

fix/template-renderer
```

---

Commit messages

```
feat:

fix:

refactor:

docs:

test:

chore:
```

Examples

```
feat: implement notification queue

fix: retry event ordering

docs: update API specification
```

---

# Code Review Checklist

Before committing, verify:

✓ Code compiles

✓ Lint passes

✓ Tests pass

✓ No dead code

✓ No console.log()

✓ Proper error handling

✓ Naming conventions followed

✓ Architecture respected

✓ Documentation updated if necessary

---

# AI Coding Rules

AI should:

- Modify only requested files
- Follow existing architecture
- Reuse existing abstractions
- Avoid introducing unnecessary dependencies
- Never rewrite unrelated code
- Prefer small, reviewable changes

Every AI-generated change should be reviewed before merging.

---

# Definition of Done

Code is considered production-ready when:

- It is readable.
- It follows the architecture.
- It has appropriate validation.
- It handles errors gracefully.
- It is tested.
- It is documented where necessary.
- It follows these coding standards.

Quality is measured by maintainability, not by the amount of code written.