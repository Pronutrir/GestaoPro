ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS wbs_code text;
ALTER TABLE public.phases ADD COLUMN IF NOT EXISTS wbs_code text;

-- Backfill from title prefix (e.g. "1.1.2 Algo" -> "1.1.2")
UPDATE public.activities
SET wbs_code = substring(title from '^([0-9]+(?:\.[0-9]+)*)')
WHERE wbs_code IS NULL
  AND title ~ '^[0-9]+(\.[0-9]+)*\s';

UPDATE public.phases
SET wbs_code = substring(title from '^([0-9]+(?:\.[0-9]+)*)')
WHERE wbs_code IS NULL
  AND title ~ '^[0-9]+(\.[0-9]+)*\s';

CREATE INDEX IF NOT EXISTS idx_activities_wbs_code ON public.activities(project_id, wbs_code);
CREATE INDEX IF NOT EXISTS idx_phases_wbs_code ON public.phases(project_id, wbs_code);