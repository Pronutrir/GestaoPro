-- Migration: o PROJETO ganha início e término reais
-- Data: 11/09/2026
--
-- ────────────────────────────────────────────────────────────────────────────
-- O PROBLEMA: DOIS CAMPOS NA TELA QUE NÃO TÊM ONDE CAIR
--
-- `AddProjectDialog` e `EditProjectDialog` mostram, desde sempre, os campos
-- "Data de Início Real" e "Data de Término Real". A tabela `public.projects`
-- não tem essas colunas.
--
-- O que acontecia ao salvar: o payload estendido ia com elas, o PostgREST
-- respondia `Could not find the 'actual_start_date' column`, e o próprio
-- código — numa rotina de tolerância a schema legado — removia a coluna do
-- payload e tentava de novo, até passar. O save "dava certo", com um aviso
-- genérico de campos ignorados. O valor digitado sumia e o campo reabria vazio.
-- Sempre, para todo projeto, desde que os campos existem.
--
-- Pelo mesmo motivo, `BaselineBlock` (dentro do TAP) lia cinco colunas
-- inexistentes e só conseguia renderizar "Previsto": "Real" e "Desvio" eram
-- estruturalmente impossíveis. Verificado em 11/09/2026 —
-- `information_schema.columns` não devolve nenhuma coluna com 'baseline' nem
-- 'actual' em `projects`.
--
-- ────────────────────────────────────────────────────────────────────────────
-- O QUE ESTA MIGRATION FAZ, E O QUE ELA DELIBERADAMENTE NÃO FAZ
--
-- FAZ: cria as duas colunas de data REAL, como `date` — o mesmo tipo de
-- `start_date` e `due_date`, que são as irmãs delas na mesma tela. Não repete
-- o erro do `timestamptz` recebendo dia, que a migration 20260911160000 acabou
-- de desfazer em `activities`.
--
-- NÃO FAZ: criar `baseline_start_date`, `baseline_end_date` e
-- `baseline_frozen_at`. Congelar linha de base é uma decisão de produto, não um
-- campo faltando: o CLAUDE.md a coloca na segunda onda ("A linha de base existe
-- uma vez só. Aprovar o TAP cria a linha de base de prazo e de custo") e hoje
-- não existe botão nenhum para congelar. Criar as colunas agora só produziria
-- três colunas permanentemente nulas.
--
-- Sem elas, `endVariance()` cai no ramo que já estava escrito para este caso e
-- usa o PREVISTO como referência — que é a resposta certa enquanto não há
-- linha de base. Com as duas colunas desta migration, "Real" e "Desvio" passam
-- a aparecer no TAP pela primeira vez.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS actual_start_date date,
  ADD COLUMN IF NOT EXISTS actual_end_date   date;

COMMENT ON COLUMN public.projects.actual_start_date IS
  'DIA em que o projeto comecou de fato. Par de actual_end_date; referencia do "Real" no BaselineBlock.';
COMMENT ON COLUMN public.projects.actual_end_date IS
  'DIA em que o projeto terminou de fato. Comparado ao previsto (due_date) para o desvio.';

NOTIFY pgrst, 'reload schema';
