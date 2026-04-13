
-- Drop the old FK
ALTER TABLE public.user_stories DROP CONSTRAINT IF EXISTS user_stories_stage_id_fkey;

-- Reset all stage_id values first (they reference old user_story_stages)
UPDATE public.user_stories SET stage_id = NULL;

-- Add new FK pointing to workflow_stages
ALTER TABLE public.user_stories
  ADD CONSTRAINT user_stories_stage_id_fkey
  FOREIGN KEY (stage_id) REFERENCES public.workflow_stages(id) ON DELETE SET NULL;
