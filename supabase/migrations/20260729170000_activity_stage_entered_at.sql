-- Envelhecimento de card (card aging) e cycle time: registrar QUANDO a
-- atividade entrou na coluna atual.
--
-- Por que isto é a maior alavanca analítica do quadro
-- ---------------------------------------------------
-- Sem esta coluna, nada no sistema sabe há quanto tempo um card está parado.
-- Um item esquecido há 40 dias e um que entrou hoje são visualmente idênticos,
-- e as quatro métricas canônicas de Kanban ficam impossíveis: envelhecimento,
-- cycle time, throughput e diagrama de fluxo cumulativo. Com um único campo
-- mantido por trigger, as quatro passam a ser calculáveis.
--
-- Escopo deliberadamente mínimo: um campo denormalizado na própria atividade,
-- não uma tabela de histórico completa. Cobre "há quanto tempo está aqui"
-- (a pergunta do dia a dia) sem o custo de manter e consultar um log de
-- transições. Se o histórico completo virar requisito (para CFD retroativo),
-- a tabela pode ser adicionada depois sem desfazer isto.

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz;

-- Backfill: usa o melhor palpite disponível para não deixar o campo nulo.
-- updated_at é impreciso (qualquer edição o move), mas é o único sinal
-- existente; sem ele todo card apareceria como "recém-chegado" ou "sem dado".
-- A partir da trigger abaixo o valor passa a ser exato.
UPDATE public.activities
SET stage_entered_at = COALESCE(updated_at, created_at)
WHERE stage_entered_at IS NULL;

-- Mantém o campo atualizado: toca APENAS quando a coluna muda de verdade.
-- Editar título, prazo ou responsável não deve rejuvenescer o card — esse era
-- o defeito de usar updated_at como proxy de tempo na coluna.
CREATE OR REPLACE FUNCTION public.touch_activity_stage_entered_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stage_entered_at := COALESCE(NEW.stage_entered_at, now());
    RETURN NEW;
  END IF;

  -- IS DISTINCT FROM cobre transições de/para NULL, que "<>" perderia.
  IF NEW.workflow_stage_id IS DISTINCT FROM OLD.workflow_stage_id THEN
    NEW.stage_entered_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activities_stage_entered_at ON public.activities;
CREATE TRIGGER activities_stage_entered_at
  BEFORE INSERT OR UPDATE OF workflow_stage_id ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_activity_stage_entered_at();

-- Reversão (manual):
--   DROP TRIGGER IF EXISTS activities_stage_entered_at ON public.activities;
--   DROP FUNCTION IF EXISTS public.touch_activity_stage_entered_at();
--   ALTER TABLE public.activities DROP COLUMN IF EXISTS stage_entered_at;
