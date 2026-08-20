#!/bin/bash
set -e
# ============================================================================
# O BACKLOG DEIXA DE SER A ENTRADA DO QUADRO
#
# Sintoma: tudo nasce no Backlog, que o Kanban não desenha. O quadro abre
# quase vazio e a lista mostra "Backlog" em cada linha.
#
# Causa: as 43 colunas "Backlog" da base estão com `is_entry_point = true` e
# `is_visible = false` ao mesmo tempo. A entrada — onde a tarefa nova cai —
# era justamente a única coluna fora do quadro.
#
# Também corrige o segundo sintoma: a migration 20260819110000 tirou os
# AGRUPADORES do Backlog mas deixou os FILHOS lá. São 29 pacotes em "Não
# iniciado" com os filhos invisíveis — "o pacote se perde com os seus filhos".
#
# O Backlog CONTINUA existindo e continua fora do quadro. Ele é a fila de onde
# se traz o trabalho; o que muda é que deixa de ser o destino automático.
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-backlog-nao-e-entrada.sh
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

MIG="supabase/migrations/20260820120000_backlog_nao_e_entrada_do_quadro.sql"
VERSION=20260820120000

if [ ! -f "$MIG" ]; then
  echo "ERRO: migration não encontrada: $MIG"
  exit 1
fi

echo "── ANTES: colunas de ENTRADA que o quadro não desenha ──"
$PSQL -c "
SELECT p.title AS projeto, s.title AS coluna_de_entrada, s.is_visible
  FROM public.workflow_stages s
  JOIN public.projects p ON p.id = s.project_id
 WHERE s.is_entry_point = true AND s.is_visible = false
 ORDER BY p.title
 LIMIT 40;"

echo ""
echo "── ANTES: filhos fora do quadro com o pai dentro ──"
$PSQL -c "
SELECT p.title AS pacote, count(*) AS filhos_perdidos
  FROM public.activities f
  JOIN public.activities p ON p.id = f.parent_id
  JOIN public.workflow_stages sp ON sp.id = p.workflow_stage_id
  JOIN public.workflow_stages sf ON sf.id = f.workflow_stage_id
 WHERE f.is_trashed = false AND p.is_trashed = false
   AND sp.is_visible IS DISTINCT FROM false
   AND sf.is_visible = false
 GROUP BY p.title
 ORDER BY count(*) DESC
 LIMIT 30;"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Entrada vai para coluna visível · filhos acompanham o pai"
echo "══════════════════════════════════════════════════════════"
docker cp "$MIG" "$CONTAINER:/tmp/mig_backlog_entrada.sql"
# ON_ERROR_STOP: para no primeiro erro em vez de deixar o banco meio migrado.
$PSQL -v ON_ERROR_STOP=1 -f /tmp/mig_backlog_entrada.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
          VALUES (${VERSION}, NOW()) ON CONFLICT DO NOTHING;"
echo "  ✓ aplicada"

echo ""
echo "── DEPOIS: onde ficou a entrada de cada projeto ──"
$PSQL -c "
SELECT p.title AS projeto, s.title AS entrada, s.is_visible
  FROM public.workflow_stages s
  JOIN public.projects p ON p.id = s.project_id
 WHERE s.is_entry_point = true
 ORDER BY p.title
 LIMIT 40;"

echo ""
echo "── DEPOIS: as duas consultas de defeito devem vir ZERADAS ──"
$PSQL -c "
SELECT
  (SELECT count(*) FROM public.workflow_stages
    WHERE is_entry_point = true AND is_visible = false) AS entrada_invisivel,
  (SELECT count(*) FROM public.activities f
     JOIN public.activities p ON p.id = f.parent_id
     JOIN public.workflow_stages sp ON sp.id = p.workflow_stage_id
     JOIN public.workflow_stages sf ON sf.id = f.workflow_stage_id
    WHERE f.is_trashed = false AND p.is_trashed = false
      AND sp.is_visible IS DISTINCT FROM false
      AND sf.is_visible = false) AS filhos_perdidos;"

echo ""
echo "── O Backlog continua FORA do quadro (é o esperado) ──"
$PSQL -c "
SELECT count(*) AS backlogs_invisiveis
  FROM public.workflow_stages
 WHERE categoria::text = 'backlog' AND is_visible = false;"

echo ""
echo "  Esperado: entrada_invisivel = 0 · filhos_perdidos = 0"
echo "  e os Backlogs seguem invisíveis — eles são a fila, não o fluxo."
