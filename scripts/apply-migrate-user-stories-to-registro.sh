#!/bin/bash
set -e
# Migra histórias de usuário (com atividade) para o Registro da atividade.
# COPIA + arquiva o original (não apaga). Idempotente e reversível.
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-migrate-user-stories-to-registro.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260727220000_migrate_user_stories_to_registro.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260727220000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── DIAGNÓSTICO (antes) ──"
$PSQL -c "SELECT
  count(*) AS total,
  count(*) FILTER (WHERE is_trashed) AS na_lixeira,
  count(*) FILTER (WHERE activity_id IS NOT NULL AND NOT is_trashed) AS migraveis,
  count(*) FILTER (WHERE activity_id IS NULL AND NOT is_trashed) AS soltas,
  count(*) FILTER (WHERE image_url IS NOT NULL) AS com_imagem,
  count(DISTINCT project_id) AS projetos
FROM public.user_stories;"

echo "── APLICANDO (transação; ROLLBACK automático em erro) ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/migrate_stories.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/migrate_stories.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── VERIFICAÇÃO (depois) ──"
$PSQL -c "SELECT count(*) AS entradas_no_registro FROM public.activity_comments WHERE author = 'História (migrada)';"
$PSQL -c "SELECT count(*) AS historias_soltas_preservadas FROM public.user_stories WHERE activity_id IS NULL AND NOT is_trashed;"
echo "Backup salvo em: public._backup_user_stories_20260727"
echo "Reversão: ver bloco comentado no fim do .sql"
