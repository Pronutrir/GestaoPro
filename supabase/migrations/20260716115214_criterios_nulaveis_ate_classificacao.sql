-- Solicitações passam a chegar SEM classificação: os 5 critérios ficam nulos até
-- alguém avaliar a demanda.
--
-- Antes, o DEFAULT 3 fazia toda solicitação nascer com índice 60% ("Baixa"),
-- como se já tivesse sido avaliada — enganoso, já que ninguém a analisou. Com os
-- critérios nulos, a coluna gerada `score` também fica nula e a interface mostra
-- "—" no lugar da prioridade.

ALTER TABLE public.roadmap_items
  ALTER COLUMN alinhamento_estrategico DROP NOT NULL,
  ALTER COLUMN alinhamento_estrategico DROP DEFAULT,
  ALTER COLUMN valor_economico DROP NOT NULL,
  ALTER COLUMN valor_economico DROP DEFAULT,
  ALTER COLUMN impacto_paciente DROP NOT NULL,
  ALTER COLUMN impacto_paciente DROP DEFAULT,
  ALTER COLUMN urgencia_risco DROP NOT NULL,
  ALTER COLUMN urgencia_risco DROP DEFAULT,
  ALTER COLUMN facilidade_desenvolvimento DROP NOT NULL,
  ALTER COLUMN facilidade_desenvolvimento DROP DEFAULT;

-- Zera os itens que ainda não foram classificados (nasceram com o default 3).
UPDATE public.roadmap_items
SET alinhamento_estrategico = NULL,
    valor_economico = NULL,
    impacto_paciente = NULL,
    urgencia_risco = NULL,
    facilidade_desenvolvimento = NULL
WHERE classificado_em IS NULL;
