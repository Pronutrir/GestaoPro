-- ============================================================================
-- MODELO DE PAUTA POR TIPO DE REUNIÃO
--
-- As reuniões do projeto acontecem HOJE fora do sistema (informado pelo
-- usuário em 07/08/2026). Medido: 4 reuniões registradas em 25 projetos.
--
-- O maior atrito é começar do zero: quem abre uma reunião de Alinhamento
-- encontra dois campos de texto vazios e precisa digitar a mesma pauta toda
-- semana. É o que empurra para o Word — lá o modelo já está pronto.
--
-- Cada tipo de reunião passa a ter uma pauta padrão, que é COPIADA para a
-- reunião na criação (não referenciada): a ata é registro histórico do que
-- foi tratado naquele dia, e mudar o modelo depois não pode reescrever o
-- passado. Editável à vontade em cada reunião.
--
-- Os seis tipos já existem semeados por projeto (Kick Off, Treinamento,
-- Levantamento de requisitos, Alinhamento, Validação / Homologação,
-- Encerramento) — a pauta é preenchida para eles pelo nome.
-- ============================================================================

ALTER TABLE public.meeting_types
  ADD COLUMN IF NOT EXISTS agenda_template text;

COMMENT ON COLUMN public.meeting_types.agenda_template IS
  'Pauta padrão do tipo, uma linha por item. Copiada para a reunião na criação — alterar depois não muda reuniões já registradas.';

-- ----------------------------------------------------------------------------
-- Pautas dos seis tipos semeados.
--
-- Escritas na ordem em que a reunião de fato acontece, começando sempre por
-- rever o que ficou em aberto — é o que o mercado trata como básico e o que
-- fecha o ciclo entre uma reunião e a seguinte.
--
-- WHERE agenda_template IS NULL: quem já personalizou não é sobrescrito, e
-- rodar de novo não desfaz ajuste nenhum.
-- ----------------------------------------------------------------------------

UPDATE public.meeting_types SET agenda_template =
  E'Apresentação dos participantes e papéis\n'
  'Objetivo e justificativa do projeto\n'
  'Escopo: o que está dentro e o que está fora\n'
  'Principais entregas e marcos\n'
  'Prazos e restrições conhecidas\n'
  'Riscos iniciais identificados\n'
  'Forma de comunicação e periodicidade das reuniões\n'
  'Próximos passos e responsáveis'
WHERE label = 'Kick Off' AND agenda_template IS NULL;

UPDATE public.meeting_types SET agenda_template =
  E'Pendências da reunião anterior\n'
  'Andamento das entregas desde o último encontro\n'
  'Riscos, bloqueios e impedimentos\n'
  'Decisões necessárias\n'
  'Próximos passos e responsáveis'
WHERE label = 'Alinhamento' AND agenda_template IS NULL;

UPDATE public.meeting_types SET agenda_template =
  E'Contexto e objetivo do levantamento\n'
  'Processo atual: como funciona hoje\n'
  'Necessidades e dores relatadas\n'
  'Requisitos funcionais levantados\n'
  'Restrições, regras de negócio e integrações\n'
  'Pontos em aberto para confirmação\n'
  'Próximos passos e responsáveis'
WHERE label = 'Levantamento de requisitos' AND agenda_template IS NULL;

UPDATE public.meeting_types SET agenda_template =
  E'Escopo do que será validado\n'
  'Demonstração\n'
  'Aderência aos requisitos acordados\n'
  'Divergências e ajustes solicitados\n'
  'Aceite: aprovado, aprovado com ressalvas ou reprovado\n'
  'Prazo dos ajustes e responsáveis'
WHERE label = 'Validação / Homologação' AND agenda_template IS NULL;

UPDATE public.meeting_types SET agenda_template =
  E'Público e pré-requisitos\n'
  'Roteiro do treinamento\n'
  'Demonstração prática\n'
  'Dúvidas e dificuldades relatadas\n'
  'Material de apoio entregue\n'
  'Avaliação e próximos passos'
WHERE label = 'Treinamento' AND agenda_template IS NULL;

UPDATE public.meeting_types SET agenda_template =
  E'Entregas realizadas versus escopo planejado\n'
  'Prazo e custo: planejado versus realizado\n'
  'Pendências remanescentes e tratativa\n'
  'Lições aprendidas: o que funcionou e o que repetir\n'
  'Lições aprendidas: o que evitar da próxima vez\n'
  'Termo de encerramento e aceite final\n'
  'Transferência para operação/sustentação'
WHERE label = 'Encerramento' AND agenda_template IS NULL;
