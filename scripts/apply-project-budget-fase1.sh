#!/bin/bash
set -e
# FINANCEIRO Fase 1: budget_items (composição do orçamento), cost_rates (taxa
# por papel com exceção por pessoa e vigência) e project_budget_settings
# (plano de custos + reservas contingência/gerencial).
# Aditiva e idempotente; sem ela a aba Financeiro segue com os dois campos
# digitados e avisa que a composição está indisponível.
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-project-budget-fase1.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260730160000_project_budget_fase1.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260730160000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES ──"
$PSQL -c "SELECT to_regclass('public.budget_items') AS budget_items,
                 to_regclass('public.cost_rates') AS cost_rates,
                 to_regclass('public.project_budget_settings') AS budget_settings;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/project_budget_fase1.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/project_budget_fase1.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS (as 3 tabelas devem existir) ──"
$PSQL -c "SELECT to_regclass('public.budget_items') AS budget_items,
                 to_regclass('public.cost_rates') AS cost_rates,
                 to_regclass('public.project_budget_settings') AS budget_settings;"
$PSQL -c "SELECT tablename, policyname FROM pg_policies
          WHERE schemaname='public' AND tablename IN ('budget_items','cost_rates','project_budget_settings')
          ORDER BY 1,2;"
