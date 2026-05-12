DO $$
DECLARE
  r RECORD;
  parent_wbs text;
  next_n int;
BEGIN
  -- Para cada subatividade sem wbs_code, na ordem (display_order, created_at)
  FOR r IN
    SELECT a.id, a.parent_id, a.project_id
      FROM public.activities a
     WHERE a.parent_id IS NOT NULL
       AND (a.wbs_code IS NULL OR btrim(a.wbs_code) = '')
       AND COALESCE(a.is_trashed, false) = false
     ORDER BY a.parent_id, COALESCE(a.display_order, 0), a.created_at
  LOOP
    SELECT wbs_code INTO parent_wbs FROM public.activities WHERE id = r.parent_id;
    IF parent_wbs IS NULL OR btrim(parent_wbs) = '' THEN
      CONTINUE; -- pai sem EAP: pula (será gerada quando o pai tiver)
    END IF;

    -- maior sufixo .N entre irmãos já com wbs_code
    SELECT COALESCE(MAX(
      NULLIF(split_part(substring(wbs_code FROM (length(parent_wbs) + 2)), '.', 1), '')::int
    ), 0) + 1
      INTO next_n
      FROM public.activities
     WHERE parent_id = r.parent_id
       AND wbs_code IS NOT NULL
       AND wbs_code LIKE parent_wbs || '.%';

    UPDATE public.activities
       SET wbs_code = parent_wbs || '.' || next_n
     WHERE id = r.id;
  END LOOP;
END $$;