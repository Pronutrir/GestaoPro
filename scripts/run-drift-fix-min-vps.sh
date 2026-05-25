#!/bin/bash
set -euo pipefail

# Applies scripts/supabase-drift-fix-min.sql against the self-hosted Supabase DB in VPS.
# Usage:
#   ./scripts/run-drift-fix-min-vps.sh [ssh-host-alias]
# Example:
#   ./scripts/run-drift-fix-min-vps.sh Vps-Hostiger

SSH_HOST="${1:-Vps-Hostiger}"
REMOTE_SUPABASE_DIR="${REMOTE_SUPABASE_DIR:-/root/Supabase}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.selfhost.yml}"
ENV_FILE="${ENV_FILE:-.env.selfhost}"
SQL_FILE="scripts/supabase-drift-fix-min.sql"

if [ ! -f "$SQL_FILE" ]; then
  echo "Erro: arquivo nao encontrado: $SQL_FILE" >&2
  exit 1
fi

echo "[drift-fix-min] host=$SSH_HOST dir=$REMOTE_SUPABASE_DIR"
echo "[drift-fix-min] aplicando SQL idempotente..."
cat "$SQL_FILE" | ssh "$SSH_HOST" "cd '$REMOTE_SUPABASE_DIR' && docker compose -f '$COMPOSE_FILE' --env-file '$ENV_FILE' exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1"

echo "[drift-fix-min] concluido"
