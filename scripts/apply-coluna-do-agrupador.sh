#!/bin/bash
set -e
# ============================================================================
# A COLUNA DO AGRUPADOR PASSA A SEGUIR OS FILHOS
#
# Sintoma (18/08/2026): um pacote com 5 subatividades exibia a barra em 84%
# sentado na coluna "Não iniciado". As 5 foram concluídas e depois uma voltou
# para "Em Andamento" -- e o pacote apareceu em "Não iniciado".
#
# O pacote nunca "foi para Não iniciado": ele NUNCA SAIU DE LÁ. A coluna do pai
# é um campo gravado e nada no sistema o recalculava a partir dos filhos --
# não havia trigger, rollup nem propagação em nenhuma migration do repositório.
# Concluir os 5 filhos não deu erro: deu um pai em 100% parado na coluna
# errada, indistinguível de estar certo. Mover um filho de volta só revelou uma
# divergência que já existia.
#
# A migration instala o trigger que faltava e corrige o que já está divergente.
# É idempotente: rodar duas vezes não faz nada na segunda.
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-coluna-do-agrupador.sh
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

MIG="supabase/migrations/20260818140000_coluna_do_agrupador_segue_os_filhos.sql"
VERSION=20260818140000

if [ ! -f "$MIG" ]; then
  echo "ERRO: migration não encontrada: $MIG"
  exit 1
fi

echo "── ANTES: os agrupadores mais divergentes ──"
# Amostra do problema com nome, para a saída mostrar CASOS e não só um número.
$PSQL -c "
SELECT p.title AS pacote,
       sp.title AS coluna_do_pai,
       count(f.id) AS filhos,
       count(*) FILTER (WHERE sf.is_final = true) AS concluidos
  FROM public.activities p
  JOIN public.workflow_stages sp ON sp.id = p.workflow_stage_id
  JOIN public.activities f ON f.parent_activity_id = p.id AND f.is_trashed = false
  LEFT JOIN public.workflow_stages sf ON sf.id = f.workflow_stage_id
 WHERE p.is_trashed = false AND p.is_milestone IS DISTINCT FROM true
 GROUP BY p.id, p.title, sp.title, sp.is_final
HAVING (sp.is_final IS DISTINCT FROM true
        AND count(*) FILTER (WHERE sf.is_final = true) = count(f.id))
    OR (sp.is_final = true
        AND count(*) FILTER (WHERE sf.is_final = true) < count(f.id))
 ORDER BY count(f.id) DESC
 LIMIT 15;"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Trigger + backfill  ·  a coluna do pai passa a seguir os filhos"
echo "══════════════════════════════════════════════════════════"
docker cp "$MIG" "$CONTAINER:/tmp/mig.sql"
# ON_ERROR_STOP: para no primeiro erro em vez de seguir com o banco meio
# migrado, que é pior que não ter começado.
$PSQL -v ON_ERROR_STOP=1 -f /tmp/mig.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
          VALUES (${VERSION}, NOW()) ON CONFLICT DO NOTHING;"
echo "  ✓ aplicada"

echo ""
echo "── DEPOIS: a mesma consulta deve vir VAZIA ──"
$PSQL -c "
SELECT p.title AS pacote,
       sp.title AS coluna_do_pai,
       count(f.id) AS filhos,
       count(*) FILTER (WHERE sf.is_final = true) AS concluidos
  FROM public.activities p
  JOIN public.workflow_stages sp ON sp.id = p.workflow_stage_id
  JOIN public.activities f ON f.parent_activity_id = p.id AND f.is_trashed = false
  LEFT JOIN public.workflow_stages sf ON sf.id = f.workflow_stage_id
 WHERE p.is_trashed = false AND p.is_milestone IS DISTINCT FROM true
 GROUP BY p.id, p.title, sp.title, sp.is_final
HAVING (sp.is_final IS DISTINCT FROM true
        AND count(*) FILTER (WHERE sf.is_final = true) = count(f.id))
    OR (sp.is_final = true
        AND count(*) FILTER (WHERE sf.is_final = true) < count(f.id))
 ORDER BY count(f.id) DESC
 LIMIT 15;"

echo ""
echo "── O trigger está instalado? ──"
$PSQL -c "SELECT tgname FROM pg_trigger
           WHERE tgrelid = 'public.activities'::regclass
             AND tgname = 'trg_filho_recalcula_pai';"
echo ""
echo "  Esperado: a consulta DEPOIS vazia e o trigger listado."
echo "  Se sobrar linha, é quadro sem coluna para o papel -- conferir o projeto."
