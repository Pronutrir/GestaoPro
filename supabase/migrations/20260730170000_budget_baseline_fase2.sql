-- FINANCEIRO — FASE 2: linha de base versionada e custo distribuído no tempo.
--
-- Sem uma foto congelada do orçamento aprovado não existe DESVIO: hoje, editar
-- o planejado apaga o estouro junto. E sem o custo distribuído por período não
-- existe curva S — é a decisão irreversível desta fase, porque reconstruir o
-- histórico depois é impraticável.
--
--   budget_baselines       — a foto: versão, quem aprovou, quando, e os totais
--                            congelados (orçado + contingência = BAC).
--   budget_baseline_lines  — o BAC distribuído por MÊS (o PV acumulado sai daqui).
--
-- Rodar NA VM (20.65.208.119), container supabase-db-1:
--   PGPASSWORD=... ./scripts/apply-budget-baseline-fase2.sh

-- ============================================================
-- 1. LINHA DE BASE (snapshot versionado)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.budget_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- 1, 2, 3… — replanejou, nova versão; a anterior fica no histórico.
  version int NOT NULL,
  -- Totais CONGELADOS no momento da aprovação. Guardados como valor, não
  -- recalculados: é isso que faz a linha de base ser uma foto de verdade.
  planned_total numeric NOT NULL DEFAULT 0,
  contingency_total numeric NOT NULL DEFAULT 0,
  -- BAC = planejado + contingência. A reserva gerencial fica FORA.
  baseline_total numeric NOT NULL DEFAULT 0,
  management_reserve_total numeric NOT NULL DEFAULT 0,
  -- Quem aprovou e quando (decisão do usuário: líder/gestor faz tudo, mas
  -- fica registrado quem foi).
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by_name text,
  approved_at timestamptz NOT NULL DEFAULT now(),
  -- Motivo do replanejamento (obrigatório a partir da v2, pela UI).
  reason text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

CREATE INDEX IF NOT EXISTS budget_baselines_project_idx ON public.budget_baselines(project_id, version DESC);
-- Só UMA linha de base ativa por projeto.
CREATE UNIQUE INDEX IF NOT EXISTS budget_baselines_one_active
  ON public.budget_baselines(project_id) WHERE is_active;

ALTER TABLE public.budget_baselines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project members read baselines" ON public.budget_baselines;
CREATE POLICY "Project members read baselines" ON public.budget_baselines
  FOR SELECT TO authenticated
  USING (public.can_view_project_v2(project_id, auth.uid()));

DROP POLICY IF EXISTS "Project managers write baselines" ON public.budget_baselines;
CREATE POLICY "Project managers write baselines" ON public.budget_baselines
  FOR ALL TO authenticated
  USING (public.can_manage_project_v2(project_id, auth.uid()))
  WITH CHECK (public.can_manage_project_v2(project_id, auth.uid()));

-- ============================================================
-- 2. DISTRIBUIÇÃO NO TEMPO (time-phased) — a base da curva S
-- ============================================================
CREATE TABLE IF NOT EXISTS public.budget_baseline_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id uuid NOT NULL REFERENCES public.budget_baselines(id) ON DELETE CASCADE,
  -- Primeiro dia do mês de referência (period_start = '2026-07-01').
  period_start date NOT NULL,
  -- Valor planejado PARA aquele mês (não acumulado — o acumulado é derivado).
  planned_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (baseline_id, period_start)
);

CREATE INDEX IF NOT EXISTS baseline_lines_baseline_idx
  ON public.budget_baseline_lines(baseline_id, period_start);

ALTER TABLE public.budget_baseline_lines ENABLE ROW LEVEL SECURITY;

-- Herda o acesso da linha de base a que pertence.
DROP POLICY IF EXISTS "Read baseline lines" ON public.budget_baseline_lines;
CREATE POLICY "Read baseline lines" ON public.budget_baseline_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.budget_baselines b
    WHERE b.id = baseline_id AND public.can_view_project_v2(b.project_id, auth.uid())
  ));

DROP POLICY IF EXISTS "Write baseline lines" ON public.budget_baseline_lines;
CREATE POLICY "Write baseline lines" ON public.budget_baseline_lines
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.budget_baselines b
    WHERE b.id = baseline_id AND public.can_manage_project_v2(b.project_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.budget_baselines b
    WHERE b.id = baseline_id AND public.can_manage_project_v2(b.project_id, auth.uid())
  ));

-- ============================================================
-- 3. Regra de reconhecimento do custo no item de orçamento
-- ============================================================
-- Quando o custo do item "acontece" ao longo do período da fase:
--   inicio    — tudo no primeiro mês
--   rateado   — dividido igualmente pelos meses (padrão)
--   fim       — tudo no último mês
-- É o "cost accrual" do MS Project, e é o que dá FORMA à curva S.
ALTER TABLE public.budget_items
  ADD COLUMN IF NOT EXISTS accrual text NOT NULL DEFAULT 'rateado';

NOTIFY pgrst, 'reload schema';
