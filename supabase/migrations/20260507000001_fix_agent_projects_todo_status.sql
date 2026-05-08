-- Projects created by the AI agent used the legacy 'todo' status which is not
-- rendered in any pipeline column. Remap them to 'ideacao' (the entry stage).
UPDATE public.projects
SET status = 'ideacao'
WHERE status = 'todo'
  AND is_trashed = false;
