-- FINANCEIRO — FASE 1: o orçamento deixa de ser um número digitado.
--
-- Três peças:
--   1. budget_items    — a COMPOSIÇÃO do orçamento (itens com categoria,
--                        quantidade × valor unitário, fase e fornecedor).
--                        O total do projeto passa a ser calculado, não digitado.
--   2. cost_rates      — taxa por PAPEL (job_title) com exceção por PESSOA,
--                        e vigência (effective_from). Sem vigência, um reajuste
--                        reescreveria retroativamente todo o histórico de custo.
--   3. project_budget_settings — o Plano de Gerenciamento de Custos do PMBOK:
--                        moeda, precisão, limite de alerta, e as RESERVAS
--                        (contingência DENTRO da linha de base, gerencial FORA).
--
-- Rodar NA VM (20.65.208.119), container supabase-db-1:
--   PGPASSWORD=... ./scripts/apply-project-budget-fase1.sh

-- ============================================================
-- 1. ITENS DO ORÇAMENTO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.budget_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- Fase da EAP a que o item pertence (opcional: há custos do projeto inteiro).
  phase_id uuid REFERENCES public.phases(id) ON DELETE SET NULL,
  description text NOT NULL,
  -- pessoal | licencas | servicos | infraestrutura | viagem | outros
  category text NOT NULL DEFAULT 'outros',
  quantity numeric NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  -- Coluna gerada: o total do item nunca diverge de quantidade × valor.
  total_cost numeric GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  supplier text,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS budget_items_project_idx ON public.budget_items(project_id);
CREATE INDEX IF NOT EXISTS budget_items_phase_idx ON public.budget_items(phase_id);

ALTER TABLE public.budget_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project members read budget_items" ON public.budget_items;
CREATE POLICY "Project members read budget_items" ON public.budget_items
  FOR SELECT TO authenticated
  USING (public.can_view_project_v2(project_id, auth.uid()));

-- Escrita segue a MESMA regra de editar o projeto (admin ou líder/gestor):
-- orçamento é decisão de quem responde pelo projeto.
DROP POLICY IF EXISTS "Project managers write budget_items" ON public.budget_items;
CREATE POLICY "Project managers write budget_items" ON public.budget_items
  FOR ALL TO authenticated
  USING (public.can_manage_project_v2(project_id, auth.uid()))
  WITH CHECK (public.can_manage_project_v2(project_id, auth.uid()));

-- ============================================================
-- 2. TAXAS DE CUSTO (papel, com exceção por pessoa)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cost_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Exatamente UM dos dois: taxa do PAPEL ou exceção da PESSOA.
  job_title_id uuid REFERENCES public.job_titles(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- cost_rate: o que a hora CUSTA à empresa. bill_rate: o que se COBRA
  -- (opcional; habilita margem sem trabalho extra depois).
  cost_rate numeric NOT NULL DEFAULT 0,
  bill_rate numeric,
  currency text NOT NULL DEFAULT 'BRL',
  -- Vigência: taxa nova não reescreve o custo já apurado no passado.
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cost_rates_target_check CHECK (
    (job_title_id IS NOT NULL AND user_id IS NULL)
    OR (job_title_id IS NULL AND user_id IS NOT NULL)
  ),
  CONSTRAINT cost_rates_period_check CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS cost_rates_job_idx ON public.cost_rates(job_title_id, effective_from);
CREATE INDEX IF NOT EXISTS cost_rates_user_idx ON public.cost_rates(user_id, effective_from);

ALTER TABLE public.cost_rates ENABLE ROW LEVEL SECURITY;

-- Todo autenticado LÊ (o custo aparece nos projetos que já pode ver);
-- só admin ESCREVE (tabela de salários é dado sensível da organização).
DROP POLICY IF EXISTS "Authenticated read cost_rates" ON public.cost_rates;
CREATE POLICY "Authenticated read cost_rates" ON public.cost_rates
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins write cost_rates" ON public.cost_rates;
CREATE POLICY "Admins write cost_rates" ON public.cost_rates
  FOR ALL TO authenticated
  USING (public.is_admin_user_v2(auth.uid()))
  WITH CHECK (public.is_admin_user_v2(auth.uid()));

-- ============================================================
-- 3. PLANO DE GERENCIAMENTO DE CUSTOS (1 linha por projeto)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_budget_settings (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'BRL',
  -- Casas decimais exibidas (PMBOK: "nível de precisão").
  precision int NOT NULL DEFAULT 2,
  -- % de consumo que dispara alerta (PMBOK: "limite de controle").
  alert_threshold_pct numeric NOT NULL DEFAULT 90,
  -- RESERVAS — a distinção que quase toda ferramenta ignora:
  -- contingência entra na LINHA DE BASE (o gerente usa por conta própria);
  -- gerencial fica FORA da linha de base (exige aprovação da diretoria).
  contingency_pct numeric NOT NULL DEFAULT 0,
  contingency_amount numeric NOT NULL DEFAULT 0,
  management_reserve_pct numeric NOT NULL DEFAULT 0,
  management_reserve_amount numeric NOT NULL DEFAULT 0,
  notes text,
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_budget_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project members read budget_settings" ON public.project_budget_settings;
CREATE POLICY "Project members read budget_settings" ON public.project_budget_settings
  FOR SELECT TO authenticated
  USING (public.can_view_project_v2(project_id, auth.uid()));

DROP POLICY IF EXISTS "Project managers write budget_settings" ON public.project_budget_settings;
CREATE POLICY "Project managers write budget_settings" ON public.project_budget_settings
  FOR ALL TO authenticated
  USING (public.can_manage_project_v2(project_id, auth.uid()))
  WITH CHECK (public.can_manage_project_v2(project_id, auth.uid()));

-- ============================================================
-- 4. Vínculo do lançamento de custo com a fase (relatório por fase)
-- ============================================================
ALTER TABLE public.activity_investments
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'outros';

NOTIFY pgrst, 'reload schema';
