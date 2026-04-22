
-- Adiciona created_by e closed_at em activities
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_by_email text,
  ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone;

-- Backfill: usar o INSERT mais antigo do audit_log para preencher created_by/email retroativos
UPDATE public.activities a
SET created_by = sub.changed_by,
    created_by_email = sub.changed_by_email
FROM (
  SELECT DISTINCT ON (record_id) record_id, changed_by, changed_by_email
  FROM public.audit_log
  WHERE table_name = 'activities' AND operation = 'INSERT'
  ORDER BY record_id, created_at ASC
) sub
WHERE a.id = sub.record_id
  AND a.created_by IS NULL;

-- Trigger que preenche created_by automaticamente em novos INSERTs
CREATE OR REPLACE FUNCTION public.set_activity_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_email text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NOT NULL AND NEW.created_by IS NULL THEN
    NEW.created_by := v_uid;
    SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
    NEW.created_by_email := v_email;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_activity_created_by ON public.activities;
CREATE TRIGGER trg_set_activity_created_by
BEFORE INSERT ON public.activities
FOR EACH ROW
EXECUTE FUNCTION public.set_activity_created_by();
