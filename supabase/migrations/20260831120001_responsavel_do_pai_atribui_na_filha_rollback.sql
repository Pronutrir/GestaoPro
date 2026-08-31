-- ============================================================================
-- ROLLBACK de 20260831120000 — devolve can_update_activity_v2 as quatro vias
--
-- Restaura textualmente o corpo de 20260825150000. Nao e "tirar o OR": e voltar
-- a versao anterior inteira, para que nenhuma outra mudanca entre por engano.
--
-- A ORDEM IMPORTA: a funcao de UPDATE volta PRIMEIRO, e so depois a via e
-- removida. O inverso deixaria uma janela em que can_update_activity_v2 chama
-- uma funcao inexistente -- e ai NENHUM update de atividade passaria, em
-- nenhuma das cinco vias. Derrubar a escrita do sistema inteiro e pior que o
-- defeito que este rollback desfaz.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_update_activity_v2(_activity_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activities a
    WHERE a.id = _activity_id
      AND (
        public.is_admin_user_v2(_user_id)
        OR public.is_project_leader_v2(a.project_id, _user_id)
        OR public.can_member_action(a.project_id, _user_id, 'edit')
        OR public.can_member_action(a.project_id, _user_id, 'move')
        OR (
          public.is_activity_actor_v2(a.id, _user_id)
          AND NOT EXISTS (
            SELECT 1
            FROM public.project_members pm
            WHERE pm.project_id = a.project_id
              AND pm.user_id = _user_id
              AND pm.can_edit_own = false
          )
        )
      )
  );
$$;

COMMENT ON FUNCTION public.can_update_activity_v2(uuid, uuid) IS
  'Admin, lider/gestor, equipe com can_edit ou can_move, ou quem responde pela atividade -- exceto membro com can_edit_own=false ("Visualizar e comentar"). Espelha podeMutarAtividade em lib/activityAccess.ts.';

-- Agora sim, com a regra ja sem referencia a ela.
DROP FUNCTION IF EXISTS public.responde_pelo_pai_direto(uuid, uuid);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='can_update_activity_v2'
       AND pg_get_functiondef(p.oid) LIKE '%responde_pelo_pai_direto%'
  ) THEN
    RAISE EXCEPTION 'a regra de UPDATE ainda cita a via removida -- o rollback deixaria o sistema sem escrita';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='can_update_activity_v2'
       AND pg_get_functiondef(p.oid) LIKE '%can_edit_own%'
  ) THEN
    RAISE EXCEPTION 'o rollback perdeu a leitura de can_edit_own';
  END IF;

  RAISE NOTICE 'via do pai removida -- can_update_activity_v2 de volta as quatro vias';
END $$;

NOTIFY pgrst, 'reload schema';
