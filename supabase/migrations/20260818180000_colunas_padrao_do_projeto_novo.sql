-- Projeto novo nasce com quatro colunas, e "A Fazer" some do padrao.
--
-- O trigger criava CINCO: A Fazer · Em Andamento · Em Teste · Aprovada ·
-- Concluida. Duas delas -- "Em Teste" e "Aprovada" -- sao etapas de um fluxo
-- de desenvolvimento de software, e vinham em TODO projeto, inclusive nos que
-- nao tem teste nem aprovacao nenhuma. Quem nao usa apaga; quem nao percebe
-- fica com duas colunas mortas no quadro.
--
-- O padrao passa a ser o que todo projeto tem de fato:
--
--   Nao iniciado · Em Andamento · Pendencias · Concluida
--
-- Quem precisar de teste, aprovacao ou backlog cria a coluna -- que e o
-- caminho contrario do atual, onde se comeca com tudo e apaga o que sobra.
-- Mesma decisao que a 20260812140000 tomou ao tirar o Backlog do padrao.
--
-- ── "A Fazer" vira "Nao iniciado" TAMBEM AQUI ──────────────────────────────
--
-- A 20260814120000 renomeou o titulo em 41 projetos, mas nao tocou nesta
-- funcao. O resultado e que o nome antigo continuava nascendo: cada projeto
-- criado depois daquela migration reintroduzia "A Fazer" na base, e a
-- padronizacao se desfazia sozinha. Corrigir o dado sem corrigir a FONTE do
-- dado e conserto que dura ate o proximo insert.
--
-- ── PENDENCIAS entra com categoria `espera`, nao `andamento` ───────────────
--
-- As cinco colunas "Pendencias" que ja existem na base foram criadas a mao com
-- `categoria = 'andamento'`, porque `espera` nem existia quando surgiram.
-- Mas a semantica de `espera` e exatamente esta: parado por algo de fora --
-- cliente, fornecedor, aprovacao. Nao conta no limite de trabalho simultaneo
-- (WIP) e nao avanca o percentual, enquanto `andamento` faz as duas coisas.
--
-- Nascer como `andamento` faria uma tarefa travada esperando terceiro inflar o
-- WIP e o progresso do projeto, que e o defeito que a categoria `espera` foi
-- criada para resolver (ver lib/workflowCategory.ts).
--
-- As cinco ja existentes NAO sao tocadas aqui: mudar a categoria de coluna em
-- uso muda o percentual dos projetos que a usam, e isso e decisao de quem
-- toca aqueles projetos -- nao efeito colateral de uma migration sobre o
-- padrao de projeto NOVO.
--
-- ── A ordem ────────────────────────────────────────────────────────────────
--
-- Pendencias fica ANTES de Concluida e depois de Em Andamento: a tarefa sai do
-- fluxo por um impedimento e volta para ele. Deixa-la no fim, depois de
-- Concluida, sugeriria um estado terminal, que e o oposto do que ela e.

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
    -- `is_entry_point`: onde a tarefa nova cai. Uma por projeto (indice unico
    -- parcial criado em 20260812140000).
    (NEW.id, 'Não iniciado', 'hsl(38, 92%, 50%)',  0, false, true,  null, 'a_iniciar', true),
    (NEW.id, 'Em Andamento', 'hsl(220, 90%, 56%)', 1, false, true,  null, 'andamento', false),
    -- `contributes_to_progress = false`: pendencia nao avanca o projeto. Junto
    -- com a categoria `espera`, tira o item do WIP e do calculo de progresso.
    (NEW.id, 'Pendências',   'hsl(25, 95%, 53%)',  2, false, false, null, 'espera',    false),
    (NEW.id, 'Concluída',    'hsl(142, 76%, 36%)', 3, true,  true,  100,  'concluida', false);
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- Verificacao: a funcao nao pode mais produzir "A Fazer".
DO $$
DECLARE
  fonte text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO fonte
    FROM pg_proc
   WHERE proname = 'create_default_workflow_stages'
     AND pronamespace = 'public'::regnamespace;

  IF fonte IS NULL THEN
    RAISE EXCEPTION 'create_default_workflow_stages nao existe';
  END IF;

  IF fonte ILIKE '%A Fazer%' THEN
    RAISE EXCEPTION 'a funcao ainda cria "A Fazer"';
  END IF;

  IF fonte NOT ILIKE '%Pendências%' THEN
    RAISE EXCEPTION 'a funcao nao cria a coluna Pendencias';
  END IF;

  RAISE NOTICE 'Projeto novo: Nao iniciado · Em Andamento · Pendencias · Concluida';
END $$;

-- Projetos JA existentes nao sao tocados: cada um tem o quadro que sua equipe
-- montou, e sobrepor isso apagaria configuracao real. A mudanca vale do
-- proximo projeto em diante.
--
-- Reversao: restaurar o corpo da funcao da 20260812140000 (cinco colunas,
-- comecando em "A Fazer").
