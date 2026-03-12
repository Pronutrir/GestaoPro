-- Create assumptions table
CREATE TABLE public.assumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  category text DEFAULT 'general',
  impact text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assumptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read assumptions" ON public.assumptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert assumptions" ON public.assumptions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update assumptions" ON public.assumptions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete assumptions" ON public.assumptions FOR DELETE TO authenticated USING (true);

-- Create risks table
CREATE TABLE public.risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  description text NOT NULL,
  probability text NOT NULL DEFAULT 'medium',
  impact text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'identified',
  mitigation text,
  contingency text,
  responsible text,
  category text DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.risks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read risks" ON public.risks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert risks" ON public.risks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update risks" ON public.risks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete risks" ON public.risks FOR DELETE TO authenticated USING (true);

-- Create delivery_packages table
CREATE TABLE public.delivery_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  start_date date,
  end_date date,
  sector text,
  responsible text,
  status text NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read delivery_packages" ON public.delivery_packages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert delivery_packages" ON public.delivery_packages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update delivery_packages" ON public.delivery_packages FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete delivery_packages" ON public.delivery_packages FOR DELETE TO authenticated USING (true);

-- Junction table for linking activities to delivery packages
CREATE TABLE public.delivery_package_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.delivery_packages(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(package_id, activity_id)
);

ALTER TABLE public.delivery_package_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read delivery_package_activities" ON public.delivery_package_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert delivery_package_activities" ON public.delivery_package_activities FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can delete delivery_package_activities" ON public.delivery_package_activities FOR DELETE TO authenticated USING (true);

-- Triggers for updated_at
CREATE TRIGGER update_assumptions_updated_at BEFORE UPDATE ON public.assumptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_risks_updated_at BEFORE UPDATE ON public.risks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_delivery_packages_updated_at BEFORE UPDATE ON public.delivery_packages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();