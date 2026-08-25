#!/bin/bash
set -e
# PROJETO NOVO PASSA A NASCER COM A FILA.
#
# "Teste 02 - Revitalizacao Tasy", criado em 25/08 as 01:23, nasceu SEM coluna
# de Backlog -- e a EAP importada nele foi inteira para "Nao iniciado", porque
# era o unico destino possivel.
#
# A 20260824120000 criou a fila nos projetos que existiam, mas nao mexeu no
# gatilho: o defeito voltou no primeiro projeto criado depois dela.
#
# Esta migration so REDEFINE A FUNCAO -- nao toca em dado. Para os projetos que
# ja nasceram sem fila, o script roda `apply-fila-para-quem-nao-tem.sh` em
# seguida (idempotente).
#
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-projeto-novo-com-fila.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260825120000_projeto_novo_nasce_com_fila.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260825120000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES: projetos sem fila ──"
$PSQL -c "
SELECT p.title, p.created_at::date AS criado
  FROM public.projects p
 WHERE NOT EXISTS (SELECT 1 FROM public.workflow_stages s
   WHERE s.project_id = p.id AND lower(coalesce(s.categoria::text,'')) = 'backlog')
 ORDER BY p.created_at DESC;"

# ORDEM IMPORTA. A 20260824120000 CRIA a fila onde falta; a nova a usa como
# destino ao recolher o que foi para o quadro. Invertida, o recolhimento nao
# acharia coluna nenhuma e nao faria nada -- silenciosamente.
echo "── 1/2 · CRIANDO A FILA onde falta (20260824120000, idempotente) ──"
docker cp "supabase/migrations/20260824120000_fila_para_quem_nao_tem.sql" \
          "$CONTAINER:/tmp/fila_para_quem_nao_tem.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/fila_para_quem_nao_tem.sql

echo
echo "── 2/2 · GATILHO + recolhimento do que ja foi para o quadro ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/projeto_novo_com_fila.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/projeto_novo_com_fila.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS (sem_fila deve ser 0) ──"
$PSQL -c "SELECT
  (SELECT count(*) FROM public.projects) AS projetos,
  (SELECT count(DISTINCT project_id) FROM public.workflow_stages
    WHERE lower(coalesce(categoria::text,'')) = 'backlog') AS com_fila,
  (SELECT count(*) FROM public.projects p WHERE NOT EXISTS (
     SELECT 1 FROM public.workflow_stages s
      WHERE s.project_id = p.id
        AND lower(coalesce(s.categoria::text,'')) = 'backlog')) AS sem_fila;"

echo "── Cada projeto tem exatamente UMA entrada, e nunca a fila ──"
$PSQL -c "SELECT
  (SELECT count(*) FROM (SELECT project_id FROM public.workflow_stages
     WHERE is_entry_point GROUP BY project_id HAVING count(*) > 1) t) AS com_entrada_duplicada,
  (SELECT count(*) FROM public.workflow_stages
    WHERE is_entry_point AND lower(coalesce(categoria::text,'')) = 'backlog') AS fila_como_entrada;"

echo "── Onde ficou a EAP dos projetos que estavam sem fila ──"
$PSQL -c "
SELECT p.title,
       count(*) FILTER (WHERE lower(coalesce(s.categoria::text,'')) = 'backlog') AS na_fila,
       count(*) FILTER (WHERE lower(coalesce(s.categoria::text,'')) = 'a_iniciar') AS em_nao_iniciado
  FROM public.activities a
  JOIN public.projects p ON p.id = a.project_id
  LEFT JOIN public.workflow_stages s ON s.id = a.workflow_stage_id
 WHERE a.is_trashed = false AND p.title ILIKE '%Tasy%'
 GROUP BY p.title ORDER BY p.title;"
