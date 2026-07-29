#!/bin/bash
set -e
# Adiciona a categoria semântica às colunas do Kanban (aditivo, idempotente).
# A categoria substitui a inferência por regex sobre o TÍTULO da coluna, que
# desmarcava is_final ao renomear e derrubava progresso/health score.
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-workflow-stage-category.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260728233000_add_workflow_stage_category.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260728233000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── DIAGNÓSTICO (antes) ──"
$PSQL -c "SELECT
  count(*) AS colunas,
  count(DISTINCT project_id) AS projetos,
  count(*) FILTER (WHERE is_final) AS finais,
  count(*) FILTER (WHERE COALESCE(is_blocked,false)) AS bloqueio,
  count(*) FILTER (WHERE COALESCE(is_exception,false)) AS excecao,
  count(*) FILTER (WHERE contributes_to_progress = false) AS fora_do_progresso
FROM public.workflow_stages;"

echo "── Projetos com MAIS DE UMA coluna final (violam o índice único) ──"
$PSQL -c "SELECT project_id, count(*) AS finais,
  string_agg(title, ' | ' ORDER BY display_order) AS colunas
FROM public.workflow_stages
WHERE is_final
GROUP BY project_id
HAVING count(*) > 1;"

echo
echo "Se a consulta acima retornou linhas, a migration VAI FALHAR no índice"
echo "único. Resolva antes deixando uma só coluna final por projeto."
echo

echo "── APLICANDO (ON_ERROR_STOP; nada é gravado pela metade) ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/workflow_stage_category.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/workflow_stage_category.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── VERIFICAÇÃO (depois) ──"
$PSQL -c "SELECT categoria, count(*) AS colunas, count(DISTINCT project_id) AS projetos
FROM public.workflow_stages
GROUP BY categoria
ORDER BY 1;"

$PSQL -c "SELECT count(*) AS sem_categoria FROM public.workflow_stages WHERE categoria IS NULL;"

echo
echo "OK. Reversão: ver bloco comentado no fim do .sql"
