#!/bin/bash
set -e
# Conserta o backfill de categoria: colunas do tipo "A Fazer" tinham virado
# 'andamento' junto com as de trabalho em curso, deixando quase tudo como
# "em andamento" no quadro.
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-fix-stage-category-backfill.sh
#
# Só é necessário se apply-workflow-stage-category.sh JÁ foi aplicado antes
# desta correção. Em banco novo, o backfill corrigido já roda certo.

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260729010000_fix_stage_category_backfill.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260729010000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES ──"
$PSQL -c "SELECT categoria, count(*) AS colunas, string_agg(DISTINCT title, ' | ') AS titulos
FROM public.workflow_stages GROUP BY categoria ORDER BY 1;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/fix_stage_category.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/fix_stage_category.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS ──"
$PSQL -c "SELECT categoria, count(*) AS colunas, string_agg(DISTINCT title, ' | ') AS titulos
FROM public.workflow_stages GROUP BY categoria ORDER BY 1;"

echo
echo "Confira a lista acima. Qualquer coluna ainda classificada de forma"
echo "errada pode ser ajustada uma a uma no menu da coluna, no Kanban."
