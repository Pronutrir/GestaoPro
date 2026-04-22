-- ===========================================================
-- BLOCO 4: Log de Auditoria imutável
-- ===========================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  changed_by uuid,
  changed_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_record ON public.audit_log(table_name, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log(created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Imutável: apenas leitura para autenticados, ninguém atualiza/deleta
CREATE POLICY "Auth users can read audit_log" ON public.audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can insert audit_log" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);
-- Sem políticas de UPDATE/DELETE = imutável

-- Função genérica de auditoria
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_uid uuid;
  v_email text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NOT NULL THEN
    SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    INSERT INTO public.audit_log(table_name, record_id, operation, new_data, changed_by, changed_by_email)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', v_new, v_uid, v_email);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    SELECT array_agg(key) INTO v_changed
    FROM jsonb_each(v_new)
    WHERE v_new->>key IS DISTINCT FROM v_old->>key
      AND key NOT IN ('updated_at');
    IF v_changed IS NOT NULL AND array_length(v_changed,1) > 0 THEN
      INSERT INTO public.audit_log(table_name, record_id, operation, old_data, new_data, changed_fields, changed_by, changed_by_email)
      VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_old, v_new, v_changed, v_uid, v_email);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    INSERT INTO public.audit_log(table_name, record_id, operation, old_data, changed_by, changed_by_email)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', v_old, v_uid, v_email);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Triggers em 3 tabelas críticas
DROP TRIGGER IF EXISTS trg_audit_activities ON public.activities;
CREATE TRIGGER trg_audit_activities
  AFTER INSERT OR UPDATE OR DELETE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

DROP TRIGGER IF EXISTS trg_audit_projects ON public.projects;
CREATE TRIGGER trg_audit_projects
  AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

DROP TRIGGER IF EXISTS trg_audit_risks ON public.risks;
CREATE TRIGGER trg_audit_risks
  AFTER INSERT OR UPDATE OR DELETE ON public.risks
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- ===========================================================
-- BLOCO 3 #13: Calendários de Recursos
-- ===========================================================
CREATE TABLE IF NOT EXISTS public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  name text NOT NULL,
  is_national boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can read holidays" ON public.holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage holidays" ON public.holidays FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Jornada por usuário (JSON: {monday:8, tuesday:8, ..., sunday:0})
CREATE TABLE IF NOT EXISTS public.user_work_schedules (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  weekly_hours jsonb NOT NULL DEFAULT '{"monday":8,"tuesday":8,"wednesday":8,"thursday":8,"friday":8,"saturday":0,"sunday":0}'::jsonb,
  vacation_periods jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_work_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users read schedules" ON public.user_work_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own schedule" ON public.user_work_schedules FOR ALL TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(),'admin'::app_role));

-- Seeds: feriados nacionais BR 2026
INSERT INTO public.holidays(date, name) VALUES
  ('2026-01-01','Confraternização Universal'),
  ('2026-02-16','Carnaval'),
  ('2026-02-17','Carnaval'),
  ('2026-04-03','Sexta-feira Santa'),
  ('2026-04-21','Tiradentes'),
  ('2026-05-01','Dia do Trabalho'),
  ('2026-06-04','Corpus Christi'),
  ('2026-09-07','Independência do Brasil'),
  ('2026-10-12','Nossa Senhora Aparecida'),
  ('2026-11-02','Finados'),
  ('2026-11-15','Proclamação da República'),
  ('2026-12-25','Natal')
ON CONFLICT (date) DO NOTHING;