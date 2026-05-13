ALTER TABLE public.activity_comments
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

ALTER TABLE public.activity_comments
  ALTER COLUMN created_by SET DEFAULT auth.uid();

UPDATE public.activity_comments AS comments
SET created_by = profiles.id
FROM public.profiles AS profiles
WHERE comments.created_by IS NULL
  AND comments.author IS NOT NULL
  AND (
    lower(trim(COALESCE(profiles.full_name, ''))) = lower(trim(comments.author))
    OR lower(trim(COALESCE(profiles.email, ''))) = lower(trim(comments.author))
  );

DROP POLICY IF EXISTS "Permitir inserção pública de comentários" ON public.activity_comments;
DROP POLICY IF EXISTS "Permitir atualização pública de comentários" ON public.activity_comments;
DROP POLICY IF EXISTS "Permitir exclusão pública de comentários" ON public.activity_comments;
DROP POLICY IF EXISTS "Auth users can insert activity_comments" ON public.activity_comments;
DROP POLICY IF EXISTS "Auth users can update activity_comments" ON public.activity_comments;
DROP POLICY IF EXISTS "Auth users can delete activity_comments" ON public.activity_comments;

CREATE POLICY "Authenticated users can insert own activity_comments"
ON public.activity_comments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND COALESCE(created_by, auth.uid()) = auth.uid()
);

CREATE POLICY "Authors can update own activity_comments"
ON public.activity_comments
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Authors can delete own activity_comments"
ON public.activity_comments
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
);