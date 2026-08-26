#!/bin/bash
set -e
# ============================================================================
# FASE 09 — A DERIVAÇÃO PAI↔FILHA PASSA A RODAR NO SERVIDOR
#
# Cria as colunas `derived_*`, a trigger que as mantém, e faz o backfill das
# folhas para a raiz.
#
# POR QUE ISTO EXISTE: o inventário achou 21 pontos de rollup, 19 no cliente,
# e três fórmulas de progresso vivas com profundidades diferentes. Dois desses
# pontos GRAVAVAM a partir de uma lista que passa pela RLS — quem enxergava 1
# de 8 filhas persistia o total daquela única filha. A gravação foi removida em
# 26/08 (commit 5e05895); esta migration cria a derivação correta.
#
# MARCO (decisão de 26/08): peso ZERO em horas, custo e progresso — mas DENTRO
# da janela de datas, porque a fase vai até o marco.
#
# ATENÇÃO — a migration LIMPA horas e custo de marcos que os tenham, e passa a
# RECUSAR gravação de esforço em marco. A sonda abaixo mostra quantos serão
# afetados antes de aplicar.
#
# Idempotente: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE. O backfill
# recalcula sobre o mesmo dado e chega ao mesmo resultado.
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-fase09-derivacao.sh
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

run() {
  local version="$1" file="$2" nome="$3"
  echo ""
  echo "══════════════════════════════════════════════════════════"
  echo "  $nome"
  echo "══════════════════════════════════════════════════════════"
  if [ ! -f "$file" ]; then
    echo "  ERRO: migration não encontrada: $file"
    exit 1
  fi
  docker cp "$file" "$CONTAINER:/tmp/mig.sql"
  $PSQL -v ON_ERROR_STOP=1 -f /tmp/mig.sql
  $PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
            VALUES (${version}, NOW()) ON CONFLICT DO NOTHING;"
  echo "  ✓ aplicada"
}

echo "── ANTES ──"
echo ""
echo "1) Quantos pais serão derivados:"
$PSQL -c "SELECT count(*) AS pais_com_filhas
            FROM public.activities p
           WHERE p.is_trashed = false
             AND EXISTS (SELECT 1 FROM public.activities f
                          WHERE f.parent_id = p.id AND f.is_trashed = false);"

echo "2) MARCOS que vão perder horas/custo (a migration limpa):"
$PSQL -c "SELECT count(*) AS marcos_com_esforco,
                 COALESCE(sum(COALESCE(hours,0)),0) AS horas_removidas,
                 COALESCE(sum(COALESCE(cost,0)),0)  AS custo_removido
            FROM public.activities
           WHERE is_milestone = true
             AND (COALESCE(hours,0) <> 0 OR COALESCE(cost,0) <> 0);"
echo "   (marco não tem esforço no modelo; se o número for alto, revise antes)"

echo "3) Profundidade máxima da árvore (o backfill tem teto de 20):"
$PSQL -c "WITH RECURSIVE arv AS (
            SELECT id, parent_id, 0 AS nivel FROM public.activities
             WHERE parent_id IS NULL AND is_trashed = false
            UNION ALL
            SELECT f.id, f.parent_id, arv.nivel + 1
              FROM public.activities f JOIN arv ON f.parent_id = arv.id
             WHERE f.is_trashed = false AND arv.nivel < 25)
          SELECT max(nivel) AS profundidade FROM arv;"

echo ""
read -r -p "Aplicar a migration? [s/N] " RESP
case "$RESP" in
  s|S|sim|SIM) ;;
  *) echo "Cancelado. Nada foi alterado."; exit 0 ;;
esac

run 20260826130000 "supabase/migrations/20260826130000_fase09_derivacao_no_servidor.sql" \
  "derived_* + trigger + backfill das folhas para a raiz"

echo ""
echo "── DEPOIS ──"
$PSQL -c "SELECT count(*) FILTER (WHERE derived_children IS NOT NULL) AS pais_derivados,
                 count(*) FILTER (WHERE derived_children IS NULL)     AS folhas
            FROM public.activities WHERE is_trashed = false;"

echo "Onde o derivado discorda do que estava gravado (esperado: o antigo era parcial):"
$PSQL -c "SELECT count(*) AS pais_com_horas_corrigidas
            FROM public.activities
           WHERE is_trashed = false
             AND derived_children IS NOT NULL
             AND COALESCE(hours,0) IS DISTINCT FROM COALESCE(derived_hours,0);"
echo ""
echo "✓ concluído"
