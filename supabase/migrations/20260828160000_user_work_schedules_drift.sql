-- ============================================================================
-- user_work_schedules — a tabela que o Cronograma consulta e NÃO EXISTIA
--
-- DRIFT. A tabela é criada pela migration 20260422143450 (junto de audit_log e
-- holidays) e recebe policies pela 20260422215547. Em produção, audit_log e
-- holidays existem, mas user_work_schedules NÃO — a 143450 rodou pela metade e a
-- 215547 (que só faz ALTER/POLICY numa tabela inexistente) teria falhado. O
-- resultado é o /rest/v1/user_work_schedules devolvendo 404 (PGRST205, tabela
-- não encontrada — não é RLS), e o calendário do Cronograma quebra.
--
-- Recria SÓ user_work_schedules (idempotente), com as policies FINAIS da 215547.
-- has_role(uuid,text) existe, então 'admin' sem cast resolve.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_work_schedules (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  weekly_hours jsonb NOT NULL DEFAULT '{"monday":8,"tuesday":8,"wednesday":8,"thursday":8,"friday":8,"saturday":0,"sunday":0}'::jsonb,
  vacation_periods jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_work_schedules ENABLE ROW LEVEL SECURITY;

-- Policies finais (da 20260422215547). DROP IF EXISTS torna re-rodável.
DROP POLICY IF EXISTS "Users manage own schedule" ON public.user_work_schedules;
DROP POLICY IF EXISTS "Admins manage all schedules" ON public.user_work_schedules;
DROP POLICY IF EXISTS "Read all schedules" ON public.user_work_schedules;
DROP POLICY IF EXISTS "Auth users read schedules" ON public.user_work_schedules;
DROP POLICY IF EXISTS "Users update own schedule" ON public.user_work_schedules;

CREATE POLICY "Read all schedules"
  ON public.user_work_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users manage own schedule"
  ON public.user_work_schedules FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins manage all schedules"
  ON public.user_work_schedules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DO $conf$
BEGIN
  IF to_regclass('public.user_work_schedules') IS NULL THEN
    RAISE EXCEPTION 'user_work_schedules não foi criada';
  END IF;
  RAISE NOTICE 'user_work_schedules no ar; o 404 do Cronograma some';
END $conf$;

NOTIFY pgrst, 'reload schema';
