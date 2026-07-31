#!/bin/bash
set -e
# FINANCEIRO Fase 4: estimativa em três pontos (PERT) nos itens de orçamento.
# Aditiva e idempotente; sem ela o item aceita apenas o valor direto.
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-budget-pert-fase4.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260730180000_budget_pert_fase4.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260730180000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES ──"
$PSQL -c "SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='budget_items'
            AND column_name IN ('estimate_method','optimistic_cost','likely_cost','pessimistic_cost') ORDER BY 1;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/budget_pert_fase4.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/budget_pert_fase4.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS (4 colunas) ──"
$PSQL -c "SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='budget_items'
            AND column_name IN ('estimate_method','optimistic_cost','likely_cost','pessimistic_cost') ORDER BY 1;"
