-- Vínculo com ATIVIDADE em reuniões, lições e orçamento.
--
-- As três tabelas tinham `phase_id` e paravam aí: dava para dizer a que FASE
-- algo pertence, mas não a que trabalho. Medido em 04/08/2026: o seletor
-- oferecia as 5 fases do projeto enquanto 827 atividades ficavam
-- inalcançáveis.
--
-- `project_documents` já tinha `activity_id` e é o modelo — não é padrão novo,
-- é o padrão existente aplicado onde faltava.
--
-- ON DELETE SET NULL em todas: apagar uma atividade não deve apagar a reunião
-- que falou dela, a lição que dela nasceu, nem a linha de orçamento. O vínculo
-- se desfaz, o registro permanece.

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL;

ALTER TABLE public.lessons_learned
  ADD COLUMN IF NOT EXISTS activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL;

ALTER TABLE public.budget_items
  ADD COLUMN IF NOT EXISTS activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL;

-- A pergunta que estes índices respondem é "o que existe sobre ESTA
-- atividade?" — o caminho inverso do vínculo, e o que torna o dado útil na
-- tela da atividade.
CREATE INDEX IF NOT EXISTS meetings_activity_idx
  ON public.meetings(activity_id) WHERE activity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS lessons_learned_activity_idx
  ON public.lessons_learned(activity_id) WHERE activity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS budget_items_activity_idx
  ON public.budget_items(activity_id) WHERE activity_id IS NOT NULL;
