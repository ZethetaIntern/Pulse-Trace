#!/bin/sh
set -e

# =============================================================================
# PulseTrace — Production Entrypoint
# =============================================================================
#
# Environment variables:
#   RUN_MIGRATIONS  — Set to "true" to run prisma migrate deploy on startup.
#                     Default: false (migrations are skipped).
#
# Usage:
#   RUN_MIGRATIONS=true ./scripts/start.sh   # First deploy: run migrations
#   ./scripts/start.sh                       # Subsequent deploys: skip
# =============================================================================

echo "PulseTrace API starting..."

# ---------------------------------------------------------------------------
# Optional: Run Prisma migrations
# ---------------------------------------------------------------------------
# Only run when explicitly enabled. In a multi-replica deployment, set
# RUN_MIGRATIONS=true on exactly ONE container to avoid migration races.
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "RUN_MIGRATIONS=true — applying database migrations..."
  node ./node_modules/prisma/build/index.js migrate deploy \
    --schema=apps/api/prisma/schema.prisma
  echo "Migrations applied successfully."
else
  echo "RUN_MIGRATIONS is not 'true' — skipping migrations."
fi

# ---------------------------------------------------------------------------
# Start the API server
# ---------------------------------------------------------------------------
# `exec` replaces this shell with the Node process so that SIGTERM/SIGINT
# reach Node.js directly, allowing the graceful-shutdown handler in
# server.ts to run.
echo "Starting API server..."
exec node apps/api/dist/server.js
