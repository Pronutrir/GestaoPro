#!/bin/bash
set -e
# ============================================================================
# CONGELAR item_type — e provar que ele tem ponto fixo
#
# Grava em `item_type` o valor que a tela ja mostra, e a partir daqui
# `resolveEapKind` LE o campo em vez de deduzir de `hasChildren`.
#
# ----------------------------------------------------------------------------
# O TESTE DE PONTO FIXO E OBRIGATORIO (exigencia do Raphael, 27/08)
#
# Esta migration roda DUAS VEZES. A segunda execucao tem de alterar ZERO
# linhas. Se alterar, sobrou alguma leitura que ainda deduz — e o script para
# e mostra quais linhas.
#
# Nao e zelo excessivo: o defeito que estamos matando E a falta de ponto fixo.
# Uma migration que "arruma" o tipo mas continua sem ponto fixo nao arrumou
# nada, so mudou o valor errado de lugar. Rodar duas vezes e a unica forma de
# distinguir as duas coisas.
#
# A migration ja e idempotente por construcao (ADD COLUMN IF NOT EXISTS,
# CREATE OR REPLACE, e o laco interno que itera ate convergir). A segunda
# execucao existe para PROVAR isso contra o banco de verdade, nao para
# completar servico.
#
# ----------------------------------------------------------------------------
# ATENCAO — 14 ITENS TROCAM DE ROTULO NA TELA
#
# Decisao tomada e registrada: ACEITAR. Sao 7 linhas vivas, em projetos de
# teste, e "Atividade" e o rotulo correto para elas. A lista completa, com id,
# projeto e titulo, esta em:
#
#   docs/medicoes/os-14-que-mudam-de-rotulo-27-08-2026.md
#
# ROLLBACK: scripts/rollback-congelar-item-type.sh
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-congelar-item-type.sh
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"
MIG="supabase/migrations/20260827130000_congelar_item_type.sql"
VERSION=20260827130000

[ -f "$MIG" ] || { echo "ERRO: migration nao encontrada: $MIG"; exit 1; }

echo "── ANTES ──"
echo ""
echo "1) Distribuicao atual de item_type:"
$PSQL -c "SELECT item_type, count(*) FROM public.activities
           GROUP BY item_type ORDER BY count(*) DESC;"

echo "2) Quantas linhas o congelamento vai reescrever (previsao do cliente: 2604):"
echo "   — o numero exato sai no NOTICE da migration."

echo "3) Os 14 que trocam de rotulo ja estao decididos e registrados:"
echo "   docs/medicoes/os-14-que-mudam-de-rotulo-27-08-2026.md"

echo ""
read -r -p "Aplicar? [s/N] " RESP
case "$RESP" in
  s|S|sim|SIM) ;;
  *) echo "Cancelado. Nada foi alterado."; exit 0 ;;
esac

docker cp "$MIG" "$CONTAINER:/tmp/congelar.sql"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  PRIMEIRA EXECUCAO — o congelamento"
echo "══════════════════════════════════════════════════════════"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/congelar.sql

$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
          VALUES (${VERSION}, NOW()) ON CONFLICT DO NOTHING;"

# ---------------------------------------------------------------------------
# A prova. Guardamos o estado, rodamos de novo, e comparamos linha a linha.
#
# Uma tabela real (nao TEMP): a segunda execucao roda noutra sessao do psql, e
# TEMP nao sobreviveria. Ela e derrubada logo depois.
# ---------------------------------------------------------------------------
echo ""
echo "══════════════════════════════════════════════════════════"
echo "  SEGUNDA EXECUCAO — o teste de ponto fixo"
echo "══════════════════════════════════════════════════════════"

$PSQL -v ON_ERROR_STOP=1 -c "
  DROP TABLE IF EXISTS public._ponto_fixo_antes;
  CREATE TABLE public._ponto_fixo_antes AS
    SELECT id, item_type FROM public.activities;"

$PSQL -v ON_ERROR_STOP=1 -f /tmp/congelar.sql

echo ""
echo "── O VEREDITO ──"
$PSQL -v ON_ERROR_STOP=1 -c "
DO \$\$
DECLARE
  v_dif int;
  r     record;
BEGIN
  SELECT count(*) INTO v_dif
    FROM public.activities a
    JOIN public._ponto_fixo_antes b ON b.id = a.id
   WHERE a.item_type IS DISTINCT FROM b.item_type;

  IF v_dif = 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '  OK — a segunda execucao alterou ZERO linhas.';
    RAISE NOTICE '  item_type tem ponto fixo: ler e gravar devolvem o mesmo valor.';
    RAISE NOTICE '';
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '  FALHOU — % linhas mudaram na SEGUNDA execucao:', v_dif;
    FOR r IN SELECT a.id, a.title, b.item_type AS de, a.item_type AS para
               FROM public.activities a
               JOIN public._ponto_fixo_antes b ON b.id = a.id
              WHERE a.item_type IS DISTINCT FROM b.item_type
              LIMIT 40 LOOP
      RAISE NOTICE '    % | % | % -> %', r.id, left(r.title, 40), r.de, r.para;
    END LOOP;
    RAISE EXCEPTION 'sem ponto fixo: sobrou leitura que ainda deduz';
  END IF;
END \$\$;"

$PSQL -c "DROP TABLE IF EXISTS public._ponto_fixo_antes;"

echo ""
echo "── DEPOIS ──"
$PSQL -c "SELECT item_type, count(*) FROM public.activities
           GROUP BY item_type ORDER BY count(*) DESC;"

echo ""
echo "Linhas que esta migration alterou (contra a sombra):"
$PSQL -c "SELECT count(*) AS alteradas FROM public.activities
           WHERE item_type IS DISTINCT FROM item_type_antes_congelar;"

echo ""
echo "concluido — congelado e com ponto fixo provado"
