
-- Add visibility toggle to workflow stages
ALTER TABLE public.workflow_stages ADD COLUMN is_visible boolean NOT NULL DEFAULT true;

-- Create table for assigning members to workflow stages
CREATE TABLE public.workflow_stage_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.workflow_stages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(stage_id, user_id)
);

ALTER TABLE public.workflow_stage_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read workflow_stage_members"
  ON public.workflow_stage_members FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth users can insert workflow_stage_members"
  ON public.workflow_stage_members FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users can delete workflow_stage_members"
  ON public.workflow_stage_members FOR DELETE TO authenticated USING (true);
