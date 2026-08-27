#!/bin/bash
set -e
# ============================================================================
# MARCO NAO TEM RESPONSAVEL NEM GUT — a protecao desce para o banco
#
# Limpa 60 marcos que tem responsavel e 3 que tem GUT, guarda o que foi
# apagado numa coluna sombra, e cria duas CHECK constraints para nao voltar a
# sujar.
#
# POR QUE: a tela parou de oferecer esses campos no commit 6ace54d, que ja
# esta no ar. Mas tela que para de oferecer nao limpa o que ja entrou, e nada
# impede a proxima via de escrita (importacao, API) de gravar de novo. A
# auditoria de 27/08 mostrou a diferenca entre as duas camadas:
#
#   O QUE O BANCO PROTEGE          O QUE SO A TELA PROTEGIA
#   wbs_code .......... 0 sujos    assigned_to ....... 60 sujos
#   filhas ............ 0 sujos    GUT ................ 3 sujos
#
# ALCANCE: 60 linhas, nao 13. As 13 sao as VIVAS; ha 49 marcos na lixeira
# igualmente sujos, e restaurar um deles devolveria o dado sujo.
#
# NAO E ACOPLADA a build nenhum: a tela ja nao oferece os campos.
#
# ROLLBACK:  ./scripts/apply-marco-sem-pessoa.sh --rollback
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-marco-sem-pessoa.sh
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

MIG="supabase/migrations/20260827120000_marco_nao_tem_pessoa_nem_gut.sql"
RB="supabase/migrations/20260827120001_marco_limpeza_rollback.sql"
VERSION=20260827120000

# ---------------------------------------------------------------------------
# ROLLBACK
# ---------------------------------------------------------------------------
if [ "$1" = "--rollback" ]; then
  [ -f "$RB" ] || { echo "ERRO: rollback nao encontrado: $RB"; exit 1; }

  echo "── ANTES DE REVERTER ──"
  $PSQL -c "SELECT count(*) AS marcos_que_recuperam_dado
              FROM public.activities WHERE marco_limpeza_backup IS NOT NULL;"

  echo ""
  read -r -p "Reverter? [s/N] " RESP
  case "$RESP" in
    s|S|sim|SIM) ;;
    *) echo "Cancelado. Nada foi alterado."; exit 0 ;;
  esac

  docker cp "$RB" "$CONTAINER:/tmp/marco_rb.sql"
  $PSQL -v ON_ERROR_STOP=1 -f /tmp/marco_rb.sql
  $PSQL -c "DELETE FROM public.schema_migrations WHERE version = ${VERSION};"
  echo ""
  echo "revertido — marco volta a aceitar responsavel e GUT"
  exit 0
fi

# ---------------------------------------------------------------------------
# APLICACAO
# ---------------------------------------------------------------------------
[ -f "$MIG" ] || { echo "ERRO: migration nao encontrada: $MIG"; exit 1; }

echo "── ANTES ──"
echo ""
echo "1) Marcos sujos (vivos e lixeira):"
$PSQL -c "SELECT count(*) FILTER (WHERE is_trashed = false) AS vivos,
                 count(*) FILTER (WHERE is_trashed = true)  AS na_lixeira,
                 count(*)                                    AS total
            FROM public.activities
           WHERE is_milestone = true
             AND (COALESCE(btrim(assigned_to), '') <> ''
               OR COALESCE(gravity,0) > 0 OR COALESCE(urgency,0) > 0
               OR COALESCE(tendency,0) > 0 OR COALESCE(priority_score,0) > 0);"

echo "2) Quem perde o nome — os VIVOS, que alguem pode notar:"
$PSQL -c "SELECT left(title, 46) AS marco, assigned_to AS responsavel
            FROM public.activities
           WHERE is_milestone = true AND is_trashed = false
             AND COALESCE(btrim(assigned_to), '') <> ''
           ORDER BY title LIMIT 20;"
echo "   (o nome NAO se perde: vai para marco_limpeza_backup e continua consultavel)"

echo ""
read -r -p "Aplicar? [s/N] " RESP
case "$RESP" in
  s|S|sim|SIM) ;;
  *) echo "Cancelado. Nada foi alterado."; exit 0 ;;
esac

docker cp "$MIG" "$CONTAINER:/tmp/marco.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/marco.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
          VALUES (${VERSION}, NOW()) ON CONFLICT DO NOTHING;"

echo ""
echo "── DEPOIS ──"
echo "Sujos restantes (tem de ser 0):"
$PSQL -c "SELECT count(*) AS ainda_sujos FROM public.activities
           WHERE is_milestone = true
             AND (COALESCE(btrim(assigned_to), '') <> ''
               OR COALESCE(gravity,0) > 0 OR COALESCE(urgency,0) > 0
               OR COALESCE(tendency,0) > 0 OR COALESCE(priority_score,0) > 0);"

echo "Guardado na sombra:"
$PSQL -c "SELECT count(*) AS linhas_recuperaveis FROM public.activities
           WHERE marco_limpeza_backup IS NOT NULL;"

echo "As duas travas:"
$PSQL -c "SELECT conname FROM pg_constraint
           WHERE conname IN ('marco_sem_responsavel','marco_sem_gut');"

echo ""
echo "concluido"
