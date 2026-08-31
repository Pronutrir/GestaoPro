-- Categoria semântica da coluna do Kanban.
--
-- Antes disto a semântica era inferida por regex sobre o TÍTULO da coluna,
-- inclusive ao renomear: trocar "Concluída" por "Entregue ao cliente"
-- desmarcava is_final em silêncio e derrubava progresso e health score.
-- A categoria é um enum fechado, independente do nome — mesmo padrão de
-- Jira (status category), Linear (state type) e Azure DevOps (state category).
--
-- Idempotente: pode ser reaplicada sem efeito colateral.

-- 1) Enum ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_category') THEN
    CREATE TYPE public.workflow_category AS ENUM (
      'backlog', 'a_iniciar', 'andamento', 'concluida', 'cancelada'
    );
  END IF;
END $$;

-- 2) Coluna -------------------------------------------------------------
ALTER TABLE public.workflow_stages
  ADD COLUMN IF NOT EXISTS categoria public.workflow_category;

-- 3) Backfill a partir das flags antigas ---------------------------------
-- Só preenche o que ainda está nulo, para não sobrescrever ajuste manual.
-- Bloqueio/exceção viram 'andamento': o trabalho está em curso, apenas
-- travado — o bloqueio passa a ser flag no item, não coluna.
--
-- O NOME entra como último critério porque "a fazer" e "em andamento" nunca
-- se distinguiram por coluna nenhuma do banco: sem ele, ambas cairiam em
-- 'andamento' e o quadro exibiria quase tudo como em curso. É um backfill
-- único sobre dados legados — o defeito que originou tudo isto era o rename
-- RECORRENTE reescrever a semântica, e isso não acontece aqui.
-- is_exception vem de 20260508024956, que nao foi aplicada em todos os
-- ambientes (o banco de producao nao tem a coluna nem a versao registrada).
-- Cria-la aqui, de forma aditiva e idempotente, alinha o banco ao que o app
-- ja espera (src/lib/activityProgress.ts, WorkflowStageManager) e evita que o
-- backfill abaixo aborte a migration no meio com "column does not exist".
ALTER TABLE public.workflow_stages
  ADD COLUMN IF NOT EXISTS is_exception boolean NOT NULL DEFAULT false;

UPDATE public.workflow_stages
SET categoria = CASE
  WHEN is_final THEN 'concluida'::public.workflow_category
  WHEN display_order = 0 THEN 'backlog'::public.workflow_category
  WHEN COALESCE(is_blocked, false) OR COALESCE(is_exception, false)
    THEN 'andamento'::public.workflow_category
  WHEN contributes_to_progress = false THEN 'a_iniciar'::public.workflow_category
  WHEN lower(translate(title,
        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
       ~ '(cancelad[oa]|descartad[oa]|arquivad[oa]|rejeitad[oa])'
    THEN 'cancelada'::public.workflow_category
  WHEN lower(translate(title,
        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
       ~ '(a fazer|afazer|todo|to do|pendente|aguardando|fila|priorizad[oa]|planejad[oa]|nao iniciad[oa])'
    THEN 'a_iniciar'::public.workflow_category
  ELSE 'andamento'::public.workflow_category
END
WHERE categoria IS NULL;

-- 4) Obrigatoriedade, depois do backfill ---------------------------------
ALTER TABLE public.workflow_stages
  ALTER COLUMN categoria SET DEFAULT 'andamento'::public.workflow_category;

-- SET NOT NULL ja e no-op quando a coluna ja e NOT NULL, entao nao precisa de
-- guarda. Falhar aqui e o comportamento correto: significa backfill incompleto.
ALTER TABLE public.workflow_stages ALTER COLUMN categoria SET NOT NULL;

CREATE INDEX IF NOT EXISTS workflow_stages_categoria_idx
  ON public.workflow_stages (project_id, categoria);

-- 5) Uma única coluna de conclusão por projeto ---------------------------
-- Torna "% concluído" e "data de conclusão" inequívocos (regra que o
-- Azure DevOps aplica ao seu state category 'Completed').
-- Desempate obrigatorio antes do indice: is_final nunca teve unicidade, entao
-- projetos com duas colunas finais ("Concluida" + "Entregue") sao comuns e
-- fariam o CREATE UNIQUE INDEX abortar a migration no meio. Mantem a coluna
-- mais a direita (maior display_order) como a de conclusao; as demais viram
-- 'andamento' e podem ser reclassificadas na tela de colunas.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY project_id
           ORDER BY display_order DESC, created_at DESC, id DESC
         ) AS rn
  FROM public.workflow_stages
  WHERE categoria = 'concluida'
)
UPDATE public.workflow_stages s
   SET categoria = 'andamento'::public.workflow_category
  FROM ranked r
 WHERE r.id = s.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS workflow_stages_one_final_per_project
  ON public.workflow_stages (project_id)
  WHERE categoria = 'concluida';

-- 6) Trigger de colunas padrão, agora com categoria ----------------------
CREATE OR REPLACE FUNCTION public.create_default_workflow_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.workflow_stages (
    project_id, title, color, display_order,
    is_final, contributes_to_progress, progress_percent, categoria
  ) VALUES
    (NEW.id, 'Backlog',      'hsl(220, 15%, 50%)', 0, false, false, null, 'backlog'),
    (NEW.id, 'A Fazer',      'hsl(38, 92%, 50%)',  1, false, true,  null, 'a_iniciar'),
    (NEW.id, 'Em Andamento', 'hsl(220, 90%, 56%)', 2, false, true,  null, 'andamento'),
    (NEW.id, 'Em Teste',     'hsl(199, 89%, 48%)', 3, false, true,  null, 'andamento'),
    (NEW.id, 'Aprovada',     'hsl(270, 70%, 55%)', 4, false, true,  null, 'andamento'),
    (NEW.id, 'Concluída',    'hsl(142, 76%, 36%)', 5, true,  true,  100,  'concluida');
  RETURN NEW;
END;
$$;

-- Reversão (manual):
--   DROP INDEX IF EXISTS public.workflow_stages_one_final_per_project;
--   DROP INDEX IF EXISTS public.workflow_stages_categoria_idx;
--   ALTER TABLE public.workflow_stages DROP COLUMN IF EXISTS categoria;
--   DROP TYPE IF EXISTS public.workflow_category;
