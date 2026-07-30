# Folder Structure

Project: PulseTrace

Version: 1.0

Status: Draft

---

# Purpose

This document defines the folder structure and architectural organization of PulseTrace.

The objective is to maintain a clean, scalable, and maintainable codebase where every file has a single responsibility.

The folder structure follows a **Modular Monolith** architecture with clear separation between business modules and shared infrastructure.

---

# Design Principles

The folder structure follows these principles:

- Feature-first organization
- Separation of concerns
- Single responsibility
- Dependency inversion
- Reusable infrastructure
- Independent modules
- Easy testing
- Easy navigation

---

# High-Level Structure

```

pulse-trace/

├── apps/
│   ├── api/
│   └── dashboard/
│
├── packages/
│   ├── shared/
│   └── types/
│
├── docs/
│
├── docker/
│
├── scripts/
│
├── .env.example
├── docker-compose.yml
├── package.json
└── README.md

```

---

# API Structure

```

apps/api/src/

├── modules/
├── infrastructure/
├── shared/
├── config/
├── app.ts
└── server.ts

```

---

# Modules

Every business capability lives inside `modules`.

```

modules/

├── notifications/
├── templates/
├── preferences/
├── analytics/
├── monitoring/
├── replay/

```

Each module owns its own logic.

Modules should be as independent as possible.

---

# Standard Module Structure

Every module follows the same layout.

```

notifications/

├── controllers/
├── services/
├── repositories/
├── dto/
├── entities/
├── routes/
├── validators/
├── interfaces/
├── events/
├── types/
└── index.ts

```

---

# Controllers

Purpose

Receive HTTP requests.

Responsibilities

- Parse request
- Validate input
- Call services
- Return response

Controllers must NOT contain business logic.

---

# Services

Purpose

Implement business logic.

Responsibilities

- Execute workflows
- Apply business rules
- Coordinate repositories
- Publish events

Services never perform direct HTTP operations.

---

# Repositories

Purpose

Access the database.

Responsibilities

- Read data
- Write data
- Execute queries

Repositories contain no business logic.

---

# DTO

Purpose

Define request and response contracts.

Responsibilities

- Input DTOs
- Output DTOs
- Validation schemas

DTOs isolate API contracts from database models.

---

# Entities

Purpose

Represent business models.

Examples

Notification

Template

Preference

ReplayExecution

Entities define business structure, not database queries.

---

# Validators

Purpose

Validate incoming data.

Examples

Create Notification Request

Replay Request

Template Validation

Validation occurs before reaching business logic.

---

# Routes

Purpose

Register API endpoints.

Routes should only map URLs to controllers.

---

# Interfaces

Purpose

Define contracts.

Examples

NotificationRepository

QueueService

EmailProvider

Interfaces reduce coupling between implementations.

---

# Events

Purpose

Define module-specific event types and payloads.

Examples

NotificationCreated

NotificationQueued

ReplayStarted

---

# Types

Purpose

Shared module-specific TypeScript types.

---

# Infrastructure

Infrastructure contains external integrations.

```

infrastructure/

├── database/
├── queue/
├── providers/
├── logger/
├── cache/
├── mail/
└── telemetry/

```

---

# Database

Contains

- Prisma client
- Database configuration
- Migrations
- Seed scripts

No business logic.

---

# Queue

Contains

- BullMQ configuration
- Worker registration
- Queue adapters

No notification logic.

---

# Providers

Contains provider implementations.

Examples

```

providers/

├── email/
├── sms/
└── in-app/

```

Every provider implements a common interface.

---

# Logger

Contains centralized logging configuration.

All modules use the same logger.

---

# Cache

Redis configuration.

Caching utilities.

---

# Shared

Shared contains reusable code used across multiple modules.

```

shared/

├── constants/
├── enums/
├── errors/
├── middleware/
├── utils/
├── helpers/
└── response/

```

Shared code should never depend on business modules.

---

# Config

Contains application configuration.

Examples

```

config/

database.ts

redis.ts

queue.ts

env.ts

logger.ts

```

---

# Dashboard Structure

```

apps/dashboard/src/

├── components/
├── pages/
├── layouts/
├── hooks/
├── services/
├── store/
├── types/
├── utils/
└── assets/

```

---

# Components

Reusable UI components.

---

# Pages

Application screens.

Dashboard

Notifications

Replay

Templates

Analytics

Monitoring

Settings

---

# Hooks

Custom React hooks.

---

# Services

API communication.

No UI logic.

---

# Store

Global application state.

---

# Naming Conventions

Folders

lowercase

Files

kebab-case

Interfaces

PascalCase

Services

NotificationService

Repositories

NotificationRepository

Controllers

NotificationController

DTO

CreateNotificationDto

Enums

NotificationStatus

---

# Dependency Rules

Controllers

↓

Services

↓

Repositories

↓

Infrastructure

Business modules must never directly depend on infrastructure implementations.

Always depend on interfaces.

---

# Import Rules

Allowed

Controller → Service

Service → Repository

Repository → Database

Service → Queue Interface

Service → Event Service

Not Allowed

Controller → Database

Controller → Queue

Repository → HTTP

Infrastructure → Controller

Infrastructure → Service

---

# Testing Structure

Every module contains its own tests.

```

notifications/

tests/

controller.test.ts

service.test.ts

repository.test.ts

```

Testing remains close to implementation.

---

# Documentation

Every module should include:

```

README.md

```

Containing

- Purpose
- Responsibilities
- Public APIs
- Dependencies

---

# Definition of Done

A folder structure is considered successful when:

- Every file has one responsibility.
- Business logic exists only in services.
- Database access exists only in repositories.
- Infrastructure remains isolated.
- Modules remain independent.
- Navigation is intuitive.
- Adding new features requires minimal changes to existing modules.

---

# Future Evolution

The structure is designed so that individual modules can be extracted into independent microservices in the future without significant refactoring.

Version 1 intentionally remains a Modular Monolith for simplicity, maintainability, and interview readiness.