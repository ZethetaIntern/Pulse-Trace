# PulseTrace

A notification processing backend with an asynchronous queue-based delivery pipeline, immutable event timeline, replay system, and a React monitoring dashboard.

## Features

- **Asynchronous notification processing** — Create notifications via REST API; they are enqueued and processed in the background.
- **BullMQ / Redis queue** — Background workers pick up jobs with configurable retry and exponential backoff.
- **PostgreSQL persistence** — All notifications, users, templates, events, and replay executions stored via Prisma.
- **Immutable event timeline** — Every state transition is recorded as an append-only event, providing a complete execution history.
- **Replay system** — Re-execute previously processed notifications without modifying the original timeline.
- **Analytics** — Aggregated dashboard metrics, delivery trends, and per-channel statistics.
- **React monitoring dashboard** — Browse notifications, view timelines, trigger replays, and check analytics.
- **Swagger API docs** — Interactive OpenAPI documentation served at `/docs`.

## Architecture

```
                    ┌─────────────┐
                    │   Client     │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Express API │◄──── Swagger UI (/docs)
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐    │     ┌──────▼──────┐
       │  PostgreSQL   │    │     │  BullMQ /   │
       │  (Prisma)     │    │     │  Redis      │
       └──────────────┘    │     └──────┬──────┘
                           │            │
                    ┌──────▼──────┐     │
                    │  Notification │◄───┘
                    │  Service      │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Worker     │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Delivery   │ (currently simulated)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ Event Timeline│ (immutable, append-only)
                    └─────────────┘
```

**Replay** creates a new notification linked to the original via a `ReplayExecution` record. The original timeline is never modified.

**Analytics** queries aggregated metrics from the `Notifications` and `NotificationEvents` tables via dedicated repository methods.

### Notification Lifecycle

```
CREATED → QUEUED → PROCESSING → DELIVERED
                                  ↓ (on error)
                               FAILED ←→ RETRY_SCHEDULED → RETRY_STARTED → PROCESSING
                                  ↓ (after max retries)
                                 DLQ
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, TypeScript, Express, Prisma, PostgreSQL, Redis, BullMQ, Pino |
| **Frontend** | React, TypeScript, TanStack Query, Recharts, Tailwind CSS, Vite |
| **Testing** | Jest, Supertest, Playwright |
| **Infrastructure** | Docker Compose, npm workspaces |

## Getting Started

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- npm (comes with Node.js)

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/siddpuhan/Pulse-Trace.git
cd Pulse-Trace

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env

# 4. Start PostgreSQL and Redis
docker compose up -d

# 5. Set up the database
cd apps/api
npx prisma generate
npx prisma migrate dev
npx prisma db seed
cd ../..

# 6. Start the API (http://localhost:4000)
npm run dev

# 7. Start the dashboard (http://localhost:5173)
npm run dev:dashboard
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | API server port |
| `NODE_ENV` | `development` | Runtime environment |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `LOG_LEVEL` | `info` | Pino log level |
| `QUEUE_ATTEMPTS` | `3` | BullMQ retry attempts |
| `QUEUE_BACKOFF_MS` | `1000` | BullMQ backoff delay (ms) |

## API

Interactive documentation is available at **http://localhost:4000/docs** (Swagger UI, development mode only).

The full OpenAPI 3.0.3 spec is at [`apps/api/docs/openapi.yaml`](apps/api/docs/openapi.yaml).

### Endpoint Groups

| Group | Base Path | Description |
|-------|-----------|-------------|
| Notifications | `/api/v1/notifications` | Create, get, list, filter, and sort notifications |
| Timeline | `/api/v1/notifications/:id/timeline` | Immutable event history for a notification |
| Replay | `/api/v1/notifications/:id/replay` | Re-execute a notification; view replay history |
| Analytics | `/api/v1/analytics` | Dashboard metrics, delivery trends, channel statistics |
| Health | `/health` | API status, uptime, version |

## Dashboard

The React dashboard runs at **http://localhost:5173** and proxies API requests to the backend.

### Pages

- **Overview** (`/`) — System health card and notification summary.
- **Notifications** (`/notifications`) — Filterable, sortable, paginated notification table.
- **Notification Detail** (`/notifications/:id`) — Full details, event timeline, replay trigger, and replay history.
- **Analytics** (`/analytics`) — Metric cards, delivery trend charts, and channel breakdown.

<!-- Screenshot: Dashboard Overview -->

<!-- Screenshot: Notifications List -->

<!-- Screenshot: Notification Detail + Timeline -->

<!-- Screenshot: Analytics Dashboard -->

## Testing

The test suite covers unit, integration, and end-to-end layers:

| Layer | Count | Framework | Command |
|-------|-------|-----------|---------|
| Unit tests | 150 | Jest | `npm run test:api` |
| Integration tests | 40 | Jest + Supertest | `npm run test:integration` |
| E2E tests | 9 | Playwright | `npm run test:e2e` |

**Integration tests** require Docker services (PostgreSQL + Redis) to be running.

**E2E tests** start the API and dashboard automatically via Playwright's `webServer` config.

```bash
# Run all unit tests
npm run test:api

# Run integration tests (requires Docker services)
npm run test:integration

# Run E2E tests (requires Docker services + Playwright browsers)
npx playwright install chromium
npm run test:e2e

# Lint and format check
npm run lint
npm run format:check
```

## Project Structure

```
apps/
├── api/                              # Backend API
│   ├── prisma/
│   │   ├── schema.prisma             # Database schema (6 tables)
│   │   ├── seed.ts                   # Idempotent seed script
│   │   └── migrations/
│   ├── docs/
│   │   └── openapi.yaml              # OpenAPI 3.0.3 spec
│   └── src/
│       ├── app.ts                    # Express setup, CORS, routes
│       ├── server.ts                 # Entry point, worker init, graceful shutdown
│       ├── config/                   # Environment variables
│       ├── infrastructure/           # Prisma client, BullMQ queue/worker, logger
│       ├── modules/
│       │   ├── notifications/        # CRUD, processing, timeline
│       │   ├── replay/               # Replay system
│       │   └── analytics/            # Dashboard metrics, trends, channels
│       └── shared/                   # Error handling, middleware, utilities
└── dashboard/                        # React monitoring dashboard
    └── src/
        ├── pages/                    # Overview, Notifications, Detail, Analytics
        ├── components/               # UI components + analytics charts
        ├── hooks/                    # React Query hooks
        ├── api/                      # API client
        └── types/                    # TypeScript types
```

## Architecture Principles

- **Controller → Service → Repository** — HTTP handlers contain no business logic. Services contain no database access. Repositories wrap all Prisma calls.
- **Dependency inversion** — Services depend on repository interfaces, not Prisma types directly.
- **Queue abstraction** — The notification service depends on a `QueueService` interface, not on BullMQ.
- **Immutable event history** — `NotificationEvents` are append-only. Events are never updated or deleted.
- **Replay creates new execution** — A replay never modifies the original notification or its timeline. It creates a new notification linked via `ReplayExecution`.
- **Composition roots** — Each module has a `composition.ts` that wires repositories and services. Dependencies flow inward.
- **Graceful shutdown** — The server handles `SIGTERM`/`SIGINT`, draining the HTTP server, closing the worker, closing the queue, and disconnecting Prisma.

## Current Status

PulseTrace is a **portfolio/educational project** in active development.

**What works today:**
- Full notification lifecycle: create → queue → process → deliver
- Immutable event timeline with 12 event types
- Replay system with audit trail
- Analytics: dashboard metrics, delivery trends, per-channel statistics
- React dashboard with filtering, sorting, pagination, timeline, replay, and analytics views
- 150 unit tests, 40 integration tests, 9 E2E tests
- OpenAPI 3.0.3 spec with Swagger UI
- Docker Compose for local development

**Not yet implemented:**
- Real email/SMS/in-app provider integrations (delivery is simulated)
- Authentication or authorization
- Production deployment configuration (CI/CD, Kubernetes)
- Queue/worker monitoring endpoints (`/monitoring/*`)

## Roadmap

- Real provider integrations (email, SMS, push notifications)
- Authentication and authorization
- CI/CD pipeline
- Deeper E2E test coverage
- Queue and worker monitoring endpoints
- OpenTelemetry instrumentation
- Multi-provider delivery routing
- Rate limiting and throttling

## License

ISC
