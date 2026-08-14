#!/bin/bash
set -e
# Renomeia a coluna "A Fazer" para "Não iniciado" em TODA a base.
#
# O nome dizia a mesma coisa que "Backlog" — a distinção entre as categorias
# `backlog` e `a_iniciar` é real no modelo, mas invisível na tela.
#
# Só o TÍTULO muda. Categoria, posição, cor e o vínculo das atividades ficam
# intactos: nenhuma tarefa muda de coluna, nenhum percentual se altera.
#
# Idempotente: rodar duas vezes não faz nada na segunda (o WHERE já não casa).
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-a-fazer-nao-iniciado.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260814120000_a_fazer_vira_nao_iniciado.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260814120000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES ──"
# Quantas vão mudar, e quantas ficam de fora POR QUÊ: uma coluna "A Fazer" com
# categoria diferente de `a_iniciar` não é renomeada, e é bom saber que existe.
$PSQL -c "SELECT
  count(*) FILTER (WHERE lower(btrim(title)) IN ('a fazer','afazer') AND categoria = 'a_iniciar') AS vao_mudar,
  count(*) FILTER (WHERE lower(btrim(title)) IN ('a fazer','afazer') AND categoria IS DISTINCT FROM 'a_iniciar') AS ficam_de_fora,
  count(*) FILTER (WHERE title = 'Não iniciado') AS ja_renomeadas
FROM public.workflow_stages;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/a_fazer_nao_iniciado.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/a_fazer_nao_iniciado.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS ──"
$PSQL -c "SELECT
  count(*) FILTER (WHERE title = 'Não iniciado') AS nao_iniciado,
  count(*) FILTER (WHERE lower(btrim(title)) IN ('a fazer','afazer')) AS sobrou_a_fazer
FROM public.workflow_stages;"

# Prova de que NADA mudou de lugar: a contagem de atividades por categoria tem
# de ser a mesma de antes. Renomear título não pode mover tarefa.
echo "── ATIVIDADES POR CATEGORIA (não pode ter mudado) ──"
$PSQL -c "SELECT s.categoria, count(a.id) AS atividades
          FROM public.workflow_stages s
          LEFT JOIN public.activities a ON a.workflow_stage_id = s.id AND NOT a.is_trashed
          GROUP BY s.categoria ORDER BY s.categoria;"
