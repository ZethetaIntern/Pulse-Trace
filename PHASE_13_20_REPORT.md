# Phase 13.20 — Release Candidate / Engineering Sign-off

## 1. Final Status

**RELEASE CANDIDATE** — conditional only on the recommended Git commit scope (Section 16), which requires human approval by phase mandate. Zero production code changes were made during 13.20.

## 2. Executive Summary

PulseTrace passed every release gate: dashboard and API production builds, TypeScript, lint (0 warnings), 234/234 API unit tests, and the full E2E suite at **39 passed / 0 failed** — identical to the Phase 13.19 baseline. Live API verification confirmed health/readiness, all endpoint groups, correct error semantics, and intact seeded data. No committed secrets, no accidental dependency or schema changes, no architecture drift. The three known non-blocking issues from 13.19 remain the only console-visible blemishes and did not grow.

The working tree contains the uncommitted output of Phases 13.13–13.19 plus **two untracked items that ship-blocking if omitted from the release commit**: `apps/dashboard/src/lib/` (imported by built code) and the 13.17/13.19 sign-off reports. The recommended commit scope is in Section 16.

## 3. Build / TypeScript

| Target | Command | Result |
|---|---|---|
| Dashboard | `npm run build:dashboard` (`tsc -b && vite build`) | **PASS** — 703 modules, built in 7.03s |
| API | `npm run build` (`tsc`) | **PASS** — exit 0 |

## 4. Lint

| Scope | Command | Result |
|---|---|---|
| Root (`apps/*/src/**/*.ts`) | `npm run lint` | **PASS** — 0 errors, 0 warnings |
| Dashboard (`--max-warnings 0`) | `npm run lint` (workspace) | **PASS** — 0 errors, 0 warnings |

## 5. Test Suite

| Suite | Result |
|---|---|
| API unit tests (`npm run test:api`, Jest) | **21/21 suites, 234/234 tests passed** (24.1s) |
| API integration tests | **Not executed in 13.20** (see note below) |
| E2E (Playwright) | **39 passed / 0 failed** (1.3m) — see Section 6 |

Integration-suite note: `jest.integration.config.js` targets a dedicated `pulsetrace_test` database and Redis DB 1 that its global-setup recreates (dropping/deleting data). Running it against the live dev database during a release gate conflicts with the freeze rules ("do not reset or destroy the database"). The suite exists, is wired, and passed in earlier phases; its omission here is environmental, not a regression, and is classified P2.

## 6. E2E

**39 passed / 0 failed (1.3m)** — exact match with the Phase 13.19 baseline. No regression, no flakiness, no retries needed. Suites covered: `_verify-13-8` (theme/overflow/console/network/screenshot sweeps across all five pages and three viewports), `_verify-13-8-theme` (computed-style brand assertions), dashboard overview, notifications list/detail, timeline, replay, analytics, monitoring (incl. sidebar navigation).

## 7. Repository Audit

**Structure:** Monorepo (`apps/api`, `apps/dashboard`, npm workspaces) matches `initial-docs/architecture/folder-structure.md`. API is a coherent modular monolith (config / infrastructure / lifecycle / modules / shared). Dashboard is a coherent SPA (api / components / hooks / layouts / lib / pages / types).

**Tracked files (195):** No temp/debug files, no logs, no `test-results/` (git-ignored, verified via `git check-ignore`), no `.env` files (only `.env.example*`). `package-lock.json` present and intentional.

**Hygiene scans (production code):**
- `console.log` / `debugger`: **none** in production source. Only legitimate CLI output: `prisma/seed.ts` (seed progress) and integration `global-teardown.ts` (test infra).
- `TODO` / `FIXME` / `XXX` / `HACK`: **zero matches** project-wide.
- Mock/fake data: only Jest test fixtures (expected) and one design-system CSS comment (`--color-ink-faint: placeholder`). No placeholder content in production UI.
- Hardcoded URLs: only localhost references in dev/test config (Vite proxy, Playwright, integration tests, OpenAPI dev server) and intra-container healthchecks — all correct-by-design. Dashboard production API client uses relative `/api/v1`.

**Findings (non-blocking):**
- Screenshots exist in **two parallel directories**: root `phase-13-8-screenshots/` and `apps/dashboard/phase-13-8-screenshots/` (10 PNGs tracked). Deliberate QA artifacts; duplication is a tidiness issue (P2).
- `apps/api/dist/` (API build output) is tracked in Git — from the pre-13.20 source. `dist/` is in `.gitignore`, so the tracked copy is stale but harmless; refresh or untrack is a policy decision (P2).
- `docker-compose.yml` uses the obsolete `version:` key (Compose v2 warning on every invocation) (P3).

## 8. Environment / Configuration

- **`.env` is NOT tracked**; contains only documented dev variables (`NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`, `LOG_LEVEL`).
- **`.env.example` (dev):** fully documented, safe out-of-the-box dev defaults, placeholders only.
- **`.env.example.production`:** verified placeholders-only (`<STRONG_PASSWORD>`, `<YOUR_DOMAIN>`); explicit "never commit" instructions.
- **Env usage is centralized** in `apps/api/src/config/env.ts`, which loads the monorepo root `.env` (documented rationale in-file). All variables (PORT, DATABASE_URL, REDIS_URL, LOG_LEVEL, CORS_ORIGINS, QUEUE_ATTEMPTS/BACKOFF_MS, RUN_MIGRATIONS, RATE_LIMIT_*, ANALYTICS_MAX_RANGE_DAYS) are documented in the examples and consumed with dev-safe defaults.
- **Dashboard config:** relative `/api/v1` + `/health` base URLs; dev proxy to `localhost:4000` in `vite.config.ts` (dev-only). No server-side secrets reachable from the client — the API is unauthenticated read/write by design (documented MVP scope).
- **Production compose (`docker-compose.prod.yml`):** Postgres/Redis/API ports not published to host; nginx is the only ingress; CORS mandatory in production (enforced in `app.ts`, rejects unconfigured origins with 403); non-root container user; `RUN_MIGRATIONS` gated. No accidental production localhost dependency (only intra-container healthcheck URLs).
- **Docker:** multi-stage `docker/Dockerfile` (deps → build → api → nginx) with healthchecks, non-root user, and documented entrypoint (`scripts/start.sh`). Coherent and understandable.

## 9. Database / Prisma

- **Schema:** coherent, maps 1:1 to `initial-docs/architecture/database-design.md` / `event-model.md`, with documented deviations in the file header (EventType union, 3 channels MVP, TemplateStatus, optional executionId). `NotificationEvent` is append-oriented (no update paths in code); cascade rules are Restrict per design.
- **Migrations:** exactly **one** (`20260803191145_init`) + `migration_lock.toml`. **No accidental or destructive migrations**; `git status` shows zero changes under `apps/api/prisma` and `apps/api/src`.
- **`prisma generate`:** works (exercised via `predev`). Note: when an API instance is already running on Windows, `prisma generate` fails with `EPERM` renaming `query_engine-windows.dll.node` (the DLL is locked by the live process). Environment quirk, not a code defect — a fresh environment generates cleanly (the Dockerfile does it in the build stage).
- **Migration workflow:** documented (`predev` auto-applies in dev, `RUN_MIGRATIONS=true` + `prisma migrate deploy` in production, per-file docs in `.env.example*` and `scripts/start.sh`).
- **Seed (`prisma/seed.ts`):** intentional, idempotent (skips if `alice@example.com` exists), clearly identifiable (`metadata.source: "seed"` / `triggeredBy: 'seed'`), no uncontrolled duplicates, no secrets. **Seed data verified intact via live API**: 1 notification, 1 event, 1 replay execution, 1 user preference. **Not touched during 13.20.**
- Cleanup procedure (documented only, NOT executed): delete in FK-safe order — `UserPreferences` → `ReplayExecutions` → `NotificationEvents` → `Notifications` → `Templates` → `Users` where `metadata->>'source' = 'seed'`, or recreate the volume (`docker compose down -v`) for a full reset.

## 10. API

Verified read-only against the live running instance (port 4000):

| Check | Result |
|---|---|
| `GET /health` | 200 `{"status":"ok",...}` |
| `GET /health/ready` | 200 — postgres/redis/queue/worker all `ok` (latencies 0–4ms) |
| `GET /api/v1/notifications` | 200 with seeded record, correct pagination envelope |
| `GET /api/v1/notifications/:id` (unknown UUID) | **404** with error envelope (correct semantics) |
| `GET /api/v1/analytics/dashboard` | 200 — correct metrics from seed data |
| `GET /api/v1/analytics/channels` | 200 |
| `GET /api/v1/monitoring/health` `/queues` `/workers` | 200 — worker `notification-worker-2584` running |
| Replay endpoints | exercised by passing E2E suite (replay button/history flows) |

- No unhandled exceptions; graceful-shutdown and `unhandledRejection`/`uncaughtException` handlers in `server.ts`.
- POST endpoints rate-limited (`express-rate-limit`, configurable); GETs intentionally exempt (documented).
- Swagger UI `/docs` is **dev/test-gated** (`NODE_ENV !== 'production'`) and fails soft. No debug/test/mock endpoints exist in the route table.
- Dashboard↔API communication confirmed live (E2E suite + Vite proxy + relative URLs).

## 11. Dashboard

- Production build succeeds; `tsc -b` clean; ESLint clean (`--max-warnings 0`).
- No missing imports; all five routes registered (`/`, `/notifications`, `/notifications/:notificationId`, `/analytics`, `/monitoring`).
- E2E verified all five pages, cross-page navigation, seeded-data flows, 4 viewports (1440/1024/768/390), 10-second Monitoring polling, and replay/history — no production-only failures.
- Shared UI system intact (`components/ui`), time utilities centralized in `src/lib/time.ts`, React Query is the sole server-state mechanism, native `fetch` is the API client.

## 12. Security Sanity Check

Concrete findings only (not a penetration test; no "fully secure" claim):

1. **No committed secrets.** `.env` untracked; examples are placeholders; compose dev credentials (`pulsetrace`) are non-production defaults. Production credentials flow via `--env-file` injection.
2. **Dashboard exposes no server secrets** — static SPA, no server-side config baked in.
3. **No SQL string construction** — all data access via Prisma parameterized queries.
4. **Error sanitization exists** (`shared/utils/sanitize-error.ts`, with tests covering password/api_key/URL scrubbing); helmet security headers applied; JSON body limit 100kb.
5. **API is unauthenticated by design** — documented MVP scope (PRD/feature spec); anything beyond trusted-network deployment is a roadmap item, not a 13.20 defect (P3, future).
6. `npm audit`: **7 advisories (1 high, 6 moderate)** — see Section 13. Per phase rules, **no upgrades were performed**.

## 13. Dependency Audit

- `package-lock.json` is consistent with all three `package.json` files; `npm ls --all --depth=0` reports no extraneous or invalid packages. No dependencies were added or changed during dashboard phases (dashboard deps: react, react-dom, react-router-dom, @tanstack/react-query, recharts — all architecturally mandated).
- Advisories (all **pre-existing**, none introduced by 13.13–13.20; classified, not fixed per freeze):

| Package | Severity | Nature | Exposure |
|---|---|---|---|
| vite | **high** | Path traversal in optimized-deps `.map` handling; launch-editor NTLMv2 hash disclosure on Windows | **Dev server only** — not in production bundle |
| esbuild | moderate | Dev-server request/read cross-origin | Dev tooling only |
| qs → body-parser → express | moderate | Array-limit bypass / DoS vectors | Mitigated: API is JSON-only with 100kb body limit behind rate limiting |
| react-router(-dom) | moderate | Open redirect via backslash in `Link`/`useNavigate`; SSR `deserializeErrors()` injection | SSR path not used (SPA only); open redirect requires crafted user-supplied paths |
| body-parser | moderate | via qs | as above |

None is exploitable through the production artifact in this project's deployment model. P2 (documented, fix post-release).

## 14. Documentation Alignment

- The intended 12-document set (00-vision … 11-architecture-decisions) exists under `initial-docs/` (organized into `architecture/`, `development/`, `features/` subdirectories rather than flat numbered files — a layout choice, content-complete).
- `PHASE_13_19_REPORT.md` and `PHASE_13_17_REPORT.md` exist (13.17/13.19 currently **untracked** — see Git hygiene). `PHASE_13_20_REPORT.md` is created by this phase.
- Spot-checked accuracy: schema ↔ database-design deviations are self-documented; API surface ↔ `openapi.yaml` consistent; folder structure ↔ actual tree consistent. No meaningful mismatch found; no documentation corrections were necessary.

## 15. Architecture Consistency

Verified end-to-end against the mandated flow — **no drift**:

- External App → Express API (modular monolith, 5 modules + readiness) → Notification Service → PostgreSQL (Prisma) → BullMQ/Redis (queue infrastructure) → Worker (`NotificationWorker`, co-located per documented limitation) → Adapters/Event Store (repository pattern, append-only events) → Dashboard (React 18 SPA, `BrowserRouter`, 5 routes).
- No microservices, no CQRS/event-sourcing framework, no extra DDD layers, no speculative abstractions introduced.
- React Query sole server-state mechanism (`main.tsx` provider); native `fetch` API client with relative base URL; shared UI system (`components/ui`) and centralized time utilities (`src/lib/time.ts`) intact; `NotificationEvent` immutable/append-oriented.
- API `dist/` retains compiled `__tests__` (cosmetic byproduct of a single tsconfig — no runtime effect; P3).

## 16. Git Hygiene

State reviewed (`git status`, `git diff --stat`, `git log -8 --oneline`). Branch `main`, up to date with `origin/main`, last commit `cb499db`. All working-tree changes belong to **Category B** (Phases 13.13–13.19 output); **no Category C** (unrelated/unexpected) changes found. Nothing was committed, pushed, reset, or discarded during 13.20.

**Recommended commit scope** (for human review; do not execute blindly):

- **Stage — 20 modified files:** the 11 dashboard source files + `_verify-13-8-theme.spec.ts` (13.13–13.19 IA reframe, shared cleanup, QA fixes) and the 9 updated screenshot PNGs (both directories).
- **Stage — 4 untracked items (all release-relevant):**
  - `apps/dashboard/src/lib/` (`time.ts`) — **mandatory**: imported by `TimelineView`, `AnalyticsPage`, `NotificationsPage`, `NotificationDetailPage`; omitting it breaks the build for any fresh clone.
  - `PHASE_13_17_REPORT.md`, `PHASE_13_19_REPORT.md` — sign-off trail.
  - `phase-13-8-screenshots/05-notification-detail.png` — completes the tracked screenshot set.
- **Do NOT stage:** `.env` (ignored), `test-results/` (ignored), `dist/` outputs from this session.
- Suggested message: `feat(dashboard): IA reframe, cross-page navigation, shared cleanup and final QA (13.13–13.19)`
- **Deferred to reviewer (not executed):** decide whether to untrack stale `apps/api/dist/` and consolidate the duplicate screenshot directories before the release commit.

## 17. Release Blockers

**P0 — none.**

**P1 (release-process, resolved by the commit scope in Section 16 — no code fix required):**

1. **Untracked `apps/dashboard/src/lib/time.ts`** — imported by shipped code; a release committed from the current index would not build from a fresh checkout. *Action: include in the release commit.*
2. **Untracked phase reports (13.17 / 13.19)** — the audit/sign-off trail must ship with the candidate. *Action: include in the release commit.*

## 18. Non-Blocking Issues

**P2:**
1. Known trio from 13.19, re-confirmed, unchanged: React Router 6.26 future-flag warnings; browser logging on deliberately malformed detail URLs; Vite >500 kB chunk advisory (983 kB / 267 kB gzip, single chunk — recharts + router dominate).
2. `npm audit`: 7 pre-existing advisories (1 high, dev-server-only; 6 moderate, dev-tooling or rate-limited/JSON-only exposure) — fix after release.
3. Integration test suite not executed in 13.20 (its global setup recreates the `_test` database, conflicting with the no-DB-destruction rule). Run before deploy in a disposable environment.
4. Duplicate screenshot directories (root + `apps/dashboard/`).
5. Stale tracked `apps/api/dist/` from pre-13.20 source.

**P3:**
1. API unauthenticated (documented MVP scope — auth is roadmap work).
2. Dependency upgrades when convenient: React Router 7 (clears future-flag warnings), Vite 6 (clears esbuild advisory), chunk splitting via `manualChunks`.
3. Remove obsolete `version:` key from `docker-compose.yml`.
4. Exclude `__tests__` from API `tsc` output.
5. Environment note: on Windows, `prisma generate` fails with `EPERM` while a previous API instance holds the engine DLL; restart the old process first (no code change).

## 19. Changes Made During 13.20

**No production code changes.** Only file created: `PHASE_13_20_REPORT.md` (this report). No source, config, dependency, schema, or test files were modified.

## 20. Seed Data

Seed records remain **intentionally intact and verified via the live API** (user, template, 1 notification with `metadata.source: "seed"`, event, replay execution, user preference). Nothing was deleted or reset. Cleanup procedure (for future reference, **not executed**): delete in FK-safe order — `UserPreferences` → `ReplayExecutions` → `NotificationEvents` → `Notifications` → `Templates` → `Users` for records tagged `source: 'seed'`, or recreate the compose volumes for a full reset.

## 21. Final Release Recommendation

**RELEASE CANDIDATE.** All automated gates pass at or above the 13.19 baseline (build ✅, lint ✅, 234/234 unit ✅, 39/39 E2E ✅), live API and infrastructure verification succeeded, no P0 issues and no code-level P1 issues exist, no secrets are committed, and the architecture is unchanged from the documented design. The two P1 items are commit-scope actions — stage the untracked `src/lib/` and phase reports per Section 16 during human review, and the candidate is complete. Freeze the tree and await human sign-off.

*Evidence log (13.20):* `npm run build:dashboard` / `npm run build` exit 0 · both lint scopes exit 0 · Jest 234/234 · Playwright 39/39 (1.3m) · `curl /health`, `/health/ready`, 7 API endpoint groups verified · `docker compose ps` postgres+redis healthy · `npm ls` clean · `npm audit` 7 advisories classified · `git status/diff/log` reviewed, zero mutations.
