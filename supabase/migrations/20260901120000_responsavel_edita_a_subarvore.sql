-- O RESPONSÁVEL EDITA A SUBÁRVORE (01/09/2026)
--
-- ============================================================================
-- A DECISÃO (do dono do produto, 01/09/2026)
--
-- Quem é RESPONSÁVEL de uma atividade passa a poder editar aquela atividade E
-- TODA A SUBÁRVORE abaixo dela, e incluir/trocar participantes e responsáveis
-- nas descendentes. Quem é só PARTICIPANTE não ganha nada disso — segue
-- execução na própria atividade.
--
-- Isto REVERTE, DE PROPÓSITO, a decisão de 31/08/2026 que limitava o poder de
-- atribuir ao pai DIRETO ("NÃO ALARGA PARA A ÁRVORE INTEIRA", em
-- lib/activityAccess.ts). O dono do produto pediu o contrário, explicitamente.
-- O espelho no cliente (activityAccess.ts) e a matriz dos 108 casos são
-- atualizados no mesmo lote — a RLS é a fonte da verdade (CLAUDE.md).
--
-- ============================================================================
-- O QUE NÃO MUDA (as fronteiras que continuam de pé)
--
--   - canDelete: segue admin / líder / can_member_action('delete'). O
--     responsável edita, não exclui. A policy de DELETE não é tocada aqui.
--   - canManageTeam: incluir alguém NÃO cria linha em project_members. A pessoa
--     incluída ganha acesso ESCOPADO — a atividade e a subárvore, via
--     activity_assignees + a policy de leitura do P00. Nunca o projeto inteiro.
--     É a regra inviolável do CLAUDE.md: atribuir não concede acesso ao projeto.
--   - "Visualizar e comentar" (can_edit_own=false) continua barrando: a nova via
--     fica sob o mesmo teto que a via do ator.
--
-- ============================================================================
-- POR QUE O P00 É PRÉ-REQUISITO (o interlock abaixo)
--
-- Sem o P00 (20260826150000) ativo, a policy de SELECT de `activities` ainda é
-- `can_view_project_work_v2`, que concede o PROJETO INTEIRO a quem tem qualquer
-- atividade nele. Aí a pessoa recém-incluída (que vira `assigned_to`/
-- `participants` por sincronia da fase 05) enxergaria as IRMÃS — o oposto de
-- "escopado". Esta migration RECUSA rodar se o P00 não estiver aplicado.
--
-- ROLLBACK: 20260901120001_responsavel_edita_a_subarvore_rollback.sql
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 0) INTERLOCK: o P00 tem de estar ativo. Sem ele, escopado vaza o projeto.
-- ───────────────────────────────────────────────────────────────────────────
DO $interlock$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'activities'
       AND policyname = 'Activities access v2 read'
       AND qual LIKE '%pode_ler_atividade_v2%'
  ) THEN
    RAISE EXCEPTION
      'P00 (20260826150000) NAO esta ativa: a policy de SELECT de activities ainda nao usa pode_ler_atividade_v2. Aplique o P00 ANTES -- sem ele, o assignee escopado ganha leitura do projeto inteiro.';
  END IF;

  -- A subárvore-de-leitura tem de existir (fase 02): reusamos o mesmo padrão.
  IF to_regprocedure('public.eh_descendente_de_atividade_do_ator(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'eh_descendente_de_atividade_do_ator ausente -- aplique a fase 02 (20260826120000) antes.';
  END IF;

  -- Não regredir o invariante do 20260825150000.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'can_update_activity_v2'
       AND pg_get_functiondef(p.oid) LIKE '%can_edit_own%'
  ) THEN
    RAISE EXCEPTION 'can_update_activity_v2 nao le can_edit_own -- estado inesperado, abortando.';
  END IF;
END $interlock$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) O nó é do responsável? — irmã de is_activity_actor_v2, mas SÓ responsável.
--
-- Distingue responsável de participante:
--   - via tabela: activity_assignees com papel = 'responsavel';
--   - via legada: SÓ a coluna `assigned_to` (o responsável), NUNCA `participants`.
-- Mesma trava de homônimo (nome_e_ambiguo) de is_activity_actor_v2: um xará não
-- herda a subárvore.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.eh_responsavel_da_atividade_v2(_activity_id uuid, _user_id uuid)
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
        -- VIA TABELA (identificador, FK) -- só papel='responsavel'
        EXISTS (
          SELECT 1 FROM public.activity_assignees aa
           WHERE aa.activity_id = a.id
             AND aa.user_id = _user_id
             AND aa.papel = 'responsavel'
        )
        -- VIA LEGADA -- SÓ assigned_to, NUNCA participants
        OR (a.assigned_to IS NOT NULL AND (
          -- uuid em texto: identificador
          lower(trim(a.assigned_to)) = lower(trim(_user_id::text))
          -- email: único por definição
          OR (au.email IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(au.email)))
          -- nome: só quando NÃO for ambíguo
          OR (
            pr.full_name IS NOT NULL
            AND lower(trim(a.assigned_to)) = lower(trim(pr.full_name))
            AND NOT public.nome_e_ambiguo(a.assigned_to)
          )
        ))
      )
  );
$$;

COMMENT ON FUNCTION public.eh_responsavel_da_atividade_v2(uuid, uuid) IS
  'true se o usuario e RESPONSAVEL da atividade (activity_assignees papel=responsavel, ou a coluna legada assigned_to -- nunca participants). Mesma trava de homonimo de is_activity_actor_v2.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) A atividade é descendente de uma que o usuário RESPONDE? (sobe a árvore)
--
-- Clone exato de eh_descendente_de_atividade_do_ator, trocando só o predicado
-- por nó: responsável em vez de ator qualquer. Mesma guarda de ciclo (nivel<20).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.eh_descendente_de_atividade_do_responsavel(_activity_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE subindo AS (
    SELECT a.id, a.parent_id, 0 AS nivel
      FROM public.activities a
     WHERE a.id = _activity_id
    UNION ALL
    SELECT p.id, p.parent_id, s.nivel + 1
      FROM public.activities p
      JOIN subindo s ON p.id = s.parent_id
     WHERE s.nivel < 20
  )
  SELECT EXISTS (
    SELECT 1 FROM subindo s
     WHERE public.eh_responsavel_da_atividade_v2(s.id, _user_id)
  );
$$;

COMMENT ON FUNCTION public.eh_descendente_de_atividade_do_responsavel(uuid, uuid) IS
  'A atividade e ela mesma, ou descendente de alguma em que o usuario e RESPONSAVEL. Da EDICAO da subarvore a quem responde por um ancestral. Irma de eh_descendente_de_atividade_do_ator (que da LEITURA a qualquer ator).';

-- ───────────────────────────────────────────────────────────────────────────
-- 3) can_update_activity_v2 -- soma a via da subárvore do responsável
--
-- Nova via por ÚLTIMO no OR: admin/líder/equipe/ator resolvem antes no caso
-- comum, e a recursão só roda quando nenhum deles bastou. Fica sob o mesmo teto
-- can_edit_own da via do ator: "Visualizar e comentar" continua sem editar.
-- ───────────────────────────────────────────────────────────────────────────
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
        -- NIVEL TAREFA / SUBARVORE: ator da propria atividade OU responsavel de
        -- um ancestral. Ambos sob o teto "Visualizar e comentar".
        OR (
          (
            public.is_activity_actor_v2(a.id, _user_id)
            OR public.eh_descendente_de_atividade_do_responsavel(a.id, _user_id)
          )
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
  'Admin, lider/gestor, equipe com can_edit/can_move, quem responde pela atividade, ou o RESPONSAVEL de um ancestral (subarvore) -- exceto membro com can_edit_own=false. Espelha capacidadesNaAtividade em lib/activityAccess.ts.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4) A policy de UPDATE -- a nova via entra no USING (pela função) e no WITH CHECK
--
-- Mesmo buraco estreito e deliberado da via do ator (consulta por ID, enxerga a
-- linha ANTIGA, não valida o destino de um move) -- e nenhuma tela edita
-- project_id. As vias de líder/equipe no WITH CHECK seguem barrando o membro
-- comum de mover para um projeto que não alcança.
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Activities access v2 update" ON public.activities;
CREATE POLICY "Activities access v2 update" ON public.activities
FOR UPDATE TO authenticated
USING (public.can_update_activity_v2(id, auth.uid()))
WITH CHECK (
  public.is_admin_user_v2(auth.uid())
  OR public.is_project_leader_v2(project_id, auth.uid())
  OR public.can_member_action(project_id, auth.uid(), 'edit')
  OR public.can_member_action(project_id, auth.uid(), 'move')
  OR public.is_activity_actor_v2(id, auth.uid())
  OR public.eh_descendente_de_atividade_do_responsavel(id, auth.uid())
);

-- ───────────────────────────────────────────────────────────────────────────
-- 5) O gatilho que exigia equipe SAI
--
-- tg_assignee_exige_equipe barrava assignee de quem não estava na equipe. Era o
-- stand-in do P00 antes de ele existir; com o P00 ativo (interlock acima) ele é
-- redundante E impede justamente o caso desejado — o assignee ESCOPADO. Quem
-- pode inserir segue gateado pela RLS de escrita de activity_assignees
-- (= can_update_activity_v2 da atividade), que agora inclui o responsável do
-- ancestral. E incluir NÃO cria project_members: a inclusão na EQUIPE continua
-- só por incluir_e_atribuir (SECURITY DEFINER, gestor).
-- ───────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_assignee_exige_equipe ON public.activity_assignees;
DROP FUNCTION IF EXISTS public.tg_assignee_exige_equipe();

-- ───────────────────────────────────────────────────────────────────────────
-- Verificação estrutural
-- ───────────────────────────────────────────────────────────────────────────
DO $verif$
BEGIN
  -- As duas funções novas existem, STABLE e SECURITY DEFINER.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='eh_responsavel_da_atividade_v2'
       AND p.provolatile='s' AND p.prosecdef
  ) THEN RAISE EXCEPTION 'eh_responsavel_da_atividade_v2 ausente/errada'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='eh_descendente_de_atividade_do_responsavel'
       AND p.provolatile='s' AND p.prosecdef
  ) THEN RAISE EXCEPTION 'eh_descendente_de_atividade_do_responsavel ausente/errada'; END IF;

  -- eh_responsavel NÃO pode olhar `participants` (senão participante viraria
  -- responsável) e DEVE ter a trava de homônimo.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='eh_responsavel_da_atividade_v2'
       AND pg_get_functiondef(p.oid) LIKE '%participants%'
  ) THEN RAISE EXCEPTION 'eh_responsavel_da_atividade_v2 nao pode ler participants'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='eh_responsavel_da_atividade_v2'
       AND pg_get_functiondef(p.oid) LIKE '%nome_e_ambiguo%'
  ) THEN RAISE EXCEPTION 'eh_responsavel_da_atividade_v2 sem a trava de homonimo'; END IF;

  -- can_update passou a citar a nova via E continua lendo can_edit_own.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='can_update_activity_v2'
       AND pg_get_functiondef(p.oid) LIKE '%eh_descendente_de_atividade_do_responsavel%'
       AND pg_get_functiondef(p.oid) LIKE '%can_edit_own%'
  ) THEN RAISE EXCEPTION 'can_update_activity_v2 nao ganhou a via da subarvore, ou perdeu can_edit_own'; END IF;

  -- is_activity_actor_v2 segue SEM can_edit_own (invariante do CLAUDE.md).
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='is_activity_actor_v2'
       AND pg_get_functiondef(p.oid) LIKE '%can_edit_own%'
  ) THEN RAISE EXCEPTION 'is_activity_actor_v2 nao deve conhecer can_edit_own'; END IF;

  -- Uma só policy de UPDATE, e ela cita a nova via.
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='activities' AND cmd IN ('UPDATE','ALL')) <> 1 THEN
    RAISE EXCEPTION 'esperava exatamente 1 policy de UPDATE em activities';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='activities' AND policyname='Activities access v2 update'
       AND with_check LIKE '%eh_descendente_de_atividade_do_responsavel%'
  ) THEN RAISE EXCEPTION 'a policy de UPDATE nao ganhou a nova via no WITH CHECK'; END IF;

  -- O gatilho saiu.
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_assignee_exige_equipe') THEN
    RAISE EXCEPTION 'trg_assignee_exige_equipe ainda existe';
  END IF;

  -- DELETE NÃO ganhou a via do responsável (canDelete não segue o ator).
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='activities' AND cmd='DELETE'
       AND (qual LIKE '%eh_descendente_de_atividade_do_responsavel%' OR qual LIKE '%is_activity_actor%')
  ) THEN RAISE EXCEPTION 'a policy de DELETE nao pode seguir a via do responsavel/ator'; END IF;

  RAISE NOTICE 'responsavel edita a subarvore: no ar. Atualize o espelho (activityAccess.ts) e a matriz.';
END $verif$;

NOTIFY pgrst, 'reload schema';
