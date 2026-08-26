-- "VISUALIZAR E COMENTAR" PASSA A BARRAR DE VERDADE.
--
-- `project_members.can_edit_own` nasceu em 20260818170000 para poder dizer
-- "nao edita NEM as dela". Desde entao a tela GRAVA a coluna corretamente --
-- e ninguem a LE. Nem o front, nem esta funcao.
--
-- O efeito: os dois papeis mais baixos sao indistinguiveis na pratica.
--
--   Editar apenas as minhas -> can_create/edit/delete/move = false, can_edit_own = TRUE
--   Visualizar e comentar   -> can_create/edit/delete/move = false, can_edit_own = FALSE
--
-- As outras quatro colunas sao identicas nos dois. `can_edit_own` E a unica
-- diferenca -- e como ninguem a lia, escolher um ou outro no seletor dava
-- exatamente o mesmo comportamento: a pessoa caia na via do ator
-- (`is_activity_actor_v2`) e editava as atividades dela assim mesmo.
--
-- ONDE A REGRA ENTRA, E POR QUE NAO EM `is_activity_actor_v2`:
--
-- Seria mais curto por o teste dentro do helper, mas ele responde "esta
-- pessoa ATUA nesta atividade?" e e usado tambem por
-- `can_comment_activity_v2` e pelas policies de VISIBILIDADE. Gatear ali
-- tiraria o comentario e ate a leitura de quem e "Visualizar e comentar" --
-- o oposto do nome do papel. A regra e sobre ESCRITA, entao mora em
-- `can_update_activity_v2`.
--
-- QUEM PERDE ACESSO: so quem for membro com `can_edit_own = false`, ou seja,
-- quem foi posto em "Visualizar e comentar" DE PROPOSITO. Nao afeta:
--   - admin, lider, gestor (retornam true antes);
--   - equipe com can_edit/can_move (idem);
--   - quem NAO e membro e entra pelo vinculo com a atividade (a coluna e
--     permissao de MEMBRO; sem linha em project_members ela nao existe).
--
-- Espelha `podeMutarAtividade` em src/lib/activityAccess.ts, onde o mesmo
-- teste foi posto na mesma posicao -- depois de lider/equipe, antes do ator.
--
-- IDEMPOTENTE: CREATE OR REPLACE.

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
        -- NIVEL PROJETO: a equipe com can_edit ou can_move mexe em tudo.
        -- `can_edit_own` NAO e teto sobre estes: quem edita tudo, edita tudo.
        OR public.can_member_action(a.project_id, _user_id, 'edit')
        OR public.can_member_action(a.project_id, _user_id, 'move')
        -- NIVEL TAREFA: criador, responsavel ou participante -- SALVO se a
        -- pessoa for membro com can_edit_own = false ("Visualizar e comentar").
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

-- Verificacao: falha alto se o corpo novo nao citar a coluna.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'can_update_activity_v2'
      AND pg_get_functiondef(p.oid) LIKE '%can_edit_own%'
  ) THEN
    RAISE EXCEPTION 'can_update_activity_v2 nao passou a ler can_edit_own';
  END IF;

  -- O helper NAO pode ter sido gateado: ele serve visibilidade e comentario.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'is_activity_actor_v2'
      AND pg_get_functiondef(p.oid) LIKE '%can_edit_own%'
  ) THEN
    RAISE EXCEPTION 'is_activity_actor_v2 nao deve conhecer can_edit_own -- ver o cabecalho desta migration';
  END IF;
END $$;
