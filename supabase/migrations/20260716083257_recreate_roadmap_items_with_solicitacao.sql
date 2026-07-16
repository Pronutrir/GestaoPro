-- Recria roadmap_items para comportar as Solicitações de Projetos (formulário
-- /solicitacao) além do scoring RICE já existente.
--
-- Contexto: nenhuma tabela referencia roadmap_items (a única FK é de saída, para
-- projects), então recriar é seguro do ponto de vista relacional. Os campos usados
-- por RoadmapTable (Lista RICE), RoadmapScatterChart (Matriz 2x2), RoadmapTimeline
-- e RoadmapDrawer são preservados; os campos da solicitação são acrescentados.

-- A tabela continha apenas 1 registro de teste ("Projeto teste"), cujo descarte foi
-- confirmado antes desta migration. Nenhum dado relevante é perdido no DROP.
DROP TABLE IF EXISTS public.roadmap_items;

CREATE TABLE public.roadmap_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Campos do Roadmap/RICE (consumidos por Lista, Matriz 2x2, Timeline e Drawer) ──
  title text NOT NULL,
  description text,
  theme text NOT NULL DEFAULT 'produto',
  status text NOT NULL DEFAULT 'ideacao',
  reach integer NOT NULL DEFAULT 5,
  impact numeric NOT NULL DEFAULT 1,
  confidence numeric NOT NULL DEFAULT 0.8,
  effort integer NOT NULL DEFAULT 5,
  score numeric GENERATED ALWAYS AS (
    (reach * impact * confidence) / NULLIF(effort, 0)
  ) STORED,
  target_quarter text,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,

  -- ── Origem do item: 'formulario' (Solicitação) ou 'interno' (ideia criada no Drawer) ──
  origem text NOT NULL DEFAULT 'interno',

  -- ── Solicitação: 1. Identificação ──
  solicitante_nome text,
  solicitante_email text,
  solicitante_cargo text,
  area text,
  tipo_necessidade text,
  tipo_necessidade_outro text,

  -- ── Solicitação: 2. Situação atual e problemas ──
  processo_atual text,
  problemas text[],
  problemas_outro text,
  horas_semana integer,
  pessoas_envolvidas integer,
  custo_atual numeric,

  -- ── Solicitação: 3. Objetivo e resultado (o "objetivo" é gravado em title) ──
  resultado_esperado text,

  -- ── Solicitação: 4. O que espera receber ──
  tipos_resultado text[],
  tipos_resultado_outro text,
  perguntas text,
  minimo_entregavel text,

  -- ── Solicitação: 5. Prazo e urgência ──
  data_necessaria date,
  motivo_prazo text,
  motivo_prazo_outro text,

  -- ── Solicitação: 6. Observações finais ──
  observacoes text,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para os filtros/ordenações mais prováveis da Lista RICE.
CREATE INDEX roadmap_items_status_idx ON public.roadmap_items (status);
CREATE INDEX roadmap_items_origem_idx ON public.roadmap_items (origem);

-- RLS: mesmas políticas permissivas para usuários autenticados que existiam antes
-- (ver supabase/migrations/20260312182716_*.sql).
ALTER TABLE public.roadmap_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read roadmap_items" ON public.roadmap_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth users can insert roadmap_items" ON public.roadmap_items
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users can update roadmap_items" ON public.roadmap_items
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Auth users can delete roadmap_items" ON public.roadmap_items
  FOR DELETE TO authenticated USING (true);
