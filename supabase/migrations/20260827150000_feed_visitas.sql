-- ============================================================================
-- O NAO-LIDO DO SINO — a unica peca que faltava no feed
--
-- ----------------------------------------------------------------------------
-- O QUE EU IA FAZER, E POR QUE ESTAVA ERRADO
--
-- A primeira versao desta migration criava uma tabela `activity_feed_eventos`
-- inteira, com trigger para subir o evento da filha para o pai.
--
-- Era REDUNDANTE. A fase 08 (migration 20260826170000) ja tinha entregue:
--
--   activity_feed_events   view que une CONVERSA + HISTORICO numa linha do
--                          tempo, com autor resolvido e resumo
--   feed_da_subarvore()    funcao que junta a subarvore inteira, ordenada,
--                          com o codigo EAP da filha para o prefixo
--
-- Ou seja: "o que acontece nas subatividades aparece no feed da atividade
-- principal" JA FUNCIONAVA. Conferido com dado real -- a funcao devolve
-- eventos com `ehraiz: false`, que sao exatamente os das filhas.
--
-- O que faltava era so uma coisa, e e a que esta migration entrega.
--
-- ----------------------------------------------------------------------------
-- O NAO-LIDO PRECISA DE UM SUJEITO
--
-- "3 nao lidos" nao e propriedade do evento -- e da relacao entre a pessoa e a
-- atividade. Guardar isso na view seria impossivel (view nao tem estado), e
-- guardar no evento exigiria uma coluna por pessoa.
--
-- Uma linha por (pessoa, atividade): quando ela viu pela ultima vez. O
-- nao-lido e a contagem de eventos posteriores, e some sozinho quando ela abre.
--
-- ROLLBACK: 20260827150001
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.activity_feed_visitas (
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  visto_em    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, activity_id)
);

COMMENT ON TABLE public.activity_feed_visitas IS
  'Quando cada pessoa viu o feed de cada atividade. O nao-lido e a contagem de eventos posteriores em feed_da_subarvore -- some sozinho quando ela abre. Os EVENTOS ja vem da fase 08; aqui so mora o sujeito.';

ALTER TABLE public.activity_feed_visitas ENABLE ROW LEVEL SECURITY;

-- A visita e DA PESSOA: ninguem le nem escreve a marca de outro. Nao ha caso
-- legitimo para isso, e um gestor sabendo quando alguem leu seria vigilancia,
-- nao gestao.
DROP POLICY IF EXISTS feed_visitas_propria ON public.activity_feed_visitas;
CREATE POLICY feed_visitas_propria ON public.activity_feed_visitas
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DO $conf$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'activity_feed_visitas') THEN
    RAISE EXCEPTION 'a tabela de visitas nao foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE tablename = 'activity_feed_visitas' AND policyname = 'feed_visitas_propria') THEN
    RAISE EXCEPTION 'a policy da visita nao foi criada -- sem ela, um le a marca do outro';
  END IF;
  RAISE NOTICE 'visitas criadas. Os eventos ja vinham da fase 08.';
END $conf$;

NOTIFY pgrst, 'reload schema';
