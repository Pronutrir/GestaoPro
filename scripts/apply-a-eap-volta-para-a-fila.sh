#!/bin/bash
set -e
# A EAP PENDENTE VOLTA PARA A FILA.
#
# 760 atividades com codigo EAP, ainda pendentes, estao em "Nao iniciado".
# Foram para o quadro antes das correcoes, e nenhuma migration anterior as
# trouxe de volta: a 20260820150000 mexeu so em agrupador, e a 20260824120000
# so em quem estava sem coluna nenhuma.
#
# MOVE DADOS EM VOLUME, E NAO TEM DESFAZER. 7 projetos, um deles EM EXECUCAO
# ("Gestao dos processos tasy - oficial", 127 itens). O backup abaixo e a
# unica forma de voltar atras.
#
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-a-eap-volta-para-a-fila.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260825130000_a_eap_volta_para_a_fila.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260825130000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"
STAMP="$(date +%Y%m%d-%H%M%S)"

echo "── BACKUP do que vai ser movido ──"
echo "Grava id + coluna atual, para reverter com um UPDATE se precisar."
$PSQL -c "
CREATE TABLE IF NOT EXISTS public.backup_eap_fila_${STAMP} AS
SELECT a.id, a.workflow_stage_id AS coluna_antes, a.project_id, a.wbs_code, now() AS em
  FROM public.activities a
  JOIN public.workflow_stages s ON s.id = a.workflow_stage_id
 WHERE a.is_trashed = false
   AND lower(coalesce(s.categoria::text,'')) = 'a_iniciar'
   AND a.status = 'pending'
   AND a.wbs_code ~ '^[0-9]+(\.[0-9]+)*\$';"
$PSQL -c "SELECT count(*) AS linhas_no_backup FROM public.backup_eap_fila_${STAMP};"
echo "  tabela: public.backup_eap_fila_${STAMP}"
echo "  reverter:  UPDATE public.activities a SET workflow_stage_id = b.coluna_antes"
echo "             FROM public.backup_eap_fila_${STAMP} b WHERE b.id = a.id;"

echo
echo "── ANTES: quanto sai de cada projeto ──"
$PSQL -c "
SELECT p.title, p.status AS situacao, count(*) AS move
  FROM public.activities a
  JOIN public.workflow_stages s ON s.id = a.workflow_stage_id
  JOIN public.projects p ON p.id = a.project_id
 WHERE a.is_trashed = false
   AND lower(coalesce(s.categoria::text,'')) = 'a_iniciar'
   AND a.status = 'pending'
   AND a.wbs_code ~ '^[0-9]+(\.[0-9]+)*\$'
 GROUP BY p.title, p.status ORDER BY move DESC;"

# A fila precisa EXISTIR antes de ser destino. Dois dos 7 projetos nao a tem.
echo "── 1/2 · garantindo a fila (20260824120000, idempotente) ──"
docker cp "supabase/migrations/20260824120000_fila_para_quem_nao_tem.sql" \
          "$CONTAINER:/tmp/fila_para_quem_nao_tem.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/fila_para_quem_nao_tem.sql

echo
echo "── 2/2 · RECOLHENDO A EAP ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/eap_volta_fila.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/eap_volta_fila.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo
echo "── DEPOIS: onde as atividades ficaram ──"
$PSQL -c "
SELECT coalesce(lower(s.categoria::text),'(sem coluna)') AS coluna, count(*) AS qtd
  FROM public.activities a
  LEFT JOIN public.workflow_stages s ON s.id = a.workflow_stage_id
 WHERE a.is_trashed = false
 GROUP BY 1 ORDER BY 2 DESC;"

echo "── O trabalho EM CURSO nao foi tocado? ──"
$PSQL -c "
SELECT count(*) FILTER (WHERE a.status = 'in_progress') AS em_andamento,
       count(*) FILTER (WHERE a.status = 'completed')   AS concluidas
  FROM public.activities a WHERE a.is_trashed = false;"
