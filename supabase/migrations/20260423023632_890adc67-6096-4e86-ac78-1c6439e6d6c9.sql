ALTER TABLE public.activities 
ADD COLUMN is_milestone boolean NOT NULL DEFAULT false;

CREATE INDEX idx_activities_is_milestone ON public.activities(is_milestone) WHERE is_milestone = true;