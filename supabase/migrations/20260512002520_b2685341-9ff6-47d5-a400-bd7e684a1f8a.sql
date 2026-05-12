-- Add RACI + invitation flow to project_members
ALTER TABLE public.project_members
  ADD COLUMN IF NOT EXISTS raci text DEFAULT 'I',
  ADD COLUMN IF NOT EXISTS invitation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS invited_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS decline_reason text,
  ADD COLUMN IF NOT EXISTS invited_by uuid;

-- Validation: RACI in (R,A,C,I); invitation_status in (pending, accepted, declined)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_members_raci_chk') THEN
    ALTER TABLE public.project_members
      ADD CONSTRAINT project_members_raci_chk
      CHECK (raci IS NULL OR raci IN ('R','A','C','I'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_members_invitation_chk') THEN
    ALTER TABLE public.project_members
      ADD CONSTRAINT project_members_invitation_chk
      CHECK (invitation_status IN ('pending','accepted','declined'));
  END IF;
END $$;

-- Backfill existing rows as accepted (assume they were already team)
UPDATE public.project_members
   SET invitation_status = 'accepted', responded_at = COALESCE(responded_at, now())
 WHERE invitation_status = 'pending'
   AND created_at < now() - interval '1 minute';

-- Targeted notifications (per-user)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS target_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_notifications_target_user
  ON public.notifications(target_user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_status
  ON public.project_members(user_id, invitation_status);
