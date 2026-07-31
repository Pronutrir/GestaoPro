-- FINANCEIRO — FASE 4: estimativa em três pontos (PERT).
--
-- Três entradas e uma fórmula, alto valor percebido e custo trivial: quando o
-- item tem incerteza, estima-se otimista/provável/pessimista e o valor unitário
-- passa a ser calculado pela distribuição Beta, com o desvio-padrão medindo a
-- confiança da estimativa.
--
--   Esperado (PERT) = (O + 4M + P) / 6
--   Desvio-padrão   = (P − O) / 6
--
-- O peso 4 no "mais provável" é o que diferencia PERT da média simples: ele
-- reconhece que o valor central tem maior probabilidade de ocorrer.
--
-- Rodar NA VM: PGPASSWORD=... ./scripts/apply-budget-pert-fase4.sh

ALTER TABLE public.budget_items
  ADD COLUMN IF NOT EXISTS estimate_method text NOT NULL DEFAULT 'simples',
  ADD COLUMN IF NOT EXISTS optimistic_cost numeric,
  ADD COLUMN IF NOT EXISTS likely_cost numeric,
  ADD COLUMN IF NOT EXISTS pessimistic_cost numeric;

COMMENT ON COLUMN public.budget_items.estimate_method IS
  'simples = unit_cost digitado direto | pert = calculado de otimista/provavel/pessimista';

NOTIFY pgrst, 'reload schema';
