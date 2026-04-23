-- 1) Add soft-delete columns
ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS is_trashed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trashed_at timestamp with time zone;
ALTER TABLE public.assumptions
  ADD COLUMN IF NOT EXISTS is_trashed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trashed_at timestamp with time zone;
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS is_trashed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trashed_at timestamp with time zone;
ALTER TABLE public.project_documents
  ADD COLUMN IF NOT EXISTS is_trashed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trashed_at timestamp with time zone;
ALTER TABLE public.lessons_learned
  ADD COLUMN IF NOT EXISTS is_trashed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trashed_at timestamp with time zone;
ALTER TABLE public.user_stories
  ADD COLUMN IF NOT EXISTS is_trashed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trashed_at timestamp with time zone;
ALTER TABLE public.delivery_packages
  ADD COLUMN IF NOT EXISTS is_trashed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trashed_at timestamp with time zone;
ALTER TABLE public.activity_comments
  ADD COLUMN IF NOT EXISTS is_trashed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trashed_at timestamp with time zone;

-- 2) Indexes for trash queries
CREATE INDEX IF NOT EXISTS idx_risks_is_trashed ON public.risks(is_trashed) WHERE is_trashed = true;
CREATE INDEX IF NOT EXISTS idx_assumptions_is_trashed ON public.assumptions(is_trashed) WHERE is_trashed = true;
CREATE INDEX IF NOT EXISTS idx_meetings_is_trashed ON public.meetings(is_trashed) WHERE is_trashed = true;
CREATE INDEX IF NOT EXISTS idx_project_documents_is_trashed ON public.project_documents(is_trashed) WHERE is_trashed = true;
CREATE INDEX IF NOT EXISTS idx_lessons_is_trashed ON public.lessons_learned(is_trashed) WHERE is_trashed = true;
CREATE INDEX IF NOT EXISTS idx_user_stories_is_trashed ON public.user_stories(is_trashed) WHERE is_trashed = true;
CREATE INDEX IF NOT EXISTS idx_delivery_packages_is_trashed ON public.delivery_packages(is_trashed) WHERE is_trashed = true;
CREATE INDEX IF NOT EXISTS idx_activity_comments_is_trashed ON public.activity_comments(is_trashed) WHERE is_trashed = true;

-- 3) Cascade clean when project is hard-deleted
CREATE OR REPLACE FUNCTION public.cleanup_project_children()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Comments live on activities; clear them first
  DELETE FROM public.activity_comments
    WHERE activity_id IN (SELECT id FROM public.activities WHERE project_id = OLD.id);
  DELETE FROM public.activity_log_entries
    WHERE activity_id IN (SELECT id FROM public.activities WHERE project_id = OLD.id);
  DELETE FROM public.activity_investments WHERE project_id = OLD.id;
  DELETE FROM public.task_dependencies
    WHERE predecessor_id IN (SELECT id FROM public.activities WHERE project_id = OLD.id)
       OR successor_id  IN (SELECT id FROM public.activities WHERE project_id = OLD.id);
  DELETE FROM public.delivery_package_activities
    WHERE package_id IN (SELECT id FROM public.delivery_packages WHERE project_id = OLD.id);
  DELETE FROM public.meeting_actions
    WHERE meeting_id IN (SELECT id FROM public.meetings WHERE project_id = OLD.id);
  DELETE FROM public.meeting_decisions
    WHERE meeting_id IN (SELECT id FROM public.meetings WHERE project_id = OLD.id);

  DELETE FROM public.user_stories WHERE project_id = OLD.id;
  DELETE FROM public.workflow_stage_members
    WHERE stage_id IN (SELECT id FROM public.workflow_stages WHERE project_id = OLD.id);
  DELETE FROM public.workflow_stages WHERE project_id = OLD.id;
  DELETE FROM public.user_story_stages WHERE project_id = OLD.id;
  DELETE FROM public.delivery_packages WHERE project_id = OLD.id;
  DELETE FROM public.meetings WHERE project_id = OLD.id;
  DELETE FROM public.risks WHERE project_id = OLD.id;
  DELETE FROM public.assumptions WHERE project_id = OLD.id;
  DELETE FROM public.lessons_learned WHERE project_id = OLD.id;
  DELETE FROM public.project_documents WHERE project_id = OLD.id;
  DELETE FROM public.project_dependencies WHERE project_id = OLD.id OR linked_project_id = OLD.id;
  DELETE FROM public.project_members WHERE project_id = OLD.id;
  DELETE FROM public.notifications WHERE project_id = OLD.id;
  DELETE FROM public.csc_tickets WHERE project_id = OLD.id;
  DELETE FROM public.okr_project_links WHERE project_id = OLD.id;
  DELETE FROM public.sprints WHERE project_id = OLD.id;
  DELETE FROM public.activities WHERE project_id = OLD.id;
  DELETE FROM public.phases WHERE project_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_project_children ON public.projects;
CREATE TRIGGER trg_cleanup_project_children
BEFORE DELETE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_project_children();