-- Responsável e participante podem atualizar a PRÓPRIA atividade
--
-- O código já assumia isto. EditProjectDialog.tsx traz, desde a revisão da
-- equipe:
--
--   "Membros não têm mais distinção Leitor/Editor — permissões ficam zeradas;
--    a edição vem do papel de participante/responsável da atividade (RLS)."
--
-- A primeira metade foi feita: quem entra na equipe recebe can_create=true e
-- can_edit=false. A segunda nunca chegou ao banco — `can_member_action` continua
-- olhando só as flags. O resultado são 29 membros que podem CRIAR uma atividade
-- e não conseguem corrigir nem o próprio erro de digitação.
--
-- Esta migration termina o que ficou pela metade, no modelo que Asana usa: ser
-- responsável dá permissão sobre a própria tarefa, mesmo com acesso restrito ao
-- projeto. Quem executa precisa poder atualizar o que executa.
--
-- O que NÃO muda:
--   . autoria continua sem dar permissão. Nem Asana, Jira ou Monday fazem isso.
--     Atividade pertence ao projeto, não a quem a digitou — se o autor sai de
--     férias, o trabalho não pode travar.
--   . excluir e mover de coluna seguem restritos a quem gerencia.
--   . quem não é responsável nem participante continua sem editar.
--
-- Idempotente: CREATE OR REPLACE + DROP POLICY IF EXISTS.

-- `assigned_to` e `participants` são TEXT (uuid, e-mail ou nome digitado à
-- mão), então a comparação testa as três formas — mesma abordagem de
-- notification_recipient_user_ids.
CREATE OR REPLACE FUNCTION public.is_activity_owner(_activity_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH identidades AS (
    -- As formas pelas quais este usuário pode estar escrito num campo de texto.
    -- NULL de e-mail/nome é descartado pelo WHERE, e não vira string vazia:
    -- uma sentinela em branco casaria com assigned_to='' e daria permissão a
    -- todo mundo em atividade sem responsável.
    SELECT lower(_user_id::text) AS ident
    UNION
    SELECT lower(btrim(p.email)) FROM public.profiles p
     WHERE p.id = _user_id AND nullif(btrim(p.email), '') IS NOT NULL
    UNION
    SELECT lower(btrim(p.full_name)) FROM public.profiles p
     WHERE p.id = _user_id AND nullif(btrim(p.full_name), '') IS NOT NULL
  )
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.activities a
    WHERE a.id = _activity_id
      AND (
        -- responsável
        lower(btrim(a.assigned_to)) IN (SELECT ident FROM identidades)
        -- ou participante
        OR EXISTS (
          SELECT 1 FROM unnest(coalesce(a.participants, ARRAY[]::text[])) AS part
          WHERE lower(btrim(part)) IN (SELECT ident FROM identidades)
        )
      )
  );
$$;

COMMENT ON FUNCTION public.is_activity_owner(uuid, uuid) IS
  'Responsável ou participante da atividade. Dá direito de atualizá-la mesmo sem can_edit no projeto (modelo Asana). Autoria NÃO conta.';

-- A policy de UPDATE passa a aceitar as duas vias: permissão no projeto OU ser
-- responsável pela atividade. Sem o USING antigo, quem gerencia perderia acesso.
DROP POLICY IF EXISTS "Members can update activities" ON public.activities;
CREATE POLICY "Members can update activities" ON public.activities
  FOR UPDATE TO authenticated
  USING (
    public.can_member_action(project_id, auth.uid(), 'edit')
    OR public.is_activity_owner(id, auth.uid())
  );

-- Verificação: falha alto se a função não existir ou a policy sumir.
DO $$
BEGIN
  IF to_regprocedure('public.is_activity_owner(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'is_activity_owner nao foi criada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activities'
      AND policyname = 'Members can update activities'
  ) THEN
    RAISE EXCEPTION 'policy de UPDATE de activities nao existe';
  END IF;
  RAISE NOTICE 'OK: responsavel e participante podem atualizar a propria atividade.';
END $$;
