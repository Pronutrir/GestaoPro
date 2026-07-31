#!/bin/bash
set -e
# ORÇAMENTO LEGADO -> ITEM DE ORÇAMENTO
#
# 7 projetos tinham R$ 218.500 em projects.budget_planned e nenhum item na
# Composição do Orçamento. Como o painel novo calcula o planejado pela SOMA dos
# itens, esse dinheiro não aparecia em lugar nenhum — e sumiria de vez quando o
# botão antigo ("Editar Orçamento") fosse aposentado.
#
# A migration converte cada valor legado em um item "Orçamento inicial
# (migrado)", preservando o total. Não apaga a coluna antiga.
#
# Idempotente: só cria item onde ainda não existe nenhum.
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-budget-migration.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260801130000_migrate_legacy_budget_to_items.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260801130000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES (projetos com orçamento legado e sem itens) ──"
$PSQL -c "SELECT p.title,
                 p.budget_planned AS legado,
                 (SELECT count(*) FROM public.budget_items b WHERE b.project_id = p.id) AS itens
          FROM public.projects p
          WHERE coalesce(p.budget_planned,0) > 0 AND p.is_trashed = false
          ORDER BY p.budget_planned DESC;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/budget_migration.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/budget_migration.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS (o total por projeto deve bater com o legado) ──"
$PSQL -c "SELECT p.title,
                 p.budget_planned AS legado,
                 coalesce(sum(b.total_cost),0) AS soma_itens,
                 count(b.id) AS itens
          FROM public.projects p
          LEFT JOIN public.budget_items b ON b.project_id = p.id
          WHERE coalesce(p.budget_planned,0) > 0 AND p.is_trashed = false
          GROUP BY p.id, p.title, p.budget_planned
          ORDER BY p.budget_planned DESC;"
