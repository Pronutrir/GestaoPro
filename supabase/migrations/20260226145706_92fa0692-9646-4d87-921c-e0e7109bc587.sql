
-- Add category/portfolio field to projects for grouping
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS category text DEFAULT 'general';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS program text DEFAULT null;

-- Add completion_percentage column for quick access
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS completion_percentage numeric DEFAULT 0;
