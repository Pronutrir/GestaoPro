-- P00 -- O ESCOPO DE LEITURA PASSA A VALER NA POLICY
--
-- ============================================================================
-- O FURO
--
-- `Activities access v2 read` usa `can_view_project_work_v2`, cujo segundo
-- braço é `tem_atividade_no_projeto_v2`. Esse braço responde "esta pessoa tem
-- ALGUMA atividade neste projeto?" -- e, sendo verdadeiro, libera TODAS as
-- atividades do projeto.
--
-- Quem entra só por atribuição enxerga as irmãs. Dentro do projeto isso ficava
-- disfarçado porque `isActivityScoped` zera as quatro permissões de escrita --
-- a restrição sempre foi de EDIÇÃO, nunca de leitura. Pela lista global
-- (Pendências, Cronograma global, Visão Geral) aparece sem disfarce.
--
-- A tela de Pendências seleciona `activities` sem filtro, confiando na RLS.
-- Isso está CERTO. A porta é a policy; a tela é a maçaneta.
-- ============================================================================
--
-- O QUE MUDA, E O QUE NÃO MUDA
--
--   equipe, líder, gestor, admin  -> o projeto inteiro (IGUAL A HOJE)
--   só por atribuição             -> a própria atividade e a SUBÁRVORE dela
--   a trilha de ancestrais        -> pela view activity_breadcrumb
--   a dependência que bloqueia    -> pela view activity_dependency_card
--
-- SÓ `activities` é apertada. As outras três policies criadas em
-- 20260818150000 (`projects`, `phases`, `project_members`) continuam como
-- estão, de propósito:
--
--   - `projects`: sem a linha do projeto, a pessoa não abre a tela. O nome do
--     projeto não é o segredo -- as atividades das outras pessoas é que são.
--   - `phases`: a fase é o contêiner da trilha. Fechá-la faria o agrupamento
--     sumir junto.
--   - `project_members`: quem trabalha precisa saber a quem pedir acesso.
--
-- Apertar as quatro de uma vez seria trocar um vazamento por uma tela vazia.
--
-- ============================================================================
-- ANTES DE APLICAR: A SONDA
--
-- Esta é a única migration desta revisão que TIRA LEITURA de quem trabalha, e
-- o sintoma é imediato -- a pessoa abre a tela e o item sumiu.
--
-- `scripts/apply-p00-escopo-de-leitura.sh` roda a sonda e exige confirmação. A
-- pergunta que decide não é "quantas atividades cada uma deixa de ver", é
-- "quantas dessas ela ABRIU nos últimos 90 dias". Sem essa segunda, o número
-- grande trava a decisão sem informá-la.
-- ============================================================================
--
-- DEPENDE de 20260826120000 (fase 02), que cria
-- `eh_descendente_de_atividade_do_ator` e as duas views. A verificação abaixo
-- falha alto se ela não estiver aplicada.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) A função de escopo
--
-- Separada da policy porque as telas precisam fazer a MESMA pergunta -- e uma
-- segunda cópia da regra é como as duas metades divergem. Ver o que aconteceu
-- com `canMutateActivity`, que existiu em duas versões diferentes por meses.
-- ───────────────────────────────────────────────────────────────────────────
/*
 * ATENÇÃO -- NÃO USE `can_view_project_v2` AQUI.
 *
 * O nome sugere "pertence ao projeto", mas o corpo dela (20260513250000:17-41)
 * tem o MESMO braço de atribuição: quem é criador, responsável ou participante
 * de qualquer atividade recebe `true`. Usá-la aqui reproduziria exatamente o
 * furo que esta migration existe para fechar -- a policy pareceria apertada e
 * continuaria liberando o projeto inteiro.
 *
 * Conferido em 26/08/2026, e é a razão de esta função testar o VÍNCULO FORMAL
 * peça por peça em vez de reaproveitar a que já existia.
 *
 * `can_view_project_work_v2` tem o mesmo problema, amplificado -- ela é
 * literalmente `can_view_project_v2 OR tem_atividade_no_projeto_v2`.
 */
CREATE OR REPLACE FUNCTION public.pode_ler_atividade_v2(_activity_id uuid, _user_id uuid)
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
        -- ── acesso AMPLO: pertence ao projeto ───────────────────────────
        public.is_admin_user_v2(_user_id)
        -- líder ou gestor (owner/manager, comparação por nome)
        OR public.is_project_leader_v2(a.project_id, _user_id)
        -- membro da equipe, com linha em project_members
        OR public.is_project_member_v2(a.project_id, _user_id)
        -- criador do projeto: `can_manage_project_v2` já o reconhece, e sem
        -- isto quem criou perderia o próprio projeto ao não estar na equipe
        OR EXISTS (
          SELECT 1 FROM public.projects p
           WHERE p.id = a.project_id AND p.created_by = _user_id
        )
        -- ── acesso ESTREITO: a atividade e a subárvore dela ─────────────
        OR public.eh_descendente_de_atividade_do_ator(a.id, _user_id)
      )
  );
$$;

COMMENT ON FUNCTION public.pode_ler_atividade_v2(uuid, uuid) IS
  'Escopo de LEITURA de uma atividade: projeto inteiro para quem pertence a ele; a atividade e a subarvore para quem entra so por atribuicao. A trilha de ancestrais vem por activity_breadcrumb, nao por aqui.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) A policy
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Activities access v2 read" ON public.activities;
CREATE POLICY "Activities access v2 read" ON public.activities
FOR SELECT TO authenticated
USING (public.pode_ler_atividade_v2(id, auth.uid()));

-- ───────────────────────────────────────────────────────────────────────────
-- Verificação
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_invoker boolean;
BEGIN
  -- A fase 02 tem de estar aplicada: sem ela não há função de subárvore nem
  -- as views, e a policy nova cortaria a trilha junto com as irmãs.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='eh_descendente_de_atividade_do_ator'
  ) THEN
    RAISE EXCEPTION 'aplique 20260826120000 (fase 02) ANTES desta -- ela cria a funcao de subarvore e as views de trilha';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='activity_breadcrumb') THEN
    RAISE EXCEPTION 'activity_breadcrumb nao existe -- sem ela a trilha some junto com as irmas';
  END IF;

  /*
   * E a breadcrumb NÃO pode ser `security_invoker`.
   *
   * Com invoker ela roda sob a policy que esta migration acabou de apertar --
   * e fecha junto. O sintoma não seria "sumiu um item da lista": seria "a tela
   * da atividade abriu sem cabeçalho", que ninguém relaciona a uma mudança de
   * policy.
   */
  SELECT c.reloptions::text LIKE '%security_invoker=true%' INTO v_invoker
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND c.relname='activity_breadcrumb';

  IF COALESCE(v_invoker, false) THEN
    RAISE EXCEPTION 'activity_breadcrumb esta com security_invoker=true -- a trilha vai fechar junto com esta policy';
  END IF;

  -- As outras três policies de 20260818150000 continuam amplas, de propósito.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='projects' AND policyname='Project access v2 read'
  ) THEN
    RAISE EXCEPTION 'a policy de leitura de projects sumiu -- sem ela a pessoa nao abre a tela';
  END IF;

  /*
   * A ARMADILHA DO NOME.
   *
   * `can_view_project_v2` e `can_view_project_work_v2` PARECEM significar
   * "pertence ao projeto", mas as duas embutem o braço da atribuição. Se
   * alguém "simplificar" esta função trocando os quatro testes por uma delas,
   * a policy volta a liberar o projeto inteiro -- e pareceria correta.
   *
   * Foi a suposição errada que quase entrou nesta própria migration.
   */
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='pode_ler_atividade_v2'
       AND pg_get_functiondef(p.oid) LIKE '%can_view_project%'
  ) THEN
    RAISE EXCEPTION
      'pode_ler_atividade_v2 esta chamando can_view_project_v2/work_v2 -- as duas embutem o braco da atribuicao e reabrem o furo; ver o comentario acima da funcao';
  END IF;

  -- E a policy tem de estar usando a função nova.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='activities'
       AND policyname='Activities access v2 read'
       AND qual LIKE '%pode_ler_atividade_v2%'
  ) THEN
    RAISE EXCEPTION 'a policy de activities nao esta usando pode_ler_atividade_v2';
  END IF;
END $$;
