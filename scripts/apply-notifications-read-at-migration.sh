#!/bin/bash
set -e
# Aplica a migration 20260722120000_notifications_read_at.sql
# (adiciona a coluna notifications.read_at + backfill das já lidas).
#
# Rodar NA VM (20.65.208.119), onde o container do Postgres é alcançável:
#   PGPASSWORD=... ./scripts/apply-notifications-read-at-migration.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"

MIGRATION="supabase/migrations/20260722120000_notifications_read_at.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260722120000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── Colunas de notifications ANTES ──"
$PSQL -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' ORDER BY ordinal_position;"

echo
echo "── Aplicando migration ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/notifications_read_at.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/notifications_read_at.sql

# Marca a migration como aplicada (evita reprocessar em deploys futuros).
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo
echo "── Colunas de notifications DEPOIS (read_at deve aparecer) ──"
$PSQL -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' ORDER BY ordinal_position;"

echo
echo "── Amostra: notificações lidas com read_at preenchido ──"
$PSQL -c "SELECT id, is_read, read_at FROM public.notifications WHERE is_read = true ORDER BY read_at DESC NULLS LAST LIMIT 5;"

cat <<'FIM'

────────────────────────────────────────────────────────────────────────
TESTAR AGORA na aplicação:
  1. Abrir o sino de notificações
  2. Clicar no ✓ de uma notificação não lida
  3. Confirmar que aparece "✓ Lida em dd/mm/aaaa às hh:mm"

Rollback (se necessário):
  ALTER TABLE public.notifications DROP COLUMN IF EXISTS read_at;
────────────────────────────────────────────────────────────────────────
FIM
