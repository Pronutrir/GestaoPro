-- O RESPONSÁVEL CRIA SUBATIVIDADE NA SUA SUBÁRVORE (04/09/2026)
--
-- ============================================================================
-- A DECISÃO (do dono do produto, 04/09/2026)
--
-- O papel de projeto "Editar apenas as minhas" (editar_minhas) promete: "Cria,
-- edita, move e exclui aquilo que está sob sua responsabilidade". A via do
-- responsável (20260901120000) já cobre EDITAR e MOVER a subárvore inteira.
-- CRIAR nunca foi coberto: `can_create_activity_v2` só conhece o projeto
-- (admin/líder/equipe com can_create), nunca pergunta pelo `parent_id` da
-- nova linha. Um responsável sem `can_create` de equipe não conseguia criar
-- subatividade dentro do próprio ramo, mesmo já podendo editar tudo nele.
--
-- Esta migration soma UMA via: responsável de um ancestral da nova linha (ou
-- da própria atividade, se `parent_id IS NULL` e ela mesma pertence à
-- subárvore de outro nó do responsável — não se aplica a raiz nova solta,
-- que continua exigindo `can_create` de projeto).
--
-- ============================================================================
-- O QUE NÃO MUDA
--
--   - Criar uma FASE/raiz nova (parent_id IS NULL) continua exigindo
--     can_create_activity_v2 de projeto — a via nova só cobre filha dentro de
--     uma subárvore que o usuário já responde.
--   - "Visualizar e comentar" (can_edit_own=false) continua sem criar: a nova
--     via fica sob o mesmo teto que a via do responsável em UPDATE.
--
-- PRÉ-REQUISITO: 20260901120000 (eh_descendente_de_atividade_do_responsavel).
-- ROLLBACK: reverter para a versão anterior de can_create_activity_v2 e da
-- policy de INSERT (ambas definidas em 20260818120000 / 20260513191500).
-- ============================================================================

DO $interlock$
BEGIN
  IF to_regprocedure('public.eh_descendente_de_atividade_do_responsavel(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'eh_descendente_de_atividade_do_responsavel ausente -- aplique 20260901120000 antes.';
  END IF;
END $interlock$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) can_create_activity_v2 ganha um parâmetro opcional _parent_id.
--
-- Mantém a assinatura de 2 argumentos como wrapper (compat com qualquer
-- chamador antigo) e cria a de 3 argumentos, que a policy passa a usar.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_create_activity_v2(_project_id uuid, _user_id uuid, _parent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin_user_v2(_user_id)
    OR public.is_project_leader_v2(_project_id, _user_id)
    OR public.can_member_action(_project_id, _user_id, 'create')
    -- NÍVEL TAREFA: responsável de um ancestral do parent_id informado. Sem
    -- parent_id (raiz nova) esta via não se aplica -- cai nas de cima.
    OR (
      _parent_id IS NOT NULL
      AND public.eh_descendente_de_atividade_do_responsavel(_parent_id, _user_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.project_members pm
        WHERE pm.project_id = _project_id
          AND pm.user_id = _user_id
          AND pm.can_edit_own = false
      )
    );
$$;

COMMENT ON FUNCTION public.can_create_activity_v2(uuid, uuid, uuid) IS
  'Admin, lider, membro com can_create, ou responsavel de um ancestral do parent_id (subarvore) -- exceto can_edit_own=false. Espelha capacidadesNaAtividade.canCreate em lib/activityAccess.ts.';

CREATE OR REPLACE FUNCTION public.can_create_activity_v2(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Wrapper de compatibilidade: sem parent_id, só as vias de projeto valem.
  SELECT public.can_create_activity_v2(_project_id, _user_id, NULL::uuid);
$$;

COMMENT ON FUNCTION public.can_create_activity_v2(uuid, uuid) IS
  'Wrapper sem parent_id -- so as vias de projeto (admin/lider/equipe). Use a versao de 3 argumentos para reconhecer a via do responsavel.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) A policy de INSERT passa a citar a versão de 3 argumentos, lendo o
--    parent_id da própria linha proposta.
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Activities access v2 insert" ON public.activities;
CREATE POLICY "Activities access v2 insert" ON public.activities
FOR INSERT TO authenticated
WITH CHECK (public.can_create_activity_v2(project_id, auth.uid(), parent_id));

-- ───────────────────────────────────────────────────────────────────────────
-- Verificação estrutural
-- ───────────────────────────────────────────────────────────────────────────
DO $verif$
BEGIN
  IF to_regprocedure('public.can_create_activity_v2(uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'can_create_activity_v2/3 nao foi criada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'can_create_activity_v2'
       AND pronargs = 3
       AND pg_get_functiondef(p.oid) LIKE '%eh_descendente_de_atividade_do_responsavel%'
  ) THEN
    RAISE EXCEPTION 'can_create_activity_v2/3 nao cita a via do responsavel';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'activities'
       AND policyname = 'Activities access v2 insert'
       -- Postgres normaliza auth.uid() -> uid() ao gravar a policy; o teste
       -- precisa bater com a forma normalizada, não com o texto do CREATE POLICY.
       AND with_check LIKE '%can_create_activity_v2(project_id, uid(), parent_id)%'
  ) THEN
    RAISE EXCEPTION 'policy de INSERT nao foi atualizada para a versao de 3 argumentos';
  END IF;

  RAISE NOTICE 'OK: responsavel de ancestral pode criar subatividade dentro da propria subarvore.';
END $verif$;
