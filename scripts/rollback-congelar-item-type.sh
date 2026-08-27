#!/bin/bash
set -e
# ============================================================================
# ROLLBACK DO CONGELAMENTO DE item_type
#
# Devolve cada linha ao valor guardado em `item_type_antes_congelar` e derruba
# a coluna sombra.
#
# ATENCAO — REVERTER O BANCO NAO BASTA. `resolveEapKind` (src/lib/eapModel.ts)
# passou a LER o campo, sem o `OR hasChildren`. Se o banco voltar ao valor
# antigo e o codigo continuar lendo, a tela passa a exibir o lixo da
# importacao: 1.591 itens gravados como 'fase' que nunca foram fase.
#
# Reverter os dois lados, ou nenhum. O commit a reverter no codigo e o mesmo
# que introduziu a leitura pura.
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"
MIG="supabase/migrations/20260827130001_congelar_item_type_rollback.sql"

[ -f "$MIG" ] || { echo "ERRO: rollback nao encontrado: $MIG"; exit 1; }

echo "── ANTES DE REVERTER ──"
$PSQL -c "SELECT count(*) AS voltam_ao_valor_antigo FROM public.activities
           WHERE item_type IS DISTINCT FROM item_type_antes_congelar;"

echo ""
echo "Lembrete: reverter o banco sem reverter src/lib/eapModel.ts deixa a tela"
echo "lendo um campo que voltou a ser lixo de importacao."
echo ""
read -r -p "Reverter mesmo assim? [s/N] " RESP
case "$RESP" in
  s|S|sim|SIM) ;;
  *) echo "Cancelado. Nada foi alterado."; exit 0 ;;
esac

docker cp "$MIG" "$CONTAINER:/tmp/rollback.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/rollback.sql

$PSQL -c "DELETE FROM public.schema_migrations WHERE version = 20260827130000;"

echo ""
echo "revertido"
