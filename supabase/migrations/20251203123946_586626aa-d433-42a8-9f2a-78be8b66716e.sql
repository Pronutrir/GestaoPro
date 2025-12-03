-- Add display_order column to projects table
ALTER TABLE public.projects ADD COLUMN display_order integer DEFAULT 0;