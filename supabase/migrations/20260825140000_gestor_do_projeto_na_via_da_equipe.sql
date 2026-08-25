-- O GESTOR DO PROJETO NAO ERA RECONHECIDO PELA VIA DA EQUIPE.
--
-- `can_member_action` e a funcao que autoriza pela permissao da equipe. Ela e
-- chamada por `can_create_activity_v2`, `can_update_activity_v2` e pela policy
-- de DELETE de `activities` -- ou seja, esta no caminho de toda escrita.
--
-- Ela chamava `public.is_project_leader` -- a versao LEGADA, de 13/05, que
-- compara apenas `projects.owner` com o nome do perfil. O campo
-- `projects.manager` (Gestor do Projeto) nasceu depois, em 20260729140000, e
-- so foi ensinado a `is_project_leader_v2`.
--
-- O efeito: quem e Gestor do Projeto sem ser o dono passava pelas OUTRAS vias
-- (que ja usam `_v2`) mas nao por esta. Como as policies somam por OR, a falha
-- so aparecia onde esta via era a unica que poderia conceder -- notadamente no
-- DELETE de atividade, cuja policy e:
--
--   is_admin_user_v2  OR  is_project_leader_v2  OR  can_member_action(...)
--
-- Ali o `_v2` do meio salvava o gestor. Mas em qualquer chamada futura de
-- `can_member_action` fora desse trio, o gestor seria recusado -- e a tela,
-- que usa `podeGerenciarProjeto` (owner OU manager OU admin), diria que pode.
--
-- Trocar pela `_v2` alinha as duas pontas e elimina a divergencia latente.
-- Nada mais no corpo muda.
--
-- IDEMPOTENTE: CREATE OR REPLACE; rodar duas vezes nao faz nada na segunda.

CREATE OR REPLACE FUNCTION public.can_member_action(_project_id uuid, _user_id uuid, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user_id IS NOT NULL
    AND (
      public.has_role(_user_id, 'admin'::app_role)
      -- ERA `is_project_leader` (legada, so conhece owner).
      OR public.is_project_leader_v2(_project_id, _user_id)
      OR EXISTS (
        SELECT 1
        FROM public.project_members pm
        WHERE pm.project_id = _project_id
          AND pm.user_id = _user_id
          AND COALESCE(pm.invitation_status, 'accepted') = 'accepted'
          AND COALESCE(pm.access_level, 'contributor') = 'contributor'
          AND CASE _action
            WHEN 'create' THEN COALESCE(pm.can_create, false)
            WHEN 'edit' THEN COALESCE(pm.can_edit, false)
            WHEN 'delete' THEN COALESCE(pm.can_delete, false)
            WHEN 'move' THEN COALESCE(pm.can_move, false)
            ELSE false
          END
      )
    );
$$;

-- Verificacao: falha alto se a funcao nao ficou de pe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'can_member_action'
  ) THEN
    RAISE EXCEPTION 'can_member_action nao existe apos a migration';
  END IF;

  -- O corpo novo tem de citar a _v2, nao a legada.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'can_member_action'
      AND pg_get_functiondef(p.oid) LIKE '%is_project_leader_v2%'
  ) THEN
    RAISE EXCEPTION 'can_member_action ainda aponta para a versao legada';
  END IF;
END $$;
