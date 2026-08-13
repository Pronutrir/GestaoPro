-- A coluna de ENTRADA deixa de ser "a que está em primeiro lugar".
--
-- Antes: `display_order = 0` marcava, ao mesmo tempo, a posição no quadro E o
-- papel de "onde a atividade nasce" (criação rápida, importação de EAP,
-- reabertura sem destino melhor). Duas coisas amarradas numa só:
--
--   * para "A Fazer" ser a entrada era preciso EXCLUIR o Backlog — que é
--     justamente a coluna protegida contra exclusão. Ficava preso;
--   * reordenar colunas podia trocar quem recebe as tarefas novas, em silêncio.
--
-- Agora `is_entry_point` diz o papel e `display_order` diz só a posição.
--
-- Rodar NA VM (20.65.208.119), container supabase-db-1:
--   PGPASSWORD=... ./scripts/apply-coluna-de-entrada.sh

-- 0) Duas categorias novas ---------------------------------------------------
-- As cinco existentes forçavam todo estado intermediário a virar "andamento":
--
--   * ESPERA parado por terceiro (cliente, fornecedor, aprovação externa)
--     contava como trabalho em curso — inflava o WIP e o tempo médio de etapa
--     de quem não estava fazendo nada;
--   * REVISÃO (QA, validação) é trabalho, mas de outra natureza, e sem
--     distinção não dá para medir quanto tempo se gasta conferindo.
--
-- Azure DevOps tem "Resolved" exatamente para a revisão; nenhuma ferramenta
-- trata espera como trabalho em curso.
--
-- ADD VALUE é irreversível no Postgres (não existe DROP VALUE num enum) — daí
-- o cuidado do IF NOT EXISTS: rodar duas vezes não quebra.
--
-- Os valores novos NÃO são usados neste arquivo de propósito: até o Postgres 11
-- um valor recém-adicionado não pode ser usado na mesma transação que o criou.
-- Quem passar a usá-los é o código, depois do commit desta migração.
ALTER TYPE public.workflow_category ADD VALUE IF NOT EXISTS 'espera';
ALTER TYPE public.workflow_category ADD VALUE IF NOT EXISTS 'revisao';

-- 1) A marca -----------------------------------------------------------------
ALTER TABLE public.workflow_stages
  ADD COLUMN IF NOT EXISTS is_entry_point boolean NOT NULL DEFAULT false;

-- 2) Backfill: quem já era entrada continua sendo -----------------------------
-- Preserva o comportamento atual de cada projeto — ninguém acorda com as
-- tarefas nascendo noutro lugar. Projeto sem display_order = 0 (possível em
-- base antiga) cai na coluna de menor ordem.
UPDATE public.workflow_stages ws
SET is_entry_point = true
WHERE ws.id = (
  SELECT s.id FROM public.workflow_stages s
  WHERE s.project_id = ws.project_id
  ORDER BY s.display_order ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM public.workflow_stages e
  WHERE e.project_id = ws.project_id AND e.is_entry_point
);

-- 3) Uma entrada por projeto, no máximo --------------------------------------
-- Índice parcial: só as marcadas entram, então ele impede a segunda sem
-- atrapalhar as demais linhas.
CREATE UNIQUE INDEX IF NOT EXISTS workflow_stages_one_entry_per_project
  ON public.workflow_stages (project_id)
  WHERE is_entry_point;

-- 4) Colunas padrão de projeto novo: SEM Backlog -----------------------------
-- O Backlog vira opcional — quem precisa, cria. Ele nascia em todo projeto e
-- criava o efeito silencioso de tarefa nova invisível no quadro, além de uma
-- coluna a mais para quem trabalha só com fluxo.
--
-- "A Fazer" assume a entrada. As cinco colunas seguem cobrindo o fluxo inteiro:
-- fila → trabalho → revisão → aprovação → entrega.
--
-- Projetos EXISTENTES não são tocados: quem tem Backlog continua com ele.
CREATE OR REPLACE FUNCTION public.create_default_workflow_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.workflow_stages (
    project_id, title, color, display_order,
    is_final, contributes_to_progress, progress_percent, categoria, is_entry_point
  ) VALUES
    (NEW.id, 'A Fazer',      'hsl(38, 92%, 50%)',  0, false, true,  null, 'a_iniciar',  true),
    (NEW.id, 'Em Andamento', 'hsl(220, 90%, 56%)', 1, false, true,  null, 'andamento',  false),
    (NEW.id, 'Em Teste',     'hsl(199, 89%, 48%)', 2, false, true,  null, 'andamento',  false),
    (NEW.id, 'Aprovada',     'hsl(270, 70%, 55%)', 3, false, true,  null, 'andamento',  false),
    (NEW.id, 'Concluída',    'hsl(142, 76%, 36%)', 4, true,  true,  100,  'concluida',  false);
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- Reversão (manual):
--   DROP INDEX IF EXISTS public.workflow_stages_one_entry_per_project;
--   ALTER TABLE public.workflow_stages DROP COLUMN IF EXISTS is_entry_point;
--   (e restaurar a função anterior, com a linha do Backlog em display_order 0)
