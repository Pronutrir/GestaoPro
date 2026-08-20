#!/bin/bash
set -e
# ============================================================================
# OS FILHOS ACOMPANHAM O PAI
#
# A migration 20260819110000 tirou os AGRUPADORES do Backlog e deixou os
# FILHOS lá. São 29 pacotes em "Não iniciado" com os filhos numa coluna que o
# quadro não desenha — "o pacote se perde com os seus filhos".
#
# NÃO mexe na coluna de ENTRADA. O Backlog SER a entrada é o comportamento
# correto: a EAP importada é planejamento, nasce na fila, e quem decide o que
# entra no quadro é o usuário. (Uma versão anterior deste script mudava a
# entrada — estava errado e foi removido.)
#
# Altera UMA coluna (`workflow_stage_id`) e não apaga nada.
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-filhos-acompanham-pai.sh
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

MIG="supabase/migrations/20260820120000_filhos_acompanham_o_pai.sql"
VERSION=20260820120000

if [ ! -f "$MIG" ]; then
  echo "ERRO: migration não encontrada: $MIG"
  exit 1
fi

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
echo ""
echo "── DEPOIS: as duas consultas de defeito devem vir ZERADAS ──"
$PSQL -c "
SELECT
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
echo "  Esperado: filhos_perdidos = 0"
echo "  e os Backlogs seguem invisíveis e como entrada — eles são a fila."
