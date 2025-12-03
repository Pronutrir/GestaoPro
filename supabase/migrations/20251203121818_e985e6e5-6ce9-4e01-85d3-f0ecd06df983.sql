-- Remove old constraint to allow status update
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;