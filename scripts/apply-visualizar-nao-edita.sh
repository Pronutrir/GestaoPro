#!/bin/bash
set -e
# ============================================================================
# "VISUALIZAR E COMENTAR" PASSA A BARRAR DE VERDADE
#
# `project_members.can_edit_own` existe desde 20260818170000 e a tela grava o
# valor certo — mas ninguém lê a coluna: nem o front, nem a RLS. Por isso os
# dois papéis mais baixos são hoje indistinguíveis:
#
#   Editar apenas as minhas → as 4 colunas false, can_edit_own = TRUE
#   Visualizar e comentar   → as 4 colunas false, can_edit_own = FALSE
#
# Depois desta migration, quem é membro com `can_edit_own = false` deixa de
# editar até as atividades em que é responsável — que é o que o nome do papel
# sempre prometeu.
#
# MEDIDO EM 25/08/2026, no banco de producao:
#   95 membros de projeto; 7 com as 4 colunas de escrita em false; ZERO com
#   can_edit_own = false. Ou seja: NINGUEM perde acesso hoje. A regra passa a
#   valer daqui pra frente, quando alguem escolher "Visualizar e comentar".
#
# ATENÇÃO: esta é a única migration recente que TIRA acesso de alguém. A sonda
# "ANTES" abaixo mostra exatamente quem, e em quantas atividades. Leia antes de
# confirmar.
#
# Idempotente: CREATE OR REPLACE. Rodar duas vezes não faz nada na segunda.
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-visualizar-nao-edita.sh
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
echo "1) Quantos membros estão em cada configuração:"
$PSQL -c "SELECT
            CASE
              WHEN can_edit OR can_move OR can_create OR can_delete THEN 'edita pela equipe (nao afetado)'
              WHEN COALESCE(can_edit_own, true) THEN 'Editar apenas as minhas (nao afetado)'
              ELSE 'Visualizar e comentar (AFETADO)'
            END AS papel,
            count(*)
          FROM public.project_members
          GROUP BY 1 ORDER BY 2 DESC;"

echo ""
echo "2) QUEM perde acesso, e em quantas atividades:"
echo "   (membro com can_edit_own=false que hoje edita algo pela via do vinculo)"
$PSQL -c "SELECT
            COALESCE(pr.full_name, pm.user_id::text) AS pessoa,
            p.title  AS projeto,
            count(a.id) AS atividades_que_perde
          FROM public.project_members pm
          JOIN public.projects p ON p.id = pm.project_id AND p.is_trashed = false
          LEFT JOIN public.profiles pr ON pr.id = pm.user_id
          JOIN public.activities a
            ON a.project_id = pm.project_id
           AND a.is_trashed = false
           AND public.is_activity_actor_v2(a.id, pm.user_id)
          WHERE pm.can_edit_own = false
            AND NOT (pm.can_edit OR pm.can_move OR pm.can_create OR pm.can_delete)
          GROUP BY 1,2
          ORDER BY 3 DESC;"

echo ""
echo "   Se a lista acima estiver VAZIA, nenhuma pessoa perde acesso hoje —"
echo "   a regra so passa a valer daqui pra frente."
echo ""
read -r -p "Aplicar a migration? [s/N] " RESP
case "$RESP" in
  s|S|sim|SIM) ;;
  *) echo "Cancelado. Nada foi alterado."; exit 0 ;;
esac

run 20260825150000 "supabase/migrations/20260825150000_visualizar_nao_edita_nem_as_dela.sql" \
  "can_update_activity_v2 passa a respeitar can_edit_own"

echo ""
echo "── DEPOIS ──"
$PSQL -c "SELECT CASE
             WHEN pg_get_functiondef(p.oid) LIKE '%can_edit_own%' THEN 'OK — a funcao le a coluna'
             ELSE 'FALHOU — ainda ignora'
           END AS estado
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='can_update_activity_v2';"
echo ""
echo "✓ concluído"
