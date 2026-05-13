ALTER TABLE public.user_module_permissions
  ALTER COLUMN allowed_modules
  SET DEFAULT ARRAY['overview', 'projects', 'team', 'timeline', 'blocked', 'agent']::text[];

UPDATE public.user_module_permissions
SET allowed_modules = allowed_modules || ARRAY['agent']::text[]
WHERE NOT ('agent' = ANY(allowed_modules));