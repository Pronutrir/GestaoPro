#!/bin/bash
set -e
# Preferências de exibição do Kanban por usuário e projeto: tabela
# kanban_user_prefs (campos do card, raias, ordenação, larguras, colunas
# recolhidas). Filtro NÃO entra — segue no navegador, por decisão de 12/08/2026.
# Aditiva e idempotente; sem ela o quadro continua lendo do localStorage,
# exatamente como hoje (degrada com elegância, ninguém perde preferência).
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-kanban-user-prefs.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260812120000_kanban_user_prefs.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260812120000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES ──"
$PSQL -c "SELECT to_regclass('public.kanban_user_prefs') AS tabela_existente;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/kanban_user_prefs.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/kanban_user_prefs.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS (deve listar a tabela e 4 policies) ──"
$PSQL -c "SELECT to_regclass('public.kanban_user_prefs') AS tabela;"
$PSQL -c "SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='kanban_user_prefs' ORDER BY 1;"
