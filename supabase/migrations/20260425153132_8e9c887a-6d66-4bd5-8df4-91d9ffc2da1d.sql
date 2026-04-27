
-- ============================================================
-- 1. Ajusta os constraints de prioridade ANTES de tudo
-- ============================================================
ALTER TABLE public.projects   DROP CONSTRAINT IF EXISTS projects_priority_check;
ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_priority_check;

-- Normaliza valores antigos em PT-BR
UPDATE public.projects   SET priority = 'baixa' WHERE priority = 'low';
UPDATE public.projects   SET priority = 'media' WHERE priority = 'medium';
UPDATE public.projects   SET priority = 'alta'  WHERE priority = 'high';
UPDATE public.activities SET priority = 'baixa' WHERE priority = 'low';
UPDATE public.activities SET priority = 'media' WHERE priority = 'medium';
UPDATE public.activities SET priority = 'alta'  WHERE priority = 'high';

-- Novo constraint flexível
ALTER TABLE public.projects
  ADD CONSTRAINT projects_priority_check
  CHECK (priority IN ('baixa','media','alta','critica','urgente','pendente'));

ALTER TABLE public.activities
  ADD CONSTRAINT activities_priority_check
  CHECK (priority IN ('baixa','media','alta','critica','urgente','pendente'));

-- ============================================================
-- 2. Colunas GUT em activities e projects
-- ============================================================
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS gravity        smallint CHECK (gravity  BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS urgency        smallint CHECK (urgency  BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS tendency       smallint CHECK (tendency BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS priority_score smallint;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS gravity        smallint CHECK (gravity  BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS urgency        smallint CHECK (urgency  BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS tendency       smallint CHECK (tendency BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS priority_score smallint;

-- ============================================================
-- 3. Função utilitária: score → rótulo
-- ============================================================
CREATE OR REPLACE FUNCTION public.gut_label(_score smallint)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _score IS NULL THEN 'pendente'
    WHEN _score <= 8    THEN 'baixa'
    WHEN _score <= 27   THEN 'media'
    WHEN _score <= 59   THEN 'alta'
    WHEN _score <= 99   THEN 'critica'
    ELSE                     'urgente'
  END
$$;

-- ============================================================
-- 4. Trigger: ao alterar G/U/T, recalcula score e prioridade
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_gut_priority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.gravity IS NOT NULL AND NEW.urgency IS NOT NULL AND NEW.tendency IS NOT NULL THEN
    NEW.priority_score := NEW.gravity * NEW.urgency * NEW.tendency;
    NEW.priority := public.gut_label(NEW.priority_score);
  ELSE
    NEW.priority_score := NULL;
    IF NEW.priority IS NULL OR NEW.priority NOT IN ('baixa','media','alta','critica','urgente') THEN
      NEW.priority := 'pendente';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activities_gut ON public.activities;
CREATE TRIGGER trg_activities_gut
  BEFORE INSERT OR UPDATE OF gravity, urgency, tendency ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.apply_gut_priority();

DROP TRIGGER IF EXISTS trg_projects_gut ON public.projects;
CREATE TRIGGER trg_projects_gut
  BEFORE INSERT OR UPDATE OF gravity, urgency, tendency ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.apply_gut_priority();

-- ============================================================
-- 5. Forçar reclassificação de todos os itens existentes
-- ============================================================
UPDATE public.activities SET priority = 'pendente' WHERE gravity IS NULL OR urgency IS NULL OR tendency IS NULL;
UPDATE public.projects   SET priority = 'pendente' WHERE gravity IS NULL OR urgency IS NULL OR tendency IS NULL;

-- ============================================================
-- 6. Índices para ordenação por prioridade
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_activities_priority_score ON public.activities(priority_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_projects_priority_score   ON public.projects(priority_score DESC NULLS LAST);
