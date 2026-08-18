#!/bin/bash
set -e
# ============================================================================
# A RLS PASSA A LER A PERMISSÃO DA EQUIPE  +  O RACI PARA DE NASCER "I"
#
# Duas migrations, conferidas na base em 18/08/2026.
#
# 1) 20260818120000 — a regra do banco ignorava `project_members.can_edit`.
#    Excluindo admins e líderes (que a RLS já libera): de 1.258 edições que a
#    tela permite, o banco recusava 1.089 — 86,6%, atingindo 7 pessoas. A
#    pessoa abria a atividade, editava, clicava em salvar e levava erro.
#
#    Isso também explica por que destravar 26 membros em 18/08 não teve efeito
#    prático: corrigiu o que a tela mostra, não o que o banco aceita.
#
# 2) 20260818130000 — `raci` tinha DEFAULT 'I'. Das 50 pessoas rotuladas
#    "Informado — só acompanha", 44 podiam mexer no projeto (34 delas com
#    permissão total, inclusive excluir).
#
# Ambas são idempotentes: rodar duas vezes não faz nada na segunda.
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-permissao-equipe-e-raci.sh
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
  # ON_ERROR_STOP: para no primeiro erro em vez de seguir com o banco meio
  # migrado, que é pior que não ter começado.
  $PSQL -v ON_ERROR_STOP=1 -f /tmp/mig.sql
  $PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
            VALUES (${version}, NOW()) ON CONFLICT DO NOTHING;"
  echo "  ✓ aplicada"
}

echo "── ANTES ──"
# As duas policies de UPDATE que convivem hoje (a de 13/05 e a de 05/08). Elas
# se somam por OR, então o acesso real é a união — e some ao fim deste script.
$PSQL -c "SELECT cmd, policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='activities'
             AND cmd IN ('UPDATE','DELETE') ORDER BY cmd, policyname;"
$PSQL -c "SELECT coalesce(raci,'(vazio)') AS raci, count(*)
            FROM public.project_members GROUP BY 1 ORDER BY 2 DESC;"

run 20260818120000 "supabase/migrations/20260818120000_rls_le_permissao_da_equipe.sql" \
  "RLS lê can_edit e reconhece o participante  ·  destrava 1.089 edições"

run 20260818130000 "supabase/migrations/20260818130000_raci_deixa_de_nascer_informado.sql" \
  "RACI sem DEFAULT 'I'  ·  o rótulo passa a significar escolha"

echo ""
echo "── DEPOIS ──"
# Uma policy por comando, e nenhum "I" sobrando.
$PSQL -c "SELECT cmd, policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='activities'
             AND cmd IN ('UPDATE','DELETE') ORDER BY cmd, policyname;"
$PSQL -c "SELECT coalesce(raci,'(vazio)') AS raci, count(*)
            FROM public.project_members GROUP BY 1 ORDER BY 2 DESC;"

# A prova do que a migration 1 se propõe: um membro com can_edit que NÃO é
# admin, NÃO é líder e NÃO tem vínculo com a atividade agora passa.
echo ""
echo "── PROVA: a equipe com can_edit passa a editar ──"
$PSQL -c "
WITH alvo AS (
  SELECT m.user_id, a.id AS activity_id
    FROM public.project_members m
    JOIN public.projects p ON p.id = m.project_id AND NOT p.is_trashed
    JOIN public.activities a ON a.project_id = p.id AND NOT a.is_trashed
   WHERE m.invitation_status = 'accepted' AND m.can_edit
     AND NOT public.is_admin_user_v2(m.user_id)
     AND NOT public.is_project_leader_v2(p.id, m.user_id)
     AND NOT public.is_activity_actor_v2(a.id, m.user_id)
   LIMIT 5
)
SELECT pr.full_name,
       public.can_update_activity_v2(alvo.activity_id, alvo.user_id) AS pode_editar
  FROM alvo JOIN public.profiles pr ON pr.id = alvo.user_id;"
echo ""
echo "  Esperado: pode_editar = t em todas as linhas."
echo "  (Se vier vazio, é porque não há mais ninguém nessa situação.)"
