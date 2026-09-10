# GitGuardian Secret Investigation

**Repository:** ZethetalIntern/Pulse-Trace
**Alert:** "Generic Password" — reported push date September 9, 2026
**Mode:** Read-only investigation. No files modified, no fixes applied, nothing committed.

---

## 1. Executive Summary

GitGuardian's "Generic Password" alert almost certainly corresponds to the literal
development default `POSTGRES_PASSWORD: pulsetrace` (username/password/database all set to
the project name) and/or the production compose fallback `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-pulsetrace}`.
Both are hardcoded in tracked Docker Compose files and have existed since the project's
first infrastructure commits.

The value is a **well-known development bootstrap default**, not a production secret.
Production credentials are externalized: `.env` and `.env.production` are git-ignored and
were never tracked in any commit, `.env.example` files contain placeholders only
(`<STRONG_PASSWORD>`), and production runtime injection flows through environment
variables (`--env-file` per the project's own release reports).

**Classification: DEVELOPMENT CREDENTIAL / EXAMPLE-DEFAULT.**
**Deployment impact: DO NOT BLOCK DEPLOYMENT** — with one hardening caveat: the
production compose file contains a weak literal fallback value, which is a bad practice
that should be fixed (see §8), but it does not by itself expose a real production system.

---

## 2. GitGuardian Finding

GitGuardian flagged a **"Generic Password"** — its detector for hardcoded
password-shaped strings in committed files. Based on the scan below, the detected value is
a password-like string in a Docker Compose `POSTGRES_PASSWORD` assignment where the
password equals the project name (`p u l s e t r a c e`, redacted per instructions).

This matches GitGuardian's "Generic Password" heuristic: an assignment of the form
`POSTGRES_PASSWORD: <literal-word>` or `${VAR:-<literal-word>}` in an infrastructure file.
It is **not** a high-entropy API key, token, private key, or cloud credential pattern.

> Secret value: `[REDACTED]` (a low-entropy, dictionary-of-one word identical to the
> project name).

---

## 3. Exact File / Location

Two occurrences of the detected value exist in the current HEAD (`main`, `b40a1ce`):

| # | File | Line(s) | Content (redacted) | Introduced in commit |
|---|------|---------|--------------------|----------------------|
| 1 | `docker-compose.yml` | line 9 | `POSTGRES_PASSWORD: [REDACTED]` | `ebece17` — "chore: complete phase 1 project foundation" (2026-08-04) |
| 2 | `docker-compose.prod.yml` | line 36 | `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-[REDACTED]}` | `ff10337` — "feat: harden production deployment and security" (2026-08-28) |

Secondary occurrences of the same value (all development/example/test context):

| File | Line | Context |
|------|------|---------|
| `.env.example` | DATABASE_URL line | `postgresql://<user>:[REDACTED]@localhost:5432/...` (documented dev default) |
| `.env.example.production` | POSTGRES_PASSWORD line | `POSTGRES_PASSWORD=<STRONG_PASSWORD>` — **placeholder only** |
| `apps/dashboard/playwright.config.ts` | 36 | E2E test env: `DATABASE_URL: 'postgresql://...:[REDACTED]@localhost:5432/...'` |
| `apps/api/src/__tests__/integration/setup-env.ts` | 13 | Integration test URL pointing at `pulsetrace_test` database |
| `README.md` | 286 | Backup command example `pg_dump -U [user] [db]` |

The most likely single trigger for a **September 9** alert is #2
(`docker-compose.prod.yml`) or #1 (`docker-compose.yml`), since GitGuardian scans the
default branch. Note the push dates of the relevant commits are Sept 6–7 (+0530 timezone),
which GitGuardian may report as Sept 9 UTC or on its scan date.

**Commits around September 9, 2026** (most recent three, all before Sept 8 local time):

| SHA | Date | Subject |
|-----|------|---------|
| `b40a1ce` | 2026-09-07 23:06 +0530 | fix: prepare PulseTrace for production deployment |
| `4b0cb15` | 2026-09-06 23:18 +0530 | image |
| `ca534ac` | 2026-09-06 23:17 +0530 | feat(dashboard): IA reframe, cross-page navigation, shared cleanup and final QA |

`b40a1ce` touched `docker-compose.prod.yml`, but its diff for that file only added
`stop_grace_period: 30s` — it did **not** introduce the password value.

---

## 4. Classification

**DEVELOPMENT CREDENTIAL / EXAMPLE-DEFAULT** (both compose occurrences).

Sub-classification per the requested taxonomy:

- `docker-compose.yml` line 9 → **C. Example/default credential** (explicit dev stack)
- `docker-compose.prod.yml` line 36 → **E. Placeholder with an unsafe fallback default**
  — the `${VAR:-default}` form *intends* to be a placeholder but embeds a literal weak
  fallback, which is why it trips a secret scanner.
- `.env.example` / Playwright / integration-test occurrences → **D. Test fixture** /
  **C. Example/default**

---

## 5. Evidence

1. **The value is the project name itself** (`p u l s e t r a c e`), used consistently as
   user, password, and database name across dev compose, healthchecks, docs, and examples.
   No real credential is named after the repository it lives in.
2. **Production externalization is verified:**
   - `.gitignore` contains `.env`, `.env.production`, `.env.local`, `.env.*.local`.
   - `git log --all -- .env .env.production` → empty: **never tracked in any commit, any branch**.
   - `.dockerignore` excludes all `.env*` files (not baked into images).
   - `.env.example.production` contains **only placeholders**: `POSTGRES_PASSWORD=<STRONG_PASSWORD>`, `CORS_ORIGINS=https://<YOUR_DOMAIN>`.
   - `docker/Dockerfile` contains no credentials (only a non-root user named after the project).
3. **The project's own release reports corroborate this** (PHASE_13_20_REPORT.md line 108):
   "compose dev credentials are non-production defaults. Production credentials flow via
   `--env-file` injection."
4. **No other secret-like material found.** Scans for `TOKEN`, `api_key`, `SECRET`,
   `PRIVATE KEY`/`BEGIN` blocks, AWS `AKIA…`, GitHub `ghp_…`, and `sk-…` patterns found
   only:
   - `AKIAIOSFODNN7EXAMPLE` in `sanitize-error.test.ts` — the canonical **AWS documentation example key**, inside a test asserting that the error sanitizer redacts it. Not a real credential.
   - Sanitizer test strings (`password123`, `mysecret123`, etc.) — synthetic test inputs that the code under test is designed to redact.
5. **Reference chain (item 6 of the brief):** the detected value is referenced by
   - Development Docker Compose — yes (literal default)
   - Production Docker Compose — yes, **only as the `:-` fallback** when `POSTGRES_PASSWORD` is unset
   - API configuration (`apps/api/src/config/env.ts`) — **no**; the API reads only `DATABASE_URL`/`REDIS_URL` from the environment and has **no password fallback** (`DATABASE_URL` defaults to empty string and fails if unset)
   - External services / deployment config — no third-party service credentials found anywhere in the tree or history

---

## 6. Git History

For the detected value (`POSTGRES_PASSWORD` dev default / prod fallback):

| Question | Answer |
|----------|--------|
| Present in current HEAD? | **Yes** (both `docker-compose.yml` and `docker-compose.prod.yml`) |
| Present in historical commits? | **Yes** — since the project's first infra commits |
| First commit containing it (dev hardcode) | `ebece17` — "chore: complete phase 1 project foundation" (2026-08-04) |
| First commit containing it (prod `:-` fallback) | `ff10337` — "feat: harden production deployment and security" (2026-08-28) |
| Last commit containing it | Current HEAD `b40a1ce` — **never removed** |
| Ever removed and reintroduced? | No |

`.env` / `.env.production`: **absent from all history** (`git log --all` empty; `.gitignore` present since early commits). No private keys (`.pem`, `.key`, `BEGIN …`) in any commit (`git log --all -S "BEGIN"` on key file patterns → empty).

---

## 7. Production Exposure Risk

**LOW**

- The exposed value is a universally-guessable dev default (`[REDACTED]` = project name).
  Anyone who has it gains access only to a **local development database** on a developer
  machine or the ephemeral compose network — assuming they have network access to it at all.
- In the production compose, Postgres has **no published ports** (Docker-internal network
  only), so the fallback cannot be reached from outside the host even if deployed as-is.
- The only real risk vector: if an operator deploys the production stack **without**
  setting `POSTGRES_PASSWORD`, the compose file silently boots Postgres with the weak
  fallback instead of failing fast. That is a hardening gap, not an exposure of a real
  secret — the real production password is never stored in Git.
- No real production credential exists anywhere in the repository or its history, so
  there is nothing to rotate on the basis of this alert alone.

---

## 8. Recommended Action

Minimum correct remediation (to be performed separately — **not** done in this investigation):

1. **Remove the literal fallback from the production compose** (recommended):
   `docker-compose.prod.yml` line 36 → `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}` (and likewise for `POSTGRES_USER`/`POSTGRES_DB` if desired). This makes a misconfigured deploy fail loudly instead of silently using the dev default, and also eliminates the future GitGuardian noise.
2. **Optionally** parameterize the dev compose the same way, or add a comment marking it as dev-only defaults — this alone is cosmetic, since dev defaults are conventional and harmless.
3. **No credential rotation required** — no real credential was committed.
4. **No Git history rewrite required** — nothing sensitive exists in history.
5. **No `.gitignore` change required** — `.env*` files are already correctly ignored.

---

## 9. Deployment Impact

**DO NOT BLOCK DEPLOYMENT.**

- No real production credential is exposed; the value cannot be used to access any
  production system.
- Production secrets are externalized through environment variables, exactly as designed.
- The weak prod fallback is a hardening improvement, not a release blocker. Fix it in the
  normal course of development (item 1 in §8).

---

## 10. Files Modified

**NO PRODUCTION FILES MODIFIED.**

- Files inspected (read-only): `docker-compose.yml`, `docker-compose.prod.yml`,
  `docker/Dockerfile`, `.gitignore`, `.dockerignore`, `.env.example`,
  `.env.example.production`, `README.md`, `package.json` / `package-lock.json`,
  `scripts/start.sh`, `apps/api/src/config/env.ts`, test files, phase reports.
- Git inspection commands used: `git log`, `git show`, `git ls-files`, `git branch -a`,
  pickaxe searches (`-S`). All read-only.
- The only new file created is this report: `GITGUARDIAN_SECRET_INVESTIGATION.md`.
- **This file is not committed**, per instructions.

---

## FINAL VERDICT

**SAFE — DEVELOPMENT/TEST ONLY**

The GitGuardian "Generic Password" alert corresponds to the project's well-known
development bootstrap default (`POSTGRES_PASSWORD` equal to the project name) and its
appearance as an unsafe-but-unused fallback in the production compose file. No real
production credential is committed anywhere in the repository or its history.

Conservatism note: this verdict rests on two verified facts — (a) the value is a
low-entropy project-name default, and (b) `.env`/`.env.production` were never tracked in
any commit on any branch. If production infrastructure was ever deployed *reusing this
exact dev password* (i.e., someone set `POSTGRES_PASSWORD=pulsetrace` in a real
production env file), that deployment choice would need independent verification — the
Git history alone cannot rule it out, but nothing in the repository suggests it.
