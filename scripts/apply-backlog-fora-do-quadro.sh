#!/bin/bash
set -e
# BACKLOG NUNCA É COLUNA DO QUADRO.
#
# A regra vive no CÓDIGO (`colunasDoQuadro`), então o quadro já se comporta
# certo sem esta migration. Ela só ALINHA OS DADOS: preenche a categoria onde
# ficou nula e grava `is_visible = false` no Backlog, para o estado no banco
# concordar com o que a tela mostra.
#
# Aditiva e idempotente. Não move nenhuma atividade — mexe só em
# workflow_stages.
#
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-backlog-fora-do-quadro.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260820140000_backlog_fora_do_quadro.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260820140000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES ──"
$PSQL -c "SELECT
            count(*) FILTER (WHERE categoria = 'backlog') AS backlogs,
            count(*) FILTER (WHERE categoria = 'backlog' AND is_visible IS DISTINCT FROM false) AS backlogs_no_quadro,
            count(*) FILTER (WHERE categoria IS NULL) AS sem_categoria,
            count(*) FILTER (WHERE is_entry_point AND categoria = 'backlog') AS fila_como_entrada
          FROM public.workflow_stages;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/backlog_fora_do_quadro.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/backlog_fora_do_quadro.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS (os três primeiros devem ser 0) ──"
$PSQL -c "SELECT
            count(*) FILTER (WHERE categoria = 'backlog' AND is_visible IS DISTINCT FROM false) AS backlogs_no_quadro,
            count(*) FILTER (WHERE is_entry_point AND categoria = 'backlog') AS fila_como_entrada,
            count(*) FILTER (WHERE categoria IS NULL) AS sem_categoria,
            count(*) FILTER (WHERE categoria = 'backlog') AS backlogs
          FROM public.workflow_stages;"

echo "── Todo projeto continua com exatamente uma entrada? ──"
$PSQL -c "SELECT
            (SELECT count(DISTINCT project_id) FROM public.workflow_stages) AS projetos,
            (SELECT count(*) FROM (
               SELECT project_id FROM public.workflow_stages
               WHERE is_entry_point GROUP BY project_id
             ) t) AS com_entrada;"
