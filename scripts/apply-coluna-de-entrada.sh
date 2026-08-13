#!/bin/bash
set -e
# Coluna de ENTRADA como marca (is_entry_point), em vez de "quem está em
# primeiro". Faz o backfill preservando o comportamento atual de cada projeto e
# tira o Backlog dos padrões de projeto NOVO (projetos existentes não mudam).
# Aditiva e idempotente; sem ela o código cai no comportamento antigo
# (display_order = 0 define a entrada).
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-coluna-de-entrada.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260812140000_coluna_de_entrada.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260812140000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES ──"
$PSQL -c "SELECT count(*) FILTER (WHERE display_order = 0) AS colunas_em_primeiro,
                 count(DISTINCT project_id) AS projetos
          FROM public.workflow_stages;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/coluna_de_entrada.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/coluna_de_entrada.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS (cada projeto deve ter exatamente 1 entrada) ──"
# O passo 2b desliga o Backlog do quadro em TODO projeto existente. Quem já
# tinha ligado o interruptor "No quadro" de propósito perde a escolha — é uma
# vez só, e religar é um clique na tela de colunas. Este contador diz quantos
# foram afetados, para não ser silencioso.
$PSQL -c "SELECT count(*) AS backlogs_fora_do_quadro FROM public.workflow_stages
          WHERE categoria = 'backlog' AND is_visible = false;"
$PSQL -c "SELECT count(*) AS projetos_com_entrada FROM (
            SELECT project_id FROM public.workflow_stages
            WHERE is_entry_point GROUP BY project_id
          ) t;"
$PSQL -c "SELECT count(DISTINCT project_id) AS total_projetos FROM public.workflow_stages;"
$PSQL -c "SELECT indexname FROM pg_indexes
          WHERE schemaname='public' AND tablename='workflow_stages'
            AND indexname='workflow_stages_one_entry_per_project';"
