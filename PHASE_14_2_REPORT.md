# PHASE 14.2 — PRODUCTION DEPLOYMENT BLOCKER FIX REPORT

Scope: fix the Phase 14.1 P0/P1 deployment blockers in the existing Docker
Compose stack. No architecture changes, no new dependencies, nothing committed.

## 1. Changes Made

| File | Change | Why |
|------|--------|-----|
| `docker/Dockerfile` | (a) Added `COPY --from=deps /app/node_modules/@prisma/engines ./node_modules/@prisma/engines` in the `api` stage. (b) Added `sed -i 's/\r$//' ./scripts/start.sh` before `chmod +x`. | (a) P0: `prisma migrate deploy` could not run (missing schema engine). (b) Rehearsal-discovered P0: CRLF `start.sh` broke the `#!/bin/sh` shebang inside the container. |
| `.gitattributes` (new) | `*.sh text eol=lf` | Prevents Windows checkouts (`core.autocrlf=true`) from re-introducing CRLF into shell scripts. |
| `scripts/start.sh` | Converted CRLF → LF (content unchanged). | Same CRLF/shebang issue; the file must be executable-as-is. |
| `apps/api/src/app.ts` | Added `app.set('trust proxy', 1)`. | P1: rate limiting must key on the nginx-appended real client IP, not client-supplied leftmost `X-Forwarded-For`. |
| `apps/api/src/shared/middleware/rate-limit.ts` | `keyGenerator` now returns `req.ip` only (leftmost-XFF parsing removed). Docs updated. | P1: stop trusting spoofable headers; limits/error envelope unchanged. |
| `apps/api/src/config/env.ts` | CORS origin parsing strips trailing slashes. | Production `CORS_ORIGINS=https://domain/` would otherwise never match the browser-sent `https://domain`. |
| `apps/api/src/__tests__/shared/middleware/rate-limit.test.ts` | Test apps set `trust proxy 1`; 2 new tests: spoofed leftmost XFF ignored, independent buckets per client IP. | Cover the rate-limit fix. |
| `docker/nginx.conf` | Added `location = /index.html` with `Cache-Control: no-cache`. | Low-cost hardening: stale `index.html` would reference deleted asset hashes after redeploys; `/assets/*` immutable caching preserved. |
| `docker-compose.prod.yml` | `stop_grace_period: 30s` on `api`. | Low-cost hardening: server.ts drains up to 10s; Docker's default 10s stop timeout would SIGKILL mid-drain. |
| `README.md` | New "Production Deployment" section (~160 lines). | P1: deployment documentation was missing. |
| `.env.example.production` | Unchanged — already present and correct. | — |

## 2. Prisma Migration Fix

**Original failure:** the `api` stage runs `npm ci --omit=dev`, which does not
install the `prisma` CLI (a devDependency), so the image copied
`node_modules/prisma` from the deps stage — but not its **only runtime
dependency**, `@prisma/engines` (verified: `prisma@5.22.0` declares exactly one
dependency, `@prisma/engines: 5.22.0`). That package contains the schema-engine
binary that `prisma migrate deploy` executes, so migrations crashed at startup.

**Fix:** one COPY line in `docker/Dockerfile`. The generated client
(`node_modules/.prisma`), the schema, migrations, and `scripts/start.sh`'s
existing `node ./node_modules/prisma/build/index.js migrate deploy` flow are
untouched.

**Rehearsal proof:** first boot — `1 migration found … Applying migration
20260803191145_init … All migrations have been successfully applied.` Second
boot — `No pending migrations to apply.` (idempotent).

## 3. CORS Verification

`CORS_ORIGINS` is an explicit allow-list; `*` is never honored in production.
Verified live (origin `http://localhost:8080` configured):

- `GET /api/v1/notifications` with allowed `Origin` → `200` +
  `Access-Control-Allow-Origin: http://localhost:8080`.
- `POST /api/v1/notifications` with allowed `Origin` → `202` + ACAO header —
  this is the critical path: browsers send `Origin` on POST even for
  same-origin requests behind nginx, so an unset/wrong `CORS_ORIGINS` breaks
  every dashboard create/replay while GETs still work. Documented in README.
- `OPTIONS` preflight, allowed origin → `204`; disallowed origin → `403`.
- Any request with a disallowed `Origin` → `403`
  `{"success":false,"error":{"code":"CORS_ORIGIN_NOT_ALLOWED"}}`.
- Requests without `Origin` (curl, healthchecks) → allowed (CORS is
  browser-only); behavior preserved.
- Parsing now tolerates a trailing slash in `CORS_ORIGINS`.

## 4. Rate Limit Security Fix

Topology: `client → nginx → API`, single trusted proxy hop.

- `app.set('trust proxy', 1)` — Express resolves `req.ip` from the **last**
  `X-Forwarded-For` entry (the one nginx appends with `$remote_addr`), not from
  client-controlled leftmost values.
- `keyGenerator` uses `req.ip` only.
- Unit tests (both pass): 101 requests with `X-Forwarded-For: 9.9.9.9,
  203.0.113.50` exhaust the bucket of `203.0.113.50`; a follow-up request
  keyed as `203.0.113.50` is also 429 (spoofed leftmost value created no
  separate bucket); a different IP gets a fresh bucket (202).
- Live end-to-end proof: with `RATE_LIMIT_MAX=5`, requests 4+ returned 429 and
  a request carrying a spoofed `X-Forwarded-For: 8.8.8.8` also returned **429**
  — the spoofed value did not reset or split the bucket.
- Limits, `RateLimit-*` headers, `Retry-After`, `X-Request-ID`, and the
  `RATE_LIMIT_EXCEEDED` error envelope are unchanged.

## 5. Deployment Documentation

New README section "Production Deployment" covering: prerequisites, environment
variables table, strong PostgreSQL credential generation (`openssl rand` /
`/dev/urandom`), setting `CORS_ORIGINS` (incl. why same-origin POSTs require
it), building images, starting the stack, migration behavior (idempotent,
single-container), health/readiness verification commands, logs, stop/restart,
`pg_dump` backup guidance, upgrade procedure (volumes preserved, migrations
auto-apply), rollback procedure (schema never rolls back; restore from backup
for schema-level rollbacks), and a do-not-seed-production note. No real
secrets; all examples use placeholders.

## 6. Production Build

| Command | Result |
|---|---|
| `npm run lint` | ✅ 0 errors |
| `npm run build` (API, tsc) | ✅ |
| `npm run build:dashboard` (tsc -b + vite) | ✅ (pre-existing >500 kB chunk warning) |
| `npm run test:api` | ✅ 236/236 tests, 21/21 suites (incl. 2 new rate-limit tests) |
| `docker compose -f docker-compose.prod.yml build` | ✅ `pulsetrace-api:latest` and `pulsetrace-nginx:latest` built |

## 7. Production Rehearsal

Isolated environment: compose project `pulsetrace-rehearsal`, scratch env file
(generated scratch password, `NGINX_PORT=8080`, `RATE_LIMIT_MAX=5`,
`CORS_ORIGINS=http://localhost:8080`), isolated volumes
(`pulsetrace-rehearsal_postgres_data` / `_redis_data`). The development
`pulsetrace-postgres` / `pulsetrace-redis` containers and volumes were never
touched. **Not seeded** (two rows were inserted via SQL only to give the POST
validator valid `userId`/`templateId` FKs in the disposable scratch DB).
Scratch env file deleted after the rehearsal.

`docker compose -p pulsetrace-rehearsal -f docker-compose.prod.yml ps`:

```
pulsetrace-rehearsal-api-1        api        Up (healthy)
pulsetrace-rehearsal-nginx-1      nginx      Up (healthy)
pulsetrace-rehearsal-postgres-1   postgres   Up (healthy)
pulsetrace-rehearsal-redis-1      redis      Up (healthy)
```

- Migrations applied on first boot; no-op on second boot; no crash-loops.
- Database tables: `Users`, `Templates`, `Notifications`,
  `NotificationEvents`, `ReplayExecutions`, `UserPreferences`,
  `_prisma_migrations`.
- Graceful shutdown (`docker compose stop api`): `SIGTERM → Shutting down
  gracefully… → HTTP server closed → worker closed → queue closed →
  monitoring closed → Database disconnected`, clean exit well within the 30s
  `stop_grace_period`. Restart returned all services to healthy.
- Teardown: `down -v` removed all rehearsal containers/networks/volumes.

## 8. API Verification (through nginx :8080)

| Check | Result |
|---|---|
| `GET /health` | `200` `{status: ok}` |
| `GET /health/ready` | `200` (Postgres + Redis reachable) |
| `GET /api/v1/notifications` (clean DB) | `200`, empty items, correct pagination |
| `GET /api/v1/analytics/dashboard` (clean DB) | `200`, all zeros (expected empty state) |
| `POST /api/v1/notifications` | `202` `QUEUED` → worker processed → `DELIVERED`, full immutable timeline |
| `POST /api/v1/notifications/:id/replay` | `202`, created linked replay notification → `DELIVERED`; original timeline untouched |
| Rate limiting (`RATE_LIMIT_MAX=5`) | 202 ×3 then `429` with `RATE_LIMIT_EXCEEDED` envelope + `Retry-After` + preserved `X-Request-ID` |
| Spoofed `X-Forwarded-For: 8.8.8.8` | still `429` (leftmost spoof ignored) |

## 9. Dashboard Verification (through nginx, not Vite)

- `GET /` → `200` `text/html`, `Cache-Control: no-cache` (new hardening).
- `GET /notifications` (SPA fallback route) → `200` HTML.
- `GET /assets/index-*.js` → `200`, `Cache-Control: public, immutable`
  (preserved).
- Dashboard's relative `/api/v1/*` + `/health` fetches all work same-origin
  through nginx, including POSTs (202) thanks to the configured
  `CORS_ORIGINS`.

## 10. Security Verification

- **Secrets in logs:** grep of api/nginx logs for the scratch password and
  `password|postgres://` → 0 hits.
- **CORS:** allow-list enforced; disallowed origin → 403 on GET/POST/OPTIONS;
  no `*` in production.
- **Headers:** Helmet present (`X-Frame-Options`, `X-Content-Type-Options`,
  `Strict-Transport-Security`, `Referrer-Policy`, etc.).
- **Rate limiting:** functional, per-real-client-IP, spoof-resistant.
- **Exposed ports:** only nginx published (`8080→80` in the rehearsal); the
  API, Postgres, and Redis have no host ports.
- **API runs as non-root** (`pulsetrace` user); entrypoint normalized to LF.

## 11. Remaining P2/P3 Issues

Not fixed, per phase instructions (only the two approved hardening items were
implemented):

- Any other P2/P3 findings from the Phase 14.1 audit.
- Dashboard bundle >500 kB (Vite chunk-size warning) — pre-existing.
- Worker + API co-located in one process — documented compose limitation.
- No authentication/authorization — pre-existing product gap, out of scope.

## 12. Git Scope

Modified (8): `README.md`, `apps/api/src/app.ts`, `apps/api/src/config/env.ts`,
`apps/api/src/shared/middleware/rate-limit.ts`,
`apps/api/src/__tests__/shared/middleware/rate-limit.test.ts`,
`docker/Dockerfile`, `docker/nginx.conf`, `docker-compose.prod.yml`,
`scripts/start.sh`. Untracked (2): `.gitattributes` (new, related),
`PHASE_14_2_REPORT.md` (this file).

`git diff --check` → clean (no whitespace errors). `git diff --stat`: 8 files,
265 insertions, 12 deletions. No unrelated files changed. **Nothing committed.**

## 13. Final Verdict

**READY FOR DEPLOYMENT**

The production Docker stack builds and runs end-to-end: images build, all four
services reach healthy, migrations apply idempotently, the dashboard and all
API routes work through nginx, POST/replay/rate-limiting behave correctly,
shutdown is graceful, and no secrets leak into logs. The only caveats are the
pre-existing P2/P3 items listed above, which are non-blocking.
