ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS root_cause TEXT,
  ADD COLUMN IF NOT EXISTS response_strategy TEXT;