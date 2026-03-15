
-- Allow all authenticated users to read profiles (needed for member dropdowns)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "All authenticated users can view profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true);
