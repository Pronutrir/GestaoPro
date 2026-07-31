#!/bin/bash
set -e
# FINANCEIRO Fase 2: linha de base versionada (budget_baselines) + custo
# distribuído por mês (budget_baseline_lines) + regra de reconhecimento
# (budget_items.accrual). É o pré-requisito da curva S e do valor agregado.
# Aditiva e idempotente; sem ela o painel avisa e segue sem baseline.
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-budget-baseline-fase2.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260730170000_budget_baseline_fase2.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260730170000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES ──"
$PSQL -c "SELECT to_regclass('public.budget_baselines') AS baselines,
                 to_regclass('public.budget_baseline_lines') AS baseline_lines;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/budget_baseline_fase2.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/budget_baseline_fase2.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS (2 tabelas + coluna accrual) ──"
$PSQL -c "SELECT to_regclass('public.budget_baselines') AS baselines,
                 to_regclass('public.budget_baseline_lines') AS baseline_lines;"
$PSQL -c "SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='budget_items' AND column_name='accrual';"
