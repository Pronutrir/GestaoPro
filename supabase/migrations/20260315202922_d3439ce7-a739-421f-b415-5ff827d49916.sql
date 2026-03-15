-- CSC Tickets table
CREATE TABLE public.csc_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  service_type text NOT NULL DEFAULT 'suporte_tecnico',
  priority text NOT NULL DEFAULT 'medium',
  requesting_area text,
  requested_date date,
  sla_deadline timestamptz,
  status text NOT NULL DEFAULT 'novo',
  department text NOT NULL DEFAULT 'ti',
  assigned_to text,
  raci_role text,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL,
  created_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.csc_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read csc_tickets" ON public.csc_tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert csc_tickets" ON public.csc_tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update csc_tickets" ON public.csc_tickets FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete csc_tickets" ON public.csc_tickets FOR DELETE TO authenticated USING (true);

-- CSC SLA Configurations
CREATE TABLE public.csc_sla_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type text NOT NULL,
  department text NOT NULL,
  sla_hours integer NOT NULL DEFAULT 48,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.csc_sla_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read csc_sla_configs" ON public.csc_sla_configs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert csc_sla_configs" ON public.csc_sla_configs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update csc_sla_configs" ON public.csc_sla_configs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete csc_sla_configs" ON public.csc_sla_configs FOR DELETE TO authenticated USING (true);

-- Seed default SLA configs
INSERT INTO public.csc_sla_configs (service_type, department, sla_hours, description) VALUES
  ('suporte_tecnico', 'ti', 24, 'Suporte Técnico - TI'),
  ('acesso_sistema', 'ti', 8, 'Liberação de Acesso a Sistemas'),
  ('equipamento', 'ti', 48, 'Solicitação de Equipamento'),
  ('admissao', 'rh', 120, 'Admissão de Funcionário'),
  ('ferias', 'rh', 72, 'Solicitação de Férias'),
  ('treinamento', 'rh', 96, 'Solicitação de Treinamento'),
  ('pagamento', 'financeiro', 48, 'Processamento de Pagamento'),
  ('reembolso', 'financeiro', 72, 'Solicitação de Reembolso'),
  ('contrato', 'juridico', 120, 'Análise de Contrato'),
  ('parecer', 'juridico', 96, 'Parecer Jurídico'),
  ('compra_material', 'compras', 72, 'Compra de Material'),
  ('cotacao', 'compras', 48, 'Solicitação de Cotação');

-- Trigger to auto-update updated_at
CREATE TRIGGER update_csc_tickets_updated_at
  BEFORE UPDATE ON public.csc_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();