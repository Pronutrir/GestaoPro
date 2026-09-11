-- Migration: status de projeto volta a ter vocabulário fechado
-- Data: 11/09/2026
--
-- ────────────────────────────────────────────────────────────────────────────
-- O QUE ACONTECEU
--
-- Um projeto sumiu da lista. Não "apareceu errado": sumiu — da tela, dos sete
-- contadores e das sete colunas do quadro. A API devolvia a linha normalmente,
-- HTTP 200, sem erro nenhum.
--
-- O status gravado era `execucao`. O quadro monta as colunas assim:
--
--   filteredProjects.filter((p) => p.status === 'em-execucao')
--
-- `execucao` não é `em-execucao`. Não caía em coluna alguma, e como o quadro só
-- desenha aquelas sete, o projeto deixava de existir para quem olhava. Para o
-- usuário que era membro só dele, a lista inteira ficava vazia.
--
-- `lib/projectStatus.ts` descreve exatamente este cenário, escrito ANTES de
-- acontecer:
--
--   "sem CHECK no banco uma troca de separador é gravada em silêncio —
--    o projeto simplesmente some dos filtros, sem erro nenhum."
--
-- E trazia o normalizador pronto. Nunca foi chamado: a única importação do
-- módulo em todo o repositório era a constante, no roadmap. Segundo módulo
-- correto e morto encontrado nesta leva — o primeiro foi `dateValidation.ts`.
--
-- ────────────────────────────────────────────────────────────────────────────
-- POR QUE O CHECK, E POR QUE AGORA
--
-- O lado do cliente já foi corrigido: `filterProjects` normaliza o status na
-- fronteira por onde os projetos entram nas doze telas de lista. Isso conserta
-- a EXIBIÇÃO de qualquer grafia torta que já exista.
--
-- Mas normalizar na leitura é remendo se a escrita continua livre. O CHECK põe
-- a regra onde ela não depende de ninguém lembrar: uma grafia fora do
-- vocabulário passa a FALHAR, visível, em vez de sumir calada. É o mesmo padrão
-- que `projects.priority` e `projects.charter_status` já usam nesta base — o de
-- `status` existia e caiu numa migration antiga.
--
-- A ordem importa: normalizar primeiro, só então travar. O CHECK recusaria a
-- própria linha que motivou esta migration.

-- ---------------------------------------------------------------------------
-- 1. O dado. Espelha `normalizeProjectStatus` de lib/projectStatus.ts.
--
-- Em produção isto alcança UMA linha (`execucao`). As outras grafias entram
-- porque a função TS as trata e porque uma migration de 2026-05 já testava por
-- elas — em outro ambiente o dado torto pode ser outro.
-- ---------------------------------------------------------------------------
UPDATE public.projects
   SET status = CASE lower(replace(btrim(status), '_', '-'))
     WHEN 'em-execucao' THEN 'em-execucao'
     WHEN 'em-execução' THEN 'em-execucao'
     WHEN 'execucao'    THEN 'em-execucao'
     WHEN 'execução'    THEN 'em-execucao'
     WHEN 'concluido'   THEN 'concluido'
     WHEN 'concluído'   THEN 'concluido'
     WHEN 'completed'   THEN 'concluido'
     WHEN 'done'        THEN 'concluido'
     WHEN 'ideacao'     THEN 'ideacao'
     WHEN 'ideação'     THEN 'ideacao'
     WHEN 'poc'         THEN 'poc'
     WHEN 'mvp'         THEN 'mvp'
     WHEN 'blocked'     THEN 'blocked'
     WHEN 'bloqueio'    THEN 'blocked'
     WHEN 'drawer'      THEN 'drawer'
     WHEN 'gaveta'      THEN 'drawer'
     -- Desconhecido vai para o default da coluna, que é o mesmo destino que a
     -- função TS dá. Visível numa coluna errada é melhor que invisível.
     ELSE 'ideacao'
   END
 WHERE status IS DISTINCT FROM CASE lower(replace(btrim(status), '_', '-'))
     WHEN 'em-execucao' THEN 'em-execucao'
     WHEN 'em-execução' THEN 'em-execucao'
     WHEN 'execucao'    THEN 'em-execucao'
     WHEN 'execução'    THEN 'em-execucao'
     WHEN 'concluido'   THEN 'concluido'
     WHEN 'concluído'   THEN 'concluido'
     WHEN 'completed'   THEN 'concluido'
     WHEN 'done'        THEN 'concluido'
     WHEN 'ideacao'     THEN 'ideacao'
     WHEN 'ideação'     THEN 'ideacao'
     WHEN 'poc'         THEN 'poc'
     WHEN 'mvp'         THEN 'mvp'
     WHEN 'blocked'     THEN 'blocked'
     WHEN 'bloqueio'    THEN 'blocked'
     WHEN 'drawer'      THEN 'drawer'
     WHEN 'gaveta'      THEN 'drawer'
     ELSE 'ideacao'
   END;

-- ---------------------------------------------------------------------------
-- 2. A trava. Os sete de PROJECT_STATUS, nada além.
--
-- NOT VALID não serve aqui: o ponto é justamente garantir que não sobrou linha
-- torta. Se o passo 1 falhou em algum ambiente, esta migration para — que é o
-- comportamento desejado.
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN ('ideacao', 'poc', 'mvp', 'blocked', 'drawer', 'em-execucao', 'concluido'));

COMMENT ON COLUMN public.projects.status IS
  'Etapa do projeto. Vocabulario fechado, espelhado em lib/projectStatus.ts (PROJECT_STATUS). O CHECK existia, caiu numa migration antiga e voltou em 20260911180000 — sem ele, uma grafia torta fazia o projeto sumir da lista em silencio.';

NOTIFY pgrst, 'reload schema';
