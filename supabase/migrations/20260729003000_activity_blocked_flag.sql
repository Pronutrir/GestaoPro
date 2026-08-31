-- Bloqueio como FLAG NA ATIVIDADE, não como coluna do Kanban.
--
-- Até aqui, bloquear significava mover o card para uma coluna "Bloqueio".
-- A literatura Kanban trata isso como anti-padrão: o item sai do fluxo e vira
-- "out of sight"; escapa do limite de WIP da coluna onde de fato está parado;
-- e distorce tempo por etapa e Cumulative Flow Diagram. Jira usa flag, Linear
-- e ClickUp usam dependência, Azure DevOps usa campo — nenhuma usa coluna.
--
-- A prática correta é "block in place": o item permanece onde está, com
-- marcação visual. `blocked_since`/`blocked_days_total` já existiam (ver
-- 20260506042326) e continuam valendo — o que muda é QUEM dispara o bloqueio.
--
-- Idempotente.

-- 0) Guarda de ordem ----------------------------------------------------
-- O passo 4 zera workflow_stages.is_blocked contando que a categoria da coluna
-- ja preserve a semantica. Aplicada fora de ordem (os apply-*.sh sao avulsos),
-- a informacao de quais colunas eram de bloqueio se perderia sem substituto.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workflow_stages'
      AND column_name = 'categoria'
  ) THEN
    RAISE EXCEPTION 'Aplique 20260728233000_add_workflow_stage_category.sql antes desta.';
  END IF;
END $$;

-- 1) Campos da flag -----------------------------------------------------
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_reason text;

CREATE INDEX IF NOT EXISTS activities_is_blocked_idx
  ON public.activities (project_id)
  WHERE is_blocked;

-- 2) Migra o bloqueio vigente: quem está numa coluna de bloqueio hoje
--    passa a carregar a flag, preservando desde quando está travado.
-- Desliga os triggers de negocio: sem isto o trigger de projeto concluido
-- (20260526150000) aborta o backfill em atividades de projetos ja fechados.
SET session_replication_role = replica;

UPDATE public.activities a
SET
  is_blocked = true,
  blocked_since = COALESCE(a.blocked_since, a.updated_at, now()),
  blocked_reason = COALESCE(a.blocked_reason, 'Migrado da coluna de bloqueio')
FROM public.workflow_stages s
WHERE a.workflow_stage_id = s.id
  AND COALESCE(s.is_blocked, false)
  AND NOT a.is_blocked;

SET session_replication_role = origin;

-- 3) Trigger agora acompanha a FLAG, não a coluna ------------------------
CREATE OR REPLACE FUNCTION public.track_activity_blocked_time()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_blocked, false) AND NEW.blocked_since IS NULL THEN
      NEW.blocked_since := now();
    END IF;
    RETURN NEW;
  END IF;

  -- Entrou no bloqueio: marca o início.
  IF COALESCE(NEW.is_blocked, false) AND NOT COALESCE(OLD.is_blocked, false) THEN
    NEW.blocked_since := now();

  -- Saiu do bloqueio: acumula o tempo e limpa início e motivo.
  ELSIF NOT COALESCE(NEW.is_blocked, false) AND COALESCE(OLD.is_blocked, false) THEN
    IF OLD.blocked_since IS NOT NULL THEN
      NEW.blocked_days_total := COALESCE(OLD.blocked_days_total, 0)
        + EXTRACT(EPOCH FROM (now() - OLD.blocked_since)) / 86400.0;
    END IF;
    NEW.blocked_since := NULL;
    NEW.blocked_reason := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activities_blocked_time ON public.activities;
CREATE TRIGGER trg_activities_blocked_time
BEFORE INSERT OR UPDATE ON public.activities
FOR EACH ROW
EXECUTE FUNCTION public.track_activity_blocked_time();

-- 4) Colunas de bloqueio deixam de marcar bloqueio -----------------------
-- A categoria delas já virou 'andamento' na migration da fase 1; aqui a flag
-- da COLUNA é desligada para não haver duas fontes da mesma informação.
-- As colunas continuam existindo, com os cards no lugar.
UPDATE public.workflow_stages
SET is_blocked = false
WHERE COALESCE(is_blocked, false);

-- Reversão (manual):
--   ALTER TABLE public.activities DROP COLUMN IF EXISTS is_blocked;
--   ALTER TABLE public.activities DROP COLUMN IF EXISTS blocked_reason;
--   DROP INDEX IF EXISTS public.activities_is_blocked_idx;
--   -- e restaurar track_activity_blocked_time da migration 20260506042326
