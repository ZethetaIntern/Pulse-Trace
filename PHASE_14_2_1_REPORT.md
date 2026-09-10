# PHASE 14.2.1 — PRODUCTION PASSWORD FAIL-FAST HARDENING

Date: 2026-09-10
Scope: `docker-compose.prod.yml` only. Nothing committed or pushed.

## 1. Change Made

File: `docker-compose.prod.yml` (2 lines changed)

| Line | Before | After |
|---|---|---|
| postgres → environment | `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-pulsetrace}` | `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set}` |
| api → environment | `DATABASE_URL: postgresql://${POSTGRES_USER:-pulsetrace}:${POSTGRES_PASSWORD:-pulsetrace}@postgres:5432/${POSTGRES_DB:-pulsetrace}` | `DATABASE_URL: postgresql://${POSTGRES_USER:-pulsetrace}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-pulsetrace}` |

The second change is part of the same fix: the `DATABASE_URL` interpolation
contained its own `:-pulsetrace` fallback, which would have silently
substituted the weak default even after the postgres variable was made
required. Both now use the same required variable. No other lines, services,
or defaults were altered (untracked report file aside).

## 2. Password Missing Test

Command (temporary empty env file created outside the repo, then deleted):

```bash
: > /tmp/pt-1421-empty.env
env -u POSTGRES_PASSWORD docker compose --env-file /tmp/pt-1421-empty.env \
  -f docker-compose.prod.yml config
rm -f /tmp/pt-1421-empty.env
```

`env -u` guarantees no inherited `POSTGRES_PASSWORD` from the shell.
Temporary env file deleted immediately after the test.

Result: **FAIL-FAST CONFIRMED** — exit code 1, before any container creation:

```
error while interpolating services.postgres.environment.POSTGRES_PASSWORD:
required variable POSTGRES_PASSWORD is missing a value:
POSTGRES_PASSWORD must be set
```

- Compose failed immediately. ✓
- Error names `POSTGRES_PASSWORD must be set`. ✓
- No `pulsetrace` substitution. ✓
- `config` resolves/validates only — no containers started. ✓

## 3. Password Supplied Test

Command (temporary strong test password exported in the shell; value not
shown here and not a real credential):

```bash
export POSTGRES_PASSWORD='<temporary random test password>'
docker compose -f docker-compose.prod.yml config
```

Result: **PASS** — exit code 0, no interpolation error, full resolved
configuration produced. Verified on the resolved output (without printing it):

- `postgres` service `POSTGRES_PASSWORD` resolves to the supplied value. ✓
- `api` service `DATABASE_URL` embeds the supplied value. ✓
- No `:pulsetrace@` weak default remains anywhere in the resolved config;
  the only remaining `pulsetrace` strings are the user/DB-name defaults and
  image names (`pulsetrace-api:latest`, `pulsetrace-nginx:latest`). ✓

## 4. Production Stack Test

Performed — same safe rehearsal approach as Phase 14.2:

- Isolated compose project: `pulsetrace-rehearsal-1421`
- Scratch env file (generated random password, `NGINX_PORT=18080`,
  `CORS_ORIGINS=http://localhost:18080`), stored outside the repo, deleted
  after the rehearsal
- Isolated volumes: `pulsetrace-rehearsal-1421_postgres_data`,
  `pulsetrace-rehearsal-1421_redis_data` (created and removed with the stack)
- The development containers `pulsetrace-postgres` / `pulsetrace-redis` and
  their volumes were never touched. The scratch database was NOT seeded
  (two FK rows inserted via SQL in the disposable scratch DB only, to give a
  test POST valid `userId`/`templateId` references)

`up -d --wait` → all four services healthy:

```
pulsetrace-rehearsal-1421-api-1        api        Up (healthy)
pulsetrace-rehearsal-1421-nginx-1      nginx      Up (healthy)
pulsetrace-rehearsal-1421-postgres-1   postgres   Up (healthy)
pulsetrace-rehearsal-1421-redis-1      redis      Up (healthy)
```

| Check | Result |
|---|---|
| PostgreSQL healthy | ✓ (healthcheck green) |
| Redis healthy | ✓ (healthcheck green) |
| API healthy | ✓ (healthcheck green) |
| nginx healthy | ✓ (healthcheck green) |
| Prisma migrations | ✓ `20260803191145_init` applied (`finished_at` set in `_prisma_migrations`); API log: "1 migration found … applied" |
| API crash-loop | ✓ `RestartCount: 0` on all four containers |
| `GET /health` (via nginx) | ✓ `200` `{"status":"ok","environment":"production"}` |
| `GET /health/ready` (via nginx) | ✓ `200` — postgres/redis/queue/worker all `ok` |
| Dashboard via nginx | ✓ `/` and `/notifications` (SPA fallback) → `200 text/html`; `/assets/index-*.js` → `200 application/javascript` |
| `GET /api/v1/notifications` | ✓ `200`, correct list/pagination envelope |
| `POST /api/v1/notifications` | ✓ `202` `QUEUED` → BullMQ worker → `DELIVERED` (DB-confirmed) |
| `GET /api/v1/notifications/:id/timeline` | ✓ `200` |
| `GET /api/v1/analytics/dashboard` | ✓ `200` — 1 notification, 100% success rate, EMAIL channel |
| Secrets in logs | ✓ grep of API logs for the scratch password and `password|postgres(ql)?://` patterns → 0 hits |
| Teardown | ✓ `down -v` removed all containers, network, and both volumes; zero leftovers |

Incidental fail-fast proof: running `docker compose down` without the env
file also refused with the same `POSTGRES_PASSWORD must be set` error — the
guard applies to every compose command, not just `up`.

## 5. Development Compose Verification

`docker-compose.yml` was NOT modified:

```
$ git diff --name-only docker-compose.yml | wc -l
0
```

The development compose file intentionally retains its local-only hardcoded
credentials (dev convenience, no production exposure). Development
containers `pulsetrace-postgres` and `pulsetrace-redis` remained healthy and
untouched throughout.

## 6. Security Impact

The previous configuration allowed production to start with the known weak
default password `pulsetrace` whenever `POSTGRES_PASSWORD` was not supplied —
for example a deploy from a fresh checkout without an env file. Because the
same fallback also fed `DATABASE_URL`, the API would connect seamlessly and
the mistake would be invisible: no error, no crash, a fully "healthy" stack
running production data behind a guessable password.

With `:?` (required-variable interpolation), Docker Compose itself refuses
to resolve the configuration before a single container is created. An
under-configured deploy now fails loudly at the earliest possible moment
with a message naming the missing variable, instead of silently shipping a
weak credential. The correct failure mode for a missing production secret is
"refuse to start", which is exactly what this change enforces.

No real credentials were rotated, exposed, or used in any test; all tests
used generated throwaway passwords on an isolated stack.

## 7. Git Scope

```
$ git diff --check          → (clean, no whitespace errors)
$ git diff --stat
 docker-compose.prod.yml | 4 ++--  (2 insertions, 2 deletions)
$ git status --short
 M docker-compose.prod.yml
?? GITGUARDIAN_SECRET_INVESTIGATION.md
```

- Modified (tracked): `docker-compose.prod.yml` — the intended change only
- Untracked: `GITGUARDIAN_SECRET_INVESTIGATION.md` — pre-existing before
  this task (not created by it)
- Untracked (created by this task): `PHASE_14_2_1_REPORT.md` (this report)
- Nothing staged, committed, or pushed

## 8. Final Verdict

**PASS**

All three tests performed and passed: fail-fast on missing password, clean
resolution with password supplied, and a full isolated production-stack
rehearsal (migrations, health, dashboard, end-to-end notification delivery)
with no development-environment impact.
