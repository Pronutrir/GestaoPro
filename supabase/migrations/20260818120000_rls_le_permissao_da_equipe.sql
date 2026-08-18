-- A RLS nao lia a permissao da equipe.
--
-- `can_update_activity_v2` aceitava admin, lider ou CRIADOR da atividade, e
-- depois ganhou o responsavel (20260526134500). Nunca consultou
-- `project_members.can_edit` -- a coluna que a tela de equipe mostra e que o
-- Kanban usa para decidir se desenha o botao.
--
-- O efeito medido em 18/08/2026, excluindo admins e lideres (que a RLS ja
-- libera): de 1.258 edicoes que a tela permite, o banco recusava 1.089 --
-- 86,6%, atingindo 7 pessoas. Guilherme e Williame tinham 144 atividades
-- assim cada um, so na Revitalizacao Tasy. A pessoa abria a atividade,
-- editava, clicava em salvar e levava erro.
--
-- Destravar 26 membros em 18/08 nao resolveu nada por isso: corrigiu o que a
-- tela mostra, enquanto o banco seguia recusando.
--
-- Duas vias entram aqui:
--
--   1. membro da equipe com can_edit (via `can_member_action`, que ja existe
--      e ja le a coluna certa -- so nao estava sendo chamada);
--   2. PARTICIPANTE da atividade, por `is_activity_actor_v2`, que cobre
--      criador + responsavel + participante e estava escrita desde 13/05,
--      sem ser usada desde 26/05.
--
-- Mercado: Jira exige `Browse Projects` mas o concede ao papel dinamico
-- "Current Assignee"; Asana da acesso a tarefa a quem e atribuido. O degrau
-- entre "membro pleno" e "sem acesso" e o que a via 2 representa.
--
-- UMA RESTRICAO NOVA, de proposito: `can_member_action` exige
-- `invitation_status = 'accepted'`, e a regra anterior nao exigia. Quem foi
-- convidado e ainda nao respondeu deixa de editar pela via da equipe --
-- continua editando o que e seu, pela via 2.
--
-- Hoje isso nao tira acesso de ninguem (dos 7 convites pendentes, nenhum tem
-- can_edit nem can_move), mas passa a importar: a partir da mudanca no
-- EditProjectDialog, membro novo nasce com permissao de Executar E fica
-- `pending` ate aceitar. O convite volta a significar alguma coisa.

-- `is_activity_actor_v2` comparava assigned_to so com nome e email. Na base
-- ha 73 atividades onde a coluna guarda o UUID do perfil -- essas pessoas nao
-- eram reconhecidas como responsaveis. O front ja resolvia isso
-- (isMineActivity traduz UUID -> nome); o banco, nao.
CREATE OR REPLACE FUNCTION public.is_activity_actor_v2(_activity_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activities a
    LEFT JOIN public.profiles pr ON pr.id = _user_id
    LEFT JOIN auth.users au ON au.id = _user_id
    WHERE a.id = _activity_id
      AND (
        a.created_by = _user_id
        OR (
          (a.assigned_to IS NOT NULL AND (
            lower(trim(a.assigned_to)) = lower(trim(_user_id::text))
            OR (pr.full_name IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(pr.full_name)))
            OR (au.email IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(au.email)))
          ))
          OR EXISTS (
            SELECT 1
            FROM unnest(COALESCE(a.participants, '{}'::text[])) participant_name
            WHERE (pr.full_name IS NOT NULL AND lower(trim(participant_name)) = lower(trim(pr.full_name)))
               OR (au.email IS NOT NULL AND lower(trim(participant_name)) = lower(trim(au.email)))
          )
        )
      )
  );
$$;

COMMENT ON FUNCTION public.is_activity_actor_v2(uuid, uuid) IS
  'Criador, responsavel (por UUID, nome ou email) ou participante da atividade.';

-- UPDATE: permissao no projeto OU vinculo com a atividade.
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
        -- NIVEL PROJETO: a equipe passa a ser lida.
        --
        -- `move` entra junto com `edit` porque mover um card no Kanban E um
        -- UPDATE de workflow_stage_id -- passa por esta mesma policy. O front
        -- libera com `canEdit || canMove` (ActivityKanban, canMutateActivity);
        -- checar so 'edit' aqui recriaria o defeito que esta migration corrige,
        -- na outra flag: o papel "Acompanhar" nao produz esse caso, mas quem
        -- ajustar as caixas uma a uma produz.
        OR public.can_member_action(a.project_id, _user_id, 'edit')
        OR public.can_member_action(a.project_id, _user_id, 'move')
        -- NIVEL TAREFA: criador, responsavel ou participante.
        OR public.is_activity_actor_v2(a.id, _user_id)
      )
  );
$$;

COMMENT ON FUNCTION public.can_update_activity_v2(uuid, uuid) IS
  'Admin, lider, equipe com can_edit ou can_move, ou quem responde pela atividade. Espelha canMutateActivity do Kanban.';

-- CREATE: mesma falha, no verbo de criar.
CREATE OR REPLACE FUNCTION public.can_create_activity_v2(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin_user_v2(_user_id)
    OR public.is_project_leader_v2(_project_id, _user_id)
    OR public.can_member_action(_project_id, _user_id, 'create');
$$;

COMMENT ON FUNCTION public.can_create_activity_v2(uuid, uuid) IS
  'Admin, lider ou membro da equipe com can_create.';

-- DUAS policies de UPDATE conviviam em `activities`: a "Activities access v2
-- update" (13/05) e a "Members can update activities" (05/08, aplicada). Como
-- policies do mesmo comando se somam por OR, o acesso real era a UNIAO das
-- duas -- e ler o codigo de uma so dava uma resposta errada sobre quem podia
-- editar. A de 05/08 sai: tudo o que ela concedia (can_member_action 'edit' e
-- responsavel/participante) esta contemplado acima, agora num lugar so.
--
-- Uma diferenca merece registro, porque NAO e consolidacao neutra: a
-- `is_activity_owner` de 05/08 excluia o criador de proposito ("autoria
-- continua sem dar permissao"). A `is_activity_actor_v2`, usada aqui, inclui
-- `created_by`. Isso e deliberado e alinha o banco ao front, que ja tratava
-- criador como dono (isMineActivity) desde antes -- a divergencia entre os
-- dois lados e que produzia o "posso na tela, nao posso no banco".
DROP POLICY IF EXISTS "Members can update activities" ON public.activities;

-- E ha uma TERCEIRA, que ninguem lembrava: "Members or activity actors can
-- update activities" (13/05, 20260513131231). Ela foi criada e NUNCA dropada
-- por migration nenhuma -- varri as 17 policies de `activities` ja criadas no
-- repositorio e e a unica nessa situacao. Enquanto existir, o acesso real e a
-- uniao de tres regras, e ler qualquer uma delas isolada da resposta errada
-- sobre quem pode editar. Tudo o que ela concede (can_member_action 'edit' e
-- ator da atividade) esta contemplado acima.
DROP POLICY IF EXISTS "Members or activity actors can update activities" ON public.activities;

-- A policy de UPDATE nao tinha WITH CHECK. Sem ele o Postgres reaplica o
-- USING a linha NOVA -- so que `can_update_activity_v2(id, ...)` consulta a
-- tabela POR ID e enxerga a linha antiga, nao a proposta. Resultado: quem
-- podia editar uma atividade podia move-la para OUTRO projeto, inclusive um
-- onde nao tem acesso nenhum, e a checagem nem olhava o destino.
--
-- O WITH CHECK abaixo olha o `project_id` NOVO diretamente (a coluna vem da
-- linha proposta, sem passar pela funcao), e exige acesso no destino. Quem
-- edita sem trocar de projeto -- o caso normal -- ja satisfaz isso pelo
-- proprio vinculo que o deixou entrar, incluindo o responsavel que nao esta
-- na equipe, coberto por `is_activity_actor_v2`.
DROP POLICY IF EXISTS "Activities access v2 update" ON public.activities;
CREATE POLICY "Activities access v2 update" ON public.activities
FOR UPDATE TO authenticated
USING (public.can_update_activity_v2(id, auth.uid()))
WITH CHECK (
  public.is_admin_user_v2(auth.uid())
  OR public.is_project_leader_v2(project_id, auth.uid())
  OR public.can_member_action(project_id, auth.uid(), 'edit')
  OR public.can_member_action(project_id, auth.uid(), 'move')
  -- Esta ultima via consulta por ID e enxerga a linha ANTIGA, entao nao
  -- valida o destino. E deliberado: sem ela, o responsavel que nao esta na
  -- equipe nao conseguiria salvar edicao nenhuma -- que e o caso que a
  -- migration existe para destravar. O buraco que sobra e estreito (mover
  -- para outro projeto continuando responsavel) e nao ha nenhuma tela que
  -- faca isso: `project_id` nao e editavel em lugar nenhum do app.
  OR public.is_activity_actor_v2(id, auth.uid())
);

-- DELETE: continua restrito a admin e lider, MAIS a equipe com can_delete --
-- que e justamente o que o papel "Coordenar" concede. Sem isto, marcar
-- Coordenar na tela nao produziria efeito nenhum.
-- Alem da v2, a VM tem a policy legada "Members can delete activities"
-- (can_member_action 'delete') que nunca foi dropada -- drift so visivel no
-- banco real. Enquanto existir, sobram DUAS policies de DELETE e a verificacao
-- abaixo falha. O consolidado v2 ja cobre o que ela concede (admin OR lider OR
-- can_member_action 'delete'), entao sai sem tirar acesso de ninguem.
DROP POLICY IF EXISTS "Members can delete activities" ON public.activities;
DROP POLICY IF EXISTS "Activities access v2 delete" ON public.activities;
CREATE POLICY "Activities access v2 delete" ON public.activities
FOR DELETE TO authenticated
USING (
  public.is_admin_user_v2(auth.uid())
  OR public.is_project_leader_v2(project_id, auth.uid())
  OR public.can_member_action(project_id, auth.uid(), 'delete')
);

-- `is_activity_owner` (05/08) fica sem nenhum chamador depois do DROP acima.
-- Sai junto: funcao de permissao orfa no schema e convite a ser chamada de
-- novo por engano, com regra diferente da que vale.
DROP FUNCTION IF EXISTS public.is_activity_owner(uuid, uuid);

-- Verificacao: falha alto se algo nao ficou de pe.
DO $$
DECLARE
  n_update int;
  n_delete int;
  quais_update text;
  quais_delete text;
BEGIN
  IF to_regprocedure('public.can_member_action(uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'can_member_action nao existe -- a via da equipe nao funcionaria';
  END IF;
  IF to_regprocedure('public.is_activity_actor_v2(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'is_activity_actor_v2 nao existe';
  END IF;

  -- UMA policy por comando: duas se somariam por OR e o acesso real deixaria
  -- de ser legivel em um lugar so.
  --
  -- `cmd = 'ALL'` entra na conta: uma policy FOR ALL tambem cobre UPDATE e
  -- somaria por OR sem aparecer num filtro que so olhasse 'UPDATE'.
  --
  -- Os nomes vao na mensagem porque a VM tem historico de migrations
  -- aplicadas fora de ordem: se sobrar uma policy inesperada, o erro precisa
  -- dizer QUAL, senao a migration falha sem diagnostico.
  SELECT count(*), string_agg(policyname, ', ' ORDER BY policyname)
    INTO n_update, quais_update
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'activities' AND cmd IN ('UPDATE', 'ALL');
  IF n_update <> 1 THEN
    RAISE EXCEPTION 'esperava 1 policy de UPDATE em activities, encontrei %: %',
      n_update, coalesce(quais_update, '(nenhuma)');
  END IF;

  SELECT count(*), string_agg(policyname, ', ' ORDER BY policyname)
    INTO n_delete, quais_delete
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'activities' AND cmd IN ('DELETE', 'ALL');
  IF n_delete <> 1 THEN
    RAISE EXCEPTION 'esperava 1 policy de DELETE em activities, encontrei %: %',
      n_delete, coalesce(quais_delete, '(nenhuma)');
  END IF;

  RAISE NOTICE 'OK: a equipe com can_edit e o participante passam a editar.';
END $$;
