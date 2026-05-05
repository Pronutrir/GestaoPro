-- Aligns workflow_stages with the application schema (Next.js / TS types).
-- Hostinger DB foi provisionado com a coluna `name` e sem a coluna `color`,
-- enquanto o código usa `title` + `color`. Este script é idempotente.

BEGIN;

-- 1) Garante coluna color (com default).
ALTER TABLE public.workflow_stages
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT 'hsl(220, 15%, 50%)';

-- 2) Garante coluna title.
ALTER TABLE public.workflow_stages
  ADD COLUMN IF NOT EXISTS title text;

-- 3) Migra dados de `name` -> `title` quando aplicável.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='workflow_stages' AND column_name='name'
  ) THEN
    EXECUTE 'UPDATE public.workflow_stages SET title = COALESCE(title, name) WHERE title IS NULL';
  END IF;
END $$;

-- 4) Define title como NOT NULL (após popular).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='workflow_stages'
      AND column_name='title' AND is_nullable='YES'
  ) THEN
    -- Fallback para qualquer linha residual sem título.
    EXECUTE 'UPDATE public.workflow_stages SET title = ''Sem título'' WHERE title IS NULL';
    EXECUTE 'ALTER TABLE public.workflow_stages ALTER COLUMN title SET NOT NULL';
  END IF;
END $$;

-- 5) Mantém `name` sincronizado (compatibilidade) caso ainda exista.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='workflow_stages' AND column_name='name'
  ) THEN
    -- Permite NULL para que INSERTs apenas com `title` funcionem.
    EXECUTE 'ALTER TABLE public.workflow_stages ALTER COLUMN name DROP NOT NULL';
    EXECUTE 'UPDATE public.workflow_stages SET name = title WHERE name IS DISTINCT FROM title';

    -- Trigger de sincronização bidirecional title <-> name.
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.sync_workflow_stage_name_title()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $body$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          IF NEW.title IS NULL AND NEW.name IS NOT NULL THEN NEW.title := NEW.name; END IF;
          IF NEW.name  IS NULL AND NEW.title IS NOT NULL THEN NEW.name  := NEW.title; END IF;
        ELSIF TG_OP = 'UPDATE' THEN
          IF NEW.title IS DISTINCT FROM OLD.title THEN NEW.name := NEW.title; END IF;
          IF NEW.name  IS DISTINCT FROM OLD.name  AND NEW.title = OLD.title THEN
            NEW.title := NEW.name;
          END IF;
        END IF;
        RETURN NEW;
      END;
      $body$;
    $f$;

    EXECUTE 'DROP TRIGGER IF EXISTS trg_sync_workflow_stage_name_title ON public.workflow_stages';
    EXECUTE 'CREATE TRIGGER trg_sync_workflow_stage_name_title
             BEFORE INSERT OR UPDATE ON public.workflow_stages
             FOR EACH ROW EXECUTE FUNCTION public.sync_workflow_stage_name_title()';
  END IF;
END $$;

-- 6) Atualiza/garante a função de criação de stages padrão (idempotente).
CREATE OR REPLACE FUNCTION public.create_default_workflow_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.workflow_stages (project_id, title, color, display_order, is_final) VALUES
    (NEW.id, 'Backlog',       'hsl(220, 15%, 50%)', 0, false),
    (NEW.id, 'A Fazer',       'hsl(38, 92%, 50%)',  1, false),
    (NEW.id, 'Em Andamento',  'hsl(220, 90%, 56%)', 2, false),
    (NEW.id, 'Em Teste',      'hsl(199, 89%, 48%)', 3, false),
    (NEW.id, 'Aprovada',      'hsl(270, 70%, 55%)', 4, false),
    (NEW.id, 'Concluída',     'hsl(142, 76%, 36%)', 5, true);
  RETURN NEW;
END;
$$;

-- 7) Garante o trigger no projects.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_create_default_workflow_stages'
  ) THEN
    CREATE TRIGGER trigger_create_default_workflow_stages
      AFTER INSERT ON public.projects
      FOR EACH ROW
      EXECUTE FUNCTION public.create_default_workflow_stages();
  END IF;
END $$;

-- 8) Cria stages padrão para projetos antigos que não têm nenhum.
INSERT INTO public.workflow_stages (project_id, title, color, display_order, is_final)
SELECT p.id, v.title, v.color, v.display_order, v.is_final
FROM public.projects p
CROSS JOIN (VALUES
  ('Backlog',      'hsl(220, 15%, 50%)', 0, false),
  ('A Fazer',      'hsl(38, 92%, 50%)',  1, false),
  ('Em Andamento', 'hsl(220, 90%, 56%)', 2, false),
  ('Em Teste',     'hsl(199, 89%, 48%)', 3, false),
  ('Aprovada',     'hsl(270, 70%, 55%)', 4, false),
  ('Concluída',    'hsl(142, 76%, 36%)', 5, true)
) AS v(title, color, display_order, is_final)
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_stages ws WHERE ws.project_id = p.id
);

COMMIT;

-- 9) Recarrega o schema cache do PostgREST.
NOTIFY pgrst, 'reload schema';
