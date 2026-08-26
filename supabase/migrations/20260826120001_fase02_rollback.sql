-- ROLLBACK DA FASE 02 -- NAO RODAR EM CONDICAO NORMAL.
--
-- Existe porque a fase 02 pede, e porque toda migration que mexe em RLS deve
-- ter caminho de volta escrito ANTES de ser aplicada -- nao improvisado no
-- meio de um incidente.
--
-- COMO RODAR: este arquivo NAO entra em schema_migrations e nao e aplicado
-- pelo script da fase 02. Para desfazer:
--
--   docker exec -i supabase-db-1 psql -U supabase_admin -d postgres \
--     -f /tmp/20260826120001_fase02_rollback.sql
--   DELETE FROM public.schema_migrations WHERE version = 20260826120000;
--
-- O QUE SE PERDE: as linhas de activity_assignees e activity_watchers criadas
-- DEPOIS do backfill. As colunas antigas (`assigned_to`, `participants`) nunca
-- foram tocadas pela fase 02, entao o estado anterior volta inteiro -- desde
-- que a fase 05 (que migra o front para a tabela) ainda NAO tenha rodado.
--
-- SE A FASE 05 JA RODOU, este rollback DESTROI dado: o front estaria gravando
-- so na tabela, e as colunas antigas estariam paradas no tempo. Neste caso,
-- exporte activity_assignees antes.

-- 1) Devolve is_activity_actor_v2 ao corpo de 20260818120000 (so as colunas).
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

-- 2) Some o que a fase 02 criou.
DROP VIEW IF EXISTS public.activity_dependency_card;
DROP VIEW IF EXISTS public.activity_breadcrumb;
DROP FUNCTION IF EXISTS public.eh_descendente_de_atividade_do_ator(uuid, uuid);
DROP TRIGGER IF EXISTS trg_assignee_exige_equipe ON public.activity_assignees;
DROP FUNCTION IF EXISTS public.tg_assignee_exige_equipe();
DROP TABLE IF EXISTS public.activity_watchers;
DROP TABLE IF EXISTS public.activity_assignees;

-- 3) Confere que can_edit_own sobreviveu -- ele e de OUTRA entrega
--    (20260825150000) e nao pode cair junto.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='can_update_activity_v2'
       AND pg_get_functiondef(p.oid) LIKE '%can_edit_own%'
  ) THEN
    RAISE EXCEPTION 'o rollback derrubou a leitura de can_edit_own -- reaplique 20260825150000';
  END IF;
END $$;
