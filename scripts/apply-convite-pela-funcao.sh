#!/bin/bash
set -e
# "Projeto criado com aviso: new row violates row-level security policy for
# table notifications"
#
# O convidado entra em `project_members` como 'pending', e a politica de
# INSERT de `notifications` exige membro ACEITO (is_project_member_v2). No
# instante do convite ele ainda nao e membro aos olhos da politica, e a linha
# e recusada -- em TODO projeto criado com equipe.
#
# A funcao nova valida QUEM CONVIDA (can_manage_project_v2) em vez de quem e
# convidado. A politica da tabela NAO muda: escrita direta continua exigindo
# membro aceito.
#
# Aditiva e idempotente. Nao altera dado nenhum -- so cria a funcao.
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-convite-pela-funcao.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260820160000_convite_nasce_pela_funcao.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260820160000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES: convidados sem o convite que os deixaria aceitar ──"
$PSQL -c "
SELECT count(*) AS pendentes_sem_convite
  FROM public.project_members pm
 WHERE COALESCE(pm.invitation_status,'accepted') = 'pending'
   AND NOT EXISTS (
     SELECT 1 FROM public.notifications n
      WHERE n.project_id = pm.project_id
        AND n.target_user_id = pm.user_id
        AND n.type = 'project_invite');"

echo "── A politica de INSERT em notifications (nao deve mudar) ──"
$PSQL -c "
SELECT policyname, cmd, coalesce(with_check,'-') AS with_check
  FROM pg_policies
 WHERE schemaname='public' AND tablename='notifications' AND cmd='INSERT';"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/convite_pela_funcao.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/convite_pela_funcao.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS: a funcao existe e so 'authenticated' executa? ──"
$PSQL -c "
SELECT p.proname,
       p.prosecdef AS security_definer,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executa,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_executa
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname='enviar_convites_do_projeto';"

echo
echo "Os convidados que ficaram sem convite (contagem ANTES) nao sao"
echo "reenviados automaticamente: reabra o projeto e salve a equipe, ou remova"
echo "e adicione a pessoa de novo. O reenvio nao duplica -- a funcao pula quem"
echo "ja tem convite em aberto."
