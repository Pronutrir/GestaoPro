-- Repair migration for environments where audit_log migration was marked as applied
-- but the table/trigger objects were not actually created.

BEGIN;

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_log' AND policyname = 'Auth users can read audit_log'
  ) THEN
    EXECUTE 'CREATE POLICY "Auth users can read audit_log" ON public.audit_log FOR SELECT TO authenticated USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_log' AND policyname = 'System can insert audit_log'
  ) THEN
    EXECUTE 'CREATE POLICY "System can insert audit_log" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true)';
  END IF;
END
$$;

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

    IF v_changed IS NOT NULL AND array_length(v_changed, 1) > 0 THEN
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

DROP TRIGGER IF EXISTS trg_audit_activities ON public.activities;
CREATE TRIGGER trg_audit_activities
  AFTER INSERT OR UPDATE OR DELETE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

COMMIT;

NOTIFY pgrst, 'reload schema';
