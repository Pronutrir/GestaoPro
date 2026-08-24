#!/bin/bash
set -e
# "Importo no Backlog e a EAP vai para Nao iniciado."
#
# 5 dos 48 projetos nao tem coluna de Backlog (projeto novo nasce sem ela
# desde 12/08). Sem fila, o importador grava `workflow_stage_id = NULL` -- e
# o QUADRO adotava esses itens na primeira coluna, "Nao iniciado".
#
# A correcao de tela (ActivityKanban, mesmo commit) ja tira o card do quadro.
# Esta migration cria a fila que falta e recolhe os orfaos para ela.
#
# Idempotente: so cria onde nao existe.
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-fila-para-quem-nao-tem.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260824120000_fila_para_quem_nao_tem.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260824120000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES ──"
$PSQL -c "SELECT
  (SELECT count(*) FROM public.projects) AS projetos,
  (SELECT count(DISTINCT project_id) FROM public.workflow_stages
    WHERE lower(coalesce(categoria::text,'')) = 'backlog') AS com_fila,
  (SELECT count(*) FROM public.activities
    WHERE workflow_stage_id IS NULL AND is_trashed = false) AS atividades_sem_coluna;"

echo "── Projetos que vao ganhar fila ──"
$PSQL -c "SELECT p.title FROM public.projects p
 WHERE NOT EXISTS (SELECT 1 FROM public.workflow_stages s
   WHERE s.project_id = p.id AND lower(coalesce(s.categoria::text,'')) = 'backlog');"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/fila_para_quem_nao_tem.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/fila_para_quem_nao_tem.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS (com_fila = projetos, sem_coluna = 0) ──"
$PSQL -c "SELECT
  (SELECT count(*) FROM public.projects) AS projetos,
  (SELECT count(DISTINCT project_id) FROM public.workflow_stages
    WHERE lower(coalesce(categoria::text,'')) = 'backlog') AS com_fila,
  (SELECT count(*) FROM public.activities
    WHERE workflow_stage_id IS NULL AND is_trashed = false) AS atividades_sem_coluna;"

echo "── Nenhuma fila pode ser a ENTRADA do quadro ──"
$PSQL -c "SELECT count(*) AS fila_como_entrada FROM public.workflow_stages
  WHERE lower(coalesce(categoria::text,'')) = 'backlog' AND is_entry_point = true;"
