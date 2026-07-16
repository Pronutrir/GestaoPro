-- Substitui o scoring RICE (reach/impact/confidence/effort) pelo modelo de
-- priorização por 5 critérios objetivos, escala 1-5 cada:
--   1. Alinhamento Estratégico
--   2. Valor Econômico
--   3. Impacto no Paciente
--   4. Urgência e Risco
--   5. Facilidade em Desenvolvimento
--
-- O índice de prioridade passa a ser a soma dos 5 critérios normalizada em
-- percentual (soma / 25 * 100), classificada em faixas: Alta (>=70), Média
-- (>=40), Baixa (<40).
--
-- `score` continua sendo coluna GENERATED (agora representando o índice %), de
-- modo que a ordenação existente (.order("score")) segue funcionando.
--
-- DEFAULT 3 nas 5 colunas (índice neutro de 60%): o formulário /solicitacao não
-- envia critérios no insert, então dependem do default — sem ele, o envio de
-- solicitações quebraria.

-- 1) Remove a coluna gerada antes das colunas das quais ela depende.
ALTER TABLE public.roadmap_items DROP COLUMN IF EXISTS score;

ALTER TABLE public.roadmap_items
  DROP COLUMN IF EXISTS reach,
  DROP COLUMN IF EXISTS impact,
  DROP COLUMN IF EXISTS confidence,
  DROP COLUMN IF EXISTS effort;

-- 2) Critérios de priorização (1 a 5), preenchidos na classificação da demanda.
ALTER TABLE public.roadmap_items
  ADD COLUMN alinhamento_estrategico integer NOT NULL DEFAULT 3
    CHECK (alinhamento_estrategico BETWEEN 1 AND 5),
  ADD COLUMN valor_economico integer NOT NULL DEFAULT 3
    CHECK (valor_economico BETWEEN 1 AND 5),
  ADD COLUMN impacto_paciente integer NOT NULL DEFAULT 3
    CHECK (impacto_paciente BETWEEN 1 AND 5),
  ADD COLUMN urgencia_risco integer NOT NULL DEFAULT 3
    CHECK (urgencia_risco BETWEEN 1 AND 5),
  ADD COLUMN facilidade_desenvolvimento integer NOT NULL DEFAULT 3
    CHECK (facilidade_desenvolvimento BETWEEN 1 AND 5);

-- Custo estimado do desenvolvimento, informado na classificação.
-- (custo_atual já existe, vindo do formulário de solicitação.)
ALTER TABLE public.roadmap_items
  ADD COLUMN custo_desenvolvimento numeric;

-- Marca se o item já foi avaliado (os critérios têm default, então o valor
-- sozinho não distingue "não classificado" de "classificado como neutro").
ALTER TABLE public.roadmap_items
  ADD COLUMN classificado_em timestamptz;

-- 3) Índice de prioridade em % (0-100), recalculado pelo banco.
ALTER TABLE public.roadmap_items
  ADD COLUMN score numeric GENERATED ALWAYS AS (
    (
      alinhamento_estrategico
      + valor_economico
      + impacto_paciente
      + urgencia_risco
      + facilidade_desenvolvimento
    ) * 100.0 / 25.0
  ) STORED;
