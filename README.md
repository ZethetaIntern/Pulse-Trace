# PulseTrace

PulseTrace is a notification processing backend with an asynchronous queue-based delivery pipeline, immutable event timeline, replay system, and a React monitoring dashboard. It is built as a TypeScript monorepo targeting educational and portfolio use cases.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white)
![BullMQ](https://img.shields.io/badge/BullMQ-EF2D2D)
![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwind-css&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Pino](https://img.shields.io/badge/Pino-444)

## Features

- **Notification API** — Create, retrieve, list, and filter notifications via a RESTful API with pagination and sorting.
- **PostgreSQL persistence** — All notifications, users, templates, events, replay executions, and preferences are stored in PostgreSQL via Prisma.
- **Redis/BullMQ queue** — Notification processing is offloaded to background workers using BullMQ with configurable retry and exponential backoff.
- **Delivery engine** — Notifications flow through a processing pipeline that transitions through CREATED → QUEUED → PROCESSING → DELIVERED/FAILED states. Delivery is currently mocked; provider adapters are stubbed for future integration.
- **Event timeline** — Every notification state transition is recorded as an immutable event, providing a complete chronological execution history.
- **Replay system** — Previously processed notifications can be replayed. A replay creates a new notification linked to the original via a `ReplayExecution` record, preserving the original timeline while the new notification goes through the full processing pipeline.
- **Monitoring dashboard** — A React SPA for browsing notifications, viewing timelines, triggering replays, and checking API health.

## Architecture

```
┌─────────────┐      ┌──────────────┐
│  Dashboard   │─────▶│   Express     │
│  (React/Vite)│      │   API Server  │
└─────────────┘      └──────┬───────┘
                            │
                ┌───────────┼───────────┐
                │           │           │
                ▼           ▼           ▼
           ┌─────────┐ ┌────────┐ ┌──────────┐
           │PostgreSQL│ │ Redis  │ │ BullMQ   │
           │  (Prisma)│ │        │ │ Queue    │
           └─────────┘ └────────┘ └────┬─────┘
                                       │
                                       ▼
                                ┌──────────────┐
                                │ Notification │
                                │   Worker     │
                                └──────┬───────┘
                                       │
                                       ▼
                                ┌──────────────┐
                                │   Delivery    │
                                │  (mocked)     │
                                └──────────────┘
```

### Architectural layers

- **Routes** — Express routers that map HTTP methods and paths to controller methods.
- **Controllers** — Parse requests, validate input, call services, format responses. No business logic or database access.
- **Services** — Application/business logic. Coordinate repositories, event recording, and queue operations. No HTTP or database access.
- **Repositories** — Data-access layer wrapping Prisma. Isolated from business logic.
- **Infrastructure** — Prisma client, BullMQ queue/worker, Pino logger. Wired together via composition roots.
- **Shared** — Cross-cutting concerns: error handling middleware, HTTP error class, async handler wrapper, response helpers.

## Tech Stack

| Layer | Technology | Version (verified) |
|-------|-----------|-------------------|
| Language | TypeScript | ^5.5.0 |
| Runtime | Node.js | 20 (Docker base) |
| HTTP framework | Express | ^4.19.0 |
| ORM | Prisma | ^5.16.0 |
| Database | PostgreSQL | 16 (Alpine) |
| Queue | BullMQ | ^5.12.0 |
| Queue broker | Redis | 7 (Alpine) |
| Redis client | ioredis | ^5.4.0 |
| Logging | Pino | ^9.1.0 |
| Env config | dotenv | ^16.4.0 |
| Frontend framework | React | ^18.3.1 |
| Frontend routing | React Router | ^6.26.0 |
| Data fetching | TanStack React Query | ^5.56.0 |
| CSS | Tailwind CSS | ^3.4.10 |
| Bundler | Vite | ^5.4.2 |
| Monorepo | npm workspaces | — |
| Containerization | Docker Compose | 3.8 |

## Project Structure

```
pulse-trace/
├── apps/
│   ├── api/                          # Backend API
│   │   ├── prisma/
│   │   │   ├── schema.prisma         # Database schema
│   │   │   ├── seed.ts               # Idempotent seed script
│   │   │   └── migrations/           # Prisma migrations
│   │   └── src/
│   │       ├── app.ts                # Express app setup, CORS, routes
│   │       ├── server.ts             # Server entry, worker init, graceful shutdown
│   │       ├── config/env.ts         # Environment variable loading
│   │       ├── infrastructure/
│   │       │   ├── database/prisma.ts # Prisma client singleton
│   │       │   ├── logger/            # Pino logger
│   │       │   └── queue/             # BullMQ queue and worker
│   │       ├── modules/
│   │       │   ├── notifications/     # Notification CRUD, processing, timeline
│   │       │   └── replay/            # Replay system
│   │       └── shared/
│   │           ├── errors/            # HttpError class
│   │           ├── middleware/         # Error handler
│   │           └── utils/             # asyncHandler, sendSuccess/sendError
│   └── dashboard/                     # Frontend monitoring dashboard
│       └── src/
│           ├── api/client.ts          # API client functions
│           ├── components/            # Reusable UI components
│           ├── hooks/                 # React Query hooks
│           ├── layouts/               # App layout with sidebar
│           ├── pages/                 # Overview, Notifications, Detail pages
│           └── types/                 # TypeScript type definitions
├── docker/
│   └── Dockerfile                     # API container image
├── docker-compose.yml                 # PostgreSQL + Redis
├── initial-docs/                      # Design documents and specifications
├── package.json                       # Root workspace config
├── .env.example                       # Environment variable template
└── README.md
```

## Getting Started

### Prerequisites

- **Node.js** 20 or later
- **Docker** and **Docker Compose**
- **npm** (comes with Node.js)

### 1. Clone the repository

```bash
git clone <repository-url>
cd pulse-trace
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

The `.env` file at the repository root is the single source of truth for all environment variables. The defaults in `.env.example` work with the Docker services started in step 4.

### 4. Start Docker services (PostgreSQL + Redis)

```bash
docker compose up -d
```

Verify both containers are healthy:

```bash
docker compose ps
```

### 5. Set up the database

```bash
cd apps/api
npx prisma generate
npx prisma migrate dev
npx prisma db seed
cd ../..
```

### 6. Start the backend API

```bash
npm run dev
```

The API starts on `http://localhost:4000`. Verify with:

```bash
curl http://localhost:4000/health
```

### 7. Start the dashboard

In a separate terminal:

```bash
npm run dev:dashboard
```

The dashboard starts on `http://localhost:5173` and proxies API requests to `localhost:4000`.

## Environment Variables

| Variable | Purpose | Required | Default | Example |
|----------|---------|----------|---------|---------|
| `PORT` | API server port | No | `4000` | `4000` |
| `NODE_ENV` | Runtime environment | No | `development` | `development` |
| `DATABASE_URL` | PostgreSQL connection string | Yes | — | `postgresql://pulsetrace:pulsetrace@localhost:5432/pulsetrace` |
| `REDIS_URL` | Redis connection string | No | `redis://localhost:6379` | `redis://localhost:6379` |
| `LOG_LEVEL` | Pino log level | No | `info` | `info` |
| `QUEUE_ATTEMPTS` | BullMQ retry attempts per job | No | `3` | `3` |
| `QUEUE_BACKOFF_MS` | BullMQ backoff delay in ms | No | `1000` | `1000` |

The root `.env` is loaded by the API via `dotenv` resolved from the source tree root. Do not create `apps/api/.env` — it will conflict.

## Docker

The repository provides a `docker-compose.yml` that runs PostgreSQL and Redis:

```bash
# Start services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs postgres
docker compose logs redis

# Stop services
docker compose down

# Stop and remove volumes (deletes all data)
docker compose down -v
```

A Dockerfile for the API is located at `docker/Dockerfile`. It builds a production image using `node:20-alpine`, generates the Prisma client, compiles TypeScript, and runs the API on port 4000.

## API

All endpoints return a JSON envelope:

```json
{
  "success": true,
  "message": "...",
  "data": { ... }
}
```

Error responses:

```json
{
  "success": false,
  "message": "...",
  "error": {
    "code": "ERROR_CODE",
    "details": [{ "field": "...", "message": "..." }]
  }
}
```

### Health

```
GET /health
```

Returns API status, uptime, version, and environment.

**Response (200):**

```json
{
  "status": "ok",
  "timestamp": "2026-08-20T12:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "development"
}
```

### Create Notification

```
POST /api/v1/notifications
```

Accepts a notification request for asynchronous processing and delivery.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | UUID string | Yes | Recipient user ID |
| `templateId` | UUID string | Yes | Template to use |
| `channel` | `EMAIL`, `SMS`, `IN_APP` | Yes | Delivery channel |
| `category` | `TRANSACTIONAL`, `SECURITY`, `SYSTEM`, `INFORMATIONAL` | Yes | Notification category |
| `priority` | `LOW`, `NORMAL`, `HIGH`, `CRITICAL` | No (default: `NORMAL`) | Priority level |
| `variables` | JSON object | No | Template variables (stored as `payload`) |
| `metadata` | JSON object | No | Arbitrary metadata |

**Response (202):**

```json
{
  "success": true,
  "message": "Notification accepted for processing",
  "data": {
    "notificationId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "QUEUED"
  }
}
```

**Error codes:** `USER_NOT_FOUND` (400), `TEMPLATE_NOT_FOUND` (400), `TEMPLATE_CHANNEL_MISMATCH` (400), `QUEUE_UNAVAILABLE` (503), `INVALID_REQUEST` (400)

### Get Notification

```
GET /api/v1/notifications/:notificationId
```

Returns the full notification record.

**Path parameter:** `notificationId` — valid UUID

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "...",
    "userId": "...",
    "templateId": "...",
    "channel": "EMAIL",
    "category": "TRANSACTIONAL",
    "priority": "NORMAL",
    "status": "DELIVERED",
    "payload": {},
    "metadata": {},
    "createdAt": "2026-08-20T12:00:00.000Z",
    "updatedAt": "2026-08-20T12:00:05.000Z"
  }
}
```

**Error codes:** `NOT_FOUND` (404), `INVALID_REQUEST` (400)

### List Notifications

```
GET /api/v1/notifications
```

Returns a paginated, filterable, sortable list of notifications.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Items per page (max 100) |
| `status` | enum | — | Filter by status |
| `channel` | enum | — | Filter by channel |
| `category` | enum | — | Filter by category |
| `priority` | enum | — | Filter by priority |
| `userId` | UUID | — | Filter by user |
| `sort` | `createdAt`, `status`, `priority`, `channel` | `createdAt` | Sort field |
| `order` | `asc`, `desc` | `desc` | Sort order |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "items": [ ... ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

### Get Notification Timeline

```
GET /api/v1/notifications/:notificationId/timeline
```

Returns the complete chronological event history for a notification.

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "event": "NOTIFICATION_CREATED",
      "timestamp": "2026-08-20T12:00:00.000Z",
      "metadata": { "source": "api" }
    }
  ]
}
```

### Replay Notification

```
POST /api/v1/notifications/:notificationId/replay
```

Creates a new notification by copying the original's data and re-enqueuing it. Only notifications with status DELIVERED, FAILED, RETRY_PENDING, DLQ, or SKIPPED can be replayed.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reason` | string | No | Reason for replay |

**Response (202):**

```json
{
  "success": true,
  "data": {
    "replayId": "...",
    "notificationId": "new-notification-uuid"
  }
}
```

**Error codes:** `REPLAY_NOT_ALLOWED` (400), `NOT_FOUND` (404), `QUEUE_UNAVAILABLE` (503)

### Get Replay History

```
GET /api/v1/notifications/:notificationId/replays
```

Returns all replay executions triggered from a given notification.

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "replayId": "...",
      "originalNotificationId": "...",
      "newNotificationId": "...",
      "reason": "Provider recovered",
      "triggeredBy": "api",
      "createdAt": "2026-08-20T12:05:00.000Z",
      "newNotificationStatus": "DELIVERED"
    }
  ]
}
```

## Notification Lifecycle

```
CREATED → QUEUED → PROCESSING → DELIVERED
                                  ↓ (on error)
                               FAILED ←→ RETRY_SCHEDULED → RETRY_STARTED → PROCESSING
                                  ↓ (after max retries)
                                 DLQ
```

When a notification is created via `POST /api/v1/notifications`:

1. The notification is persisted with status `CREATED`.
2. Three creation events are recorded: `NOTIFICATION_CREATED`, `REQUEST_VALIDATED`, `NOTIFICATION_STORED`.
3. Status transitions to `QUEUED` and the job is enqueued in BullMQ.
4. A `JOB_QUEUED` event is recorded.

When the background worker picks up the job:

1. Status transitions to `PROCESSING`. Events: `WORKER_STARTED`.
2. Delivery is attempted (currently mocked to always succeed).
3. On success: status transitions to `DELIVERED`. Event: `WORKER_COMPLETED`.
4. On failure: status transitions to `FAILED`. Event: `DELIVERY_FAILED`. If retries remain, `RETRY_SCHEDULED` is recorded and BullMQ retries with exponential backoff. If retries are exhausted, the job fails permanently.

If the queue is unavailable when enqueueing, the notification remains persisted with status `FAILED` and a `DELIVERY_FAILED` event with `stage: "enqueue"` is recorded.

## Event Timeline

Every notification has an append-only event history stored in the `NotificationEvents` table. Events record:

- `eventType` — The type of event (e.g. `NOTIFICATION_CREATED`, `WORKER_STARTED`, `DELIVERY_FAILED`)
- `statusBefore` / `statusAfter` — Status transition, when applicable
- `executionId` — Groups events belonging to a single processing run (the BullMQ job ID)
- `metadata` — Arbitrary JSON context (worker ID, attempt number, error messages, etc.)

Events are ordered by `occurredAt ASC` with `id ASC` as a deterministic tie-breaker.

The full list of event types implemented in the current codebase:

| Event | When |
|-------|------|
| `NOTIFICATION_CREATED` | Notification persisted |
| `REQUEST_VALIDATED` | Input validation passed |
| `NOTIFICATION_STORED` | Stored in database |
| `JOB_QUEUED` | BullMQ job enqueued |
| `WORKER_STARTED` | Worker picked up the job |
| `WORKER_COMPLETED` | Worker finished processing |
| `DELIVERY_FAILED` | Delivery attempt failed |
| `RETRY_SCHEDULED` | Another attempt will follow |
| `RETRY_STARTED` | Retry attempt beginning |
| `REPLAY_REQUESTED` | Replay triggered (on new notification) |
| `REPLAY_STARTED` | Replay job picked up by worker |
| `REPLAY_COMPLETED` | Replay processing succeeded |

## Replay System

Replay allows re-executing a previously processed notification without modifying its original timeline.

**How it works:**

1. `POST /api/v1/notifications/:id/replay` validates that the original notification is in a replayable state.
2. A **new** Notification record is created, copying the original's `userId`, `templateId`, `channel`, `category`, `priority`, and `payload`. The new notification's `metadata` includes `replayedFrom: <originalId>`.
3. A `ReplayExecution` record links the original to the new notification.
4. A `REPLAY_REQUESTED` event is recorded on the new notification.
5. The new notification transitions to `QUEUED` and is enqueued through the existing BullMQ pipeline.
6. When the worker processes the new notification, it detects the `ReplayExecution` link and records `REPLAY_STARTED` before processing and `REPLAY_COMPLETED` after successful delivery.
7. The original notification and its timeline are never modified.

```
Original Notification          ReplayExecution           New Notification
┌──────────────────┐    ┌──────────────────────┐    ┌──────────────────┐
│ id: abc-123      │◄───│ originalNotification  │───▶│ id: def-456      │
│ status: DELIVERED│    │ newNotification ──────│    │ status: QUEUED   │
│ events: [...]    │    │ reason: "..."         │    │ events: [...]    │
└──────────────────┘    └──────────────────────┘    └──────────────────┘
  (unchanged)              (audit trail)              (goes through
                                                        full pipeline)
```

## Dashboard

The React dashboard is a single-page application built with Vite, React, React Router, TanStack React Query, and Tailwind CSS. It runs on port 5173 and proxies API requests to the backend at port 4000.

### Pages

**Overview** (`/`)
- System health card showing API status, environment, version, and uptime (auto-refreshes every 30 seconds).
- Notification summary with counts for the current fetch (up to 100 items). These counts are derived from the notification list API and are **not** global database totals.
- Monitoring notice indicating that detailed queue/worker monitoring endpoints are not yet implemented.

**Notifications** (`/notifications`)
- Paginated table of notifications with columns: Created, Status, Channel, Category, Priority, ID.
- Filter bar with dropdowns for Status, Channel, Category, and Priority.
- Sortable columns: Created, Channel, Priority (click to toggle ascending/descending).
- Pagination with Previous/Next buttons and page indicator.
- Click any row to navigate to the notification detail page.

**Notification Detail** (`/notifications/:notificationId`)
- Full notification details: ID, status, user, template, channel, category, priority, timestamps, payload (expandable JSON), metadata (expandable JSON).
- Timeline view showing the complete event history as a color-coded vertical timeline with expandable metadata for each event.
- Replay section (shown for DELIVERED, FAILED, RETRY_PENDING, DLQ, and SKIPPED notifications) with an optional reason input and confirmation flow.
- Replay history table showing all past replays with links to the new notification and its status.
- Loading, error, and empty states on all data-fetching sections.

### Dashboard Routes

| Path | Component |
|------|-----------|
| `/` | OverviewPage |
| `/notifications` | NotificationsPage |
| `/notifications/:notificationId` | NotificationDetailPage |

## Development Commands

### Root commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start the API in watch mode |
| `npm run dev:dashboard` | Start the dashboard dev server |
| `npm run build` | Compile the API TypeScript |
| `npm run build:dashboard` | Compile the dashboard (tsc + vite build) |
| `npm run start` | Run the compiled API |
| `npm run lint` | Lint all `.ts` files across workspaces |
| `npm run format` | Format all `.ts` files with Prettier |
| `npm run format:check` | Check formatting without writing |

### API commands (from `apps/api/`)

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start API with tsx watch |
| `npm run build` | Compile TypeScript |
| `npm run start` | Run compiled `dist/server.js` |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed the database |

### Dashboard commands (from `apps/dashboard/`)

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | TypeScript check + Vite production build |
| `npm run lint` | ESLint for `.ts` and `.tsx` files |
| `npm run preview` | Preview production build locally |

## Database

PulseTrace uses Prisma as the ORM with PostgreSQL.

**Schema location:** `apps/api/prisma/schema.prisma`

**Tables:**

| Table | Purpose |
|-------|---------|
| `Users` | Notification recipients |
| `Templates` | Reusable notification templates |
| `Notifications` | Current state of each notification |
| `NotificationEvents` | Immutable, append-only event history |
| `ReplayExecutions` | Audit trail linking original → replayed notifications |
| `UserPreferences` | Per-user channel/category delivery preferences |

**Common operations:**

```bash
# Generate Prisma client after schema changes
npx prisma generate

# Create and apply a new migration
npx prisma migrate dev

# Seed the database (idempotent — skips if data exists)
npx prisma db seed

# Open Prisma Studio (visual database browser)
npx prisma studio
```

The seed script creates a representative dataset: one user, one template, one notification, one event, one replay execution, and one user preference.

## Testing / Verification

PulseTrace does not currently have an automated test suite. Verification is performed through:

| Method | Command | What it checks |
|--------|---------|---------------|
| API compilation | `npm run build` | TypeScript compiles without errors |
| Dashboard compilation | `npm run build:dashboard` | TypeScript + Vite build succeeds |
| Lint (root) | `npm run lint` | ESLint passes on all `.ts` files |
| Lint (dashboard) | `cd apps/dashboard && npm run lint` | ESLint passes on `.ts` and `.tsx` files |
| Format check | `npm run format:check` | Prettier formatting is consistent |
| Docker health | `docker compose ps` | PostgreSQL and Redis are running |
| Health endpoint | `curl http://localhost:4000/health` | API is responsive |
| Runtime verification | Manual testing via dashboard and curl | End-to-end flow works |

To manually verify the full pipeline:

1. Start Docker, API, and dashboard.
2. Seed the database: `cd apps/api && npx prisma db seed`.
3. Open `http://localhost:5173` in a browser.
4. Verify the Overview page shows health status and notification summary.
5. Navigate to Notifications and confirm the seeded notification appears.
6. Click the notification to view its detail page and timeline.
7. Test filters, sorting, and pagination on the Notifications page.
8. If a replayable notification exists, test the replay flow.

## Current Status / Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 1 | Core Notification API | Done |
| Phase 2 | PostgreSQL Database Foundation | Done |
| Phase 3 | Queue System (BullMQ + Redis) | Done |
| Phase 4 | Delivery Engine | Done |
| Phase 5 | Event Timeline | Done |
| Phase 6 | Replay System | Done |
| Phase 7 | React Monitoring Dashboard | Done |
| Phase 8 | Analytics & Metrics | Not started |
| Phase 9 | Testing & Documentation | Not started |

**Phase 8** will add aggregated metrics (success rate, failure rate, delivery trends, channel statistics) and a more detailed analytics dashboard.

**Phase 9** will add unit tests, integration tests, end-to-end tests, API documentation, and production-quality documentation.

## Known Limitations

- **No automated test suite.** Unit, integration, and end-to-end tests are planned for Phase 9.
- **No analytics or metrics endpoints.** Aggregated statistics (success rate, failure rate, delivery time, channel distribution) are planned for Phase 8.
- **No detailed queue/worker monitoring.** The dashboard's monitoring notice references `/monitoring/health`, `/monitoring/queues`, and `/monitoring/workers` endpoints that have not been implemented.
- **Delivery is mocked.** The processing pipeline always transitions to DELIVERED. Actual provider integrations (email, SMS, in-app) are stubbed for future phases.
- **No authentication or authorization.** The API is open. Auth is explicitly out of scope for v1.
- **No production deployment configuration.** The Dockerfile builds a production image, but there is no Kubernetes, CI/CD, or hosted deployment setup.

## Engineering Principles

- **Controller → Service → Repository.** HTTP handlers do not contain business logic. Services do not access the database directly. Repositories wrap all Prisma calls.
- **Prisma isolated in repositories.** The rest of the application depends on repository interfaces, not on Prisma types directly.
- **Queue abstraction.** The notification service depends on a `QueueService` interface, not on BullMQ. The queue technology can be replaced without touching business logic.
- **Immutable event history.** `NotificationEvents` are append-only. Events are never updated or deleted.
- **Replay creates new execution.** A replay never modifies the original notification or its timeline. It creates a new notification linked via `ReplayExecution`.
- **Composition roots.** Each module has a `composition.ts` that wires repositories and services. Dependencies flow inward; infrastructure depends on application, not the reverse.
- **Best-effort failure bookkeeping.** If recording a failure event itself fails (e.g. database down), the original error is logged and still propagates rather than being swallowed.
- **Graceful shutdown.** The server handles `SIGTERM` and `SIGINT`, draining the HTTP server, closing the worker, closing the queue, and disconnecting Prisma before exiting.
