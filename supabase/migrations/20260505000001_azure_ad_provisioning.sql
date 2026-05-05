-- Azure AD provisioning + domain restriction
-- Adds provider/provider_id/last_login_at to profiles
-- Updates handle_new_user trigger to:
--   * restrict OAuth sign-ups to allowed domains
--   * populate provider/provider_id from raw_app_meta_data
--   * default new users to is_active=false (admin must approve)
--   * auto-create 'user' role in user_roles

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS provider_id TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_provider_id ON public.profiles(provider, provider_id);

-- Replace handle_new_user to support OAuth providers and auto-provisioning rules
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider TEXT;
  v_provider_id TEXT;
  v_full_name TEXT;
  v_is_oauth BOOLEAN;
  v_email_domain TEXT;
  v_allowed_domain TEXT := 'pronutrir.com.br';
  v_default_active BOOLEAN;
BEGIN
  v_provider := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');
  v_is_oauth := v_provider <> 'email';
  v_provider_id := NEW.raw_user_meta_data->>'sub';
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  v_email_domain := lower(split_part(COALESCE(NEW.email, ''), '@', 2));

  -- Domain restriction for OAuth sign-ups (Azure AD etc.)
  IF v_is_oauth AND v_email_domain <> v_allowed_domain THEN
    RAISE EXCEPTION 'OAuth sign-up not allowed for domain %. Only @% is permitted.',
      v_email_domain, v_allowed_domain
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- New OAuth users start inactive (admin approval required).
  -- Email/password users created via admin API stay active.
  v_default_active := NOT v_is_oauth;

  INSERT INTO public.profiles (id, email, full_name, is_active, provider, provider_id, last_login_at)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    v_default_active,
    v_provider,
    v_provider_id,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        provider = EXCLUDED.provider,
        provider_id = COALESCE(EXCLUDED.provider_id, public.profiles.provider_id),
        last_login_at = NOW();

  -- Auto-create default 'user' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Re-attach trigger (handle_new_user already wired in earlier migration, but ensure it's there)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill provider for existing rows (assume legacy = email)
UPDATE public.profiles
SET provider = 'email'
WHERE provider IS NULL;
