#!/bin/bash
set -e
# ============================================================================
# O AGRUPADOR NÃO PODE PARAR FORA DO QUADRO
#
# Sintoma: as subatividades aparecem em "Não iniciado" e o pacote que as
# agrupa some do quadro.
#
# Causa: `stage_do_papel(projeto, 'inicio')` aceitava as categorias
# 'a_iniciar' E 'backlog', desempatando por `display_order` — e o Backlog é
# sempre display_order = 0. Ou seja, escolhia justamente a coluna que o quadro
# NÃO desenha (o Backlog nasce com is_visible = false, por decisão de produto).
#
# A função passa a preferir colunas VISÍVEIS. A invisível continua elegível
# como último recurso — devolver NULL deixaria o agrupador sem destino, o que
# é pior que a coluna errada.
#
# O backfill tira da gaveta os agrupadores que já estão lá, reusando
# `recalcular_coluna_do_pai` (a mesma função do trigger) para que backfill e
# operação normal não possam divergir.
#
# Folha no Backlog NÃO é tocada: fila de trabalho é o propósito da coluna.
# Só AGRUPADOR sai, porque ele não é trabalho — é a caixa que mostra onde o
# trabalho está.
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-agrupador-no-quadro.sh
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

MIG="supabase/migrations/20260819110000_agrupador_nao_para_fora_do_quadro.sql"
VERSION=20260819110000

if [ ! -f "$MIG" ]; then
  echo "ERRO: migration não encontrada: $MIG"
  exit 1
fi

echo "── ANTES: agrupadores escondidos COM filho visível (o sintoma) ──"
# Estes são os casos que produzem "filhos órfãos na tela": o pai está numa
# coluna que o quadro não desenha e os filhos, não.
$PSQL -c "
SELECT p.title AS projeto,
       pai.title AS agrupador,
       sp.title AS coluna_do_pai,
       count(f.id) AS filhos_visiveis
  FROM public.activities pai
  JOIN public.workflow_stages sp ON sp.id = pai.workflow_stage_id
  JOIN public.projects p ON p.id = pai.project_id
  JOIN public.activities f ON f.parent_id = pai.id AND f.is_trashed = false
  JOIN public.workflow_stages sf ON sf.id = f.workflow_stage_id
 WHERE pai.is_trashed = false
   AND pai.is_milestone IS DISTINCT FROM true
   AND sp.is_visible = false
   AND sf.is_visible IS DISTINCT FROM false
 GROUP BY p.title, pai.title, sp.title
 ORDER BY count(f.id) DESC
 LIMIT 40;"

echo ""
echo "── Totais antes ──"
$PSQL -c "
SELECT count(*) FILTER (WHERE sp.is_visible = false) AS agrupadores_escondidos,
       count(*) AS agrupadores_no_total
  FROM public.activities pai
  JOIN public.workflow_stages sp ON sp.id = pai.workflow_stage_id
 WHERE pai.is_trashed = false
   AND pai.is_milestone IS DISTINCT FROM true
   AND EXISTS (SELECT 1 FROM public.activities f
                WHERE f.parent_id = pai.id AND f.is_trashed = false);"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  stage_do_papel prefere coluna VISÍVEL  ·  backfill"
echo "══════════════════════════════════════════════════════════"
docker cp "$MIG" "$CONTAINER:/tmp/mig_agrupador_quadro.sql"
# ON_ERROR_STOP: para no primeiro erro em vez de deixar o banco meio migrado.
$PSQL -v ON_ERROR_STOP=1 -f /tmp/mig_agrupador_quadro.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
          VALUES (${VERSION}, NOW()) ON CONFLICT DO NOTHING;"
echo "  ✓ aplicada"

echo ""
echo "── DEPOIS: a primeira consulta deve vir VAZIA ──"
$PSQL -c "
SELECT p.title AS projeto,
       pai.title AS agrupador,
       sp.title AS coluna_do_pai
  FROM public.activities pai
  JOIN public.workflow_stages sp ON sp.id = pai.workflow_stage_id
  JOIN public.projects p ON p.id = pai.project_id
 WHERE pai.is_trashed = false
   AND pai.is_milestone IS DISTINCT FROM true
   AND sp.is_visible = false
   AND EXISTS (
     SELECT 1 FROM public.activities f
       JOIN public.workflow_stages sf ON sf.id = f.workflow_stage_id
      WHERE f.parent_id = pai.id AND f.is_trashed = false
        AND sf.is_visible IS DISTINCT FROM false)
 LIMIT 20;"

echo ""
echo "── As FOLHAS do Backlog continuam lá (não foram tocadas) ──"
# Esperado: um número grande e inalterado. A fila é o propósito da coluna.
$PSQL -c "
SELECT count(*) AS folhas_no_backlog
  FROM public.activities a
  JOIN public.workflow_stages s ON s.id = a.workflow_stage_id
 WHERE a.is_trashed = false
   AND s.categoria = 'backlog'
   AND NOT EXISTS (SELECT 1 FROM public.activities f
                    WHERE f.parent_id = a.id AND f.is_trashed = false);"

echo ""
echo "  Esperado: a consulta DEPOIS vazia; as folhas do Backlog intactas."
echo "  Se sobrar linha, é projeto sem coluna visível para aquele papel."
