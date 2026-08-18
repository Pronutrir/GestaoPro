#!/bin/bash
set -e
# ============================================================================
# can_edit_own + RACI vai para o TAP + raci_role de atividade sai
#
# 1) `can_edit_own` — a escada de permissão tem quatro níveis, mas as colunas
#    só distinguiam três: "Editar apenas as minhas" e "Visualizar e comentar"
#    gravavam os mesmos quatro `false`. O gestor escolhia "Visualizar e
#    comentar", salvava, reabria e lia a outra opção. A coluna guarda a
#    intenção de quem escolheu. Entra com DEFAULT true: é o comportamento que
#    todo mundo já tem hoje, e ninguém é rebaixado por esta migration.
#
# 2) RACI passa a ser editado no TAP. A coluna NÃO muda de lugar — continua em
#    project_members. Medido em 18/08/2026: nenhum dos 43 projetos tinha um
#    "A" definido, e 44 das 50 marcações "I" vinham do default do banco. O
#    campo era preenchido longe de onde é usado, então não era preenchido.
#
# 3) `activities.raci_role` sai: segundo RACI, por atividade, criado em 15/03 e
#    nunca exposto em tela nenhuma. 48 linhas marcadas "A", invisíveis.
#    (`csc_tickets.raci_role` é outra tabela e NÃO é tocada.)
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-raci-no-tap.sh
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

MIG="supabase/migrations/20260818170000_can_edit_own_e_raci_no_tap.sql"
VERSION=20260818170000

if [ ! -f "$MIG" ]; then
  echo "ERRO: migration não encontrada: $MIG"
  exit 1
fi

echo "── ANTES: o RACI que existe hoje, e quantos 'A' ──"
$PSQL -c "
SELECT COALESCE(raci, '(sem papel)') AS raci, count(*) AS membros
  FROM public.project_members
 GROUP BY raci
 ORDER BY count(*) DESC;"

echo ""
echo "── ANTES: activities.raci_role (some nesta migration) ──"
$PSQL -c "
SELECT COALESCE(raci_role, '(nulo)') AS raci_role, count(*)
  FROM public.activities
 GROUP BY raci_role
 ORDER BY count(*) DESC;"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  can_edit_own · RACI no TAP · raci_role de atividade sai"
echo "══════════════════════════════════════════════════════════"
docker cp "$MIG" "$CONTAINER:/tmp/mig_raci_tap.sql"
# ON_ERROR_STOP: para no primeiro erro em vez de deixar o banco meio migrado.
$PSQL -v ON_ERROR_STOP=1 -f /tmp/mig_raci_tap.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
          VALUES (${VERSION}, NOW()) ON CONFLICT DO NOTHING;"
echo "  ✓ aplicada"

echo ""
echo "── DEPOIS: ninguém pode ter sido rebaixado ──"
# Esperado: 0. A coluna nasce true para todos.
$PSQL -c "
SELECT count(*) AS rebaixados_indevidamente
  FROM public.project_members
 WHERE can_edit_own = false;"

echo ""
echo "── DEPOIS: o RACI dos 5 'R' foi preservado? ──"
$PSQL -c "
SELECT COALESCE(raci, '(sem papel)') AS raci, count(*) AS membros
  FROM public.project_members
 GROUP BY raci
 ORDER BY count(*) DESC;"

echo ""
echo "── DEPOIS: activities.raci_role não existe mais ──"
$PSQL -c "
SELECT count(*) AS ainda_existe
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'activities'
   AND column_name = 'raci_role';"

echo ""
echo "── csc_tickets.raci_role NÃO foi tocada (deve ser 1) ──"
$PSQL -c "
SELECT count(*) AS preservada
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'csc_tickets'
   AND column_name = 'raci_role';"

echo ""
echo "  Esperado: rebaixados=0 · o RACI de project_members intacto"
echo "            activities.raci_role=0 · csc_tickets.raci_role=1"
