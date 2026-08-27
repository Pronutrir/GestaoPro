-- ============================================================================
-- O FEED DA ATIVIDADE — eventos que sobem das filhas, e o sino que conta
--
-- FASE D. Foi o primeiro pedido do Raphael, e era o unico item da lista sem
-- estrutura nenhuma no banco.
--
-- ----------------------------------------------------------------------------
-- POR QUE UMA TABELA NOVA, E NAO `activity_log_entries`
--
-- Aquela tabela existe e e outra coisa: e o REGISTRO -- o diario que alguem
-- escreve a mao, com `description` NOT NULL e `promoted_to_lesson_id`. Ela
-- guarda o que a pessoa DIZ.
--
-- O feed guarda o que ACONTECE, e ninguem digita: "Ana concluiu 1.3.2.3.1",
-- "Bruno apontou 4h", "o marco ficou pronto para confirmacao porque a ultima
-- predecessora fechou". E o diagnostico da secao 01 do desenho em uma frase:
-- "o historico e um chat, nao um feed".
--
-- Misturar os dois na mesma tabela obrigaria `description` a servir a dois
-- donos: texto livre de gente e frase montada por trigger. Quando isso
-- acontece, a coluna vira lixo em seis meses.
--
-- ----------------------------------------------------------------------------
-- A DECISAO DE DESENHO: O EVENTO GUARDA O TEXTO PRONTO
--
-- `texto` e NOT NULL e ja vem em portugues, sem UUID e sem enum. Poderia ser
-- montado na leitura, a partir de `tipo` + `dados`, e nao e -- por um motivo
-- que ja custou caro aqui: **"Nunca escrever UUID ou enum em ingles em
-- qualquer texto que um usuario le. Resolver o rotulo na origem, nao com um
-- de-para no componente."** (CLAUDE.md)
--
-- Montar na leitura poe o de-para no componente, e o primeiro tipo novo que
-- alguem criar sem atualizar o de-para vira "activity_status_changed" na tela.
-- Guardar o texto pronto tem um custo -- renomear um rotulo nao reescreve o
-- passado -- e esse custo e o correto: o feed e um registro historico, e
-- historico nao se reescreve.
--
-- `dados` jsonb fica ao lado para o que a tela precisar (link, id da filha),
-- sem que a frase dependa dele.
--
-- ----------------------------------------------------------------------------
-- O NAO-LIDO E POR PESSOA, e por isso e outra tabela
--
-- "3 nao lidos" e uma pergunta que so faz sentido com um sujeito. Guardar isso
-- no evento obrigaria uma coluna por pessoa, ou um array que cresce sem limite.
--
-- `activity_feed_visitas` guarda uma linha por (pessoa, atividade): quando ela
-- viu pela ultima vez. O nao-lido e uma contagem de eventos posteriores a essa
-- marca -- e some sozinho quando a pessoa abre.
--
-- ROLLBACK: 20260827150001
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) OS EVENTOS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_feed_eventos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- A atividade ONDE o evento aconteceu.
  activity_id  uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,

  -- A atividade em cujo feed ele DEVE APARECER.
  --
  -- Iguais quando o evento e da propria atividade. DIFERENTES quando ele veio
  -- de uma filha: ai `activity_id` e a filha e `feed_de` e o pai. E o que faz
  -- "o que andou nas subatividades" aparecer no feed do pai -- o par da regra
  -- do quadro, onde a filha nao vira cartao sozinha.
  feed_de      uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,

  -- 'concluiu' | 'apontou_horas' | 'mudou_campo' | 'comentou' | 'atribuiu' |
  -- 'criou' | 'marco_pronto' — sem CHECK de proposito: um tipo novo nao pode
  -- exigir migration, e o `texto` ja carrega o significado para quem le.
  tipo         text NOT NULL,

  -- A FRASE PRONTA, em portugues. Ver a nota de desenho no cabecalho.
  texto        text NOT NULL,

  -- Contexto para a tela (id da filha, campo alterado, valor anterior).
  -- NUNCA necessario para exibir a frase.
  dados        jsonb,

  autor_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- O nome no momento do evento. Redundante de proposito: se a pessoa sair da
  -- empresa e o perfil for apagado, o historico continua legivel.
  autor_nome   text,

  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.activity_feed_eventos IS
  'O que ACONTECEU numa atividade. Diferente de activity_log_entries, que e o Registro escrito a mao. `texto` ja vem pronto em portugues -- montar na leitura poria um de-para no componente, e o primeiro tipo novo viraria enum em ingles na tela.';

COMMENT ON COLUMN public.activity_feed_eventos.feed_de IS
  'Em qual feed aparecer. Diferente de activity_id quando o evento subiu de uma filha -- e o que faz o pai enxergar o que andou nas subatividades.';

-- Os dois indices que a leitura usa: o feed de uma atividade, em ordem de
-- tempo; e o nao-lido, que filtra por data.
CREATE INDEX IF NOT EXISTS idx_feed_eventos_feed_de
  ON public.activity_feed_eventos (feed_de, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_eventos_activity
  ON public.activity_feed_eventos (activity_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2) A VISITA — o nao-lido, por pessoa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_feed_visitas (
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  visto_em    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, activity_id)
);

COMMENT ON TABLE public.activity_feed_visitas IS
  'Quando cada pessoa viu o feed de cada atividade. O nao-lido e a contagem de eventos posteriores -- some sozinho quando ela abre.';

-- ---------------------------------------------------------------------------
-- 3) QUEM PODE LER O QUE
--
-- O feed NAO pode ser uma porta lateral. A regra e a mesma de sempre: quem
-- enxerga a atividade enxerga o feed dela. Delegar para a RLS de `activities`
-- e o unico jeito de nao criar uma segunda camada de acesso que diverge.
-- ---------------------------------------------------------------------------
ALTER TABLE public.activity_feed_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_feed_visitas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feed_eventos_leitura ON public.activity_feed_eventos;
CREATE POLICY feed_eventos_leitura ON public.activity_feed_eventos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.activities a WHERE a.id = activity_feed_eventos.feed_de)
  );

-- Escrita: qualquer pessoa autenticada pode gerar evento nas atividades que
-- alcanca -- o feed registra o que ela fez, e ela ja fez.
DROP POLICY IF EXISTS feed_eventos_escrita ON public.activity_feed_eventos;
CREATE POLICY feed_eventos_escrita ON public.activity_feed_eventos
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.activities a WHERE a.id = activity_feed_eventos.activity_id)
  );

-- A visita e DA PESSOA: ninguem le nem escreve a marca de outro.
DROP POLICY IF EXISTS feed_visitas_propria ON public.activity_feed_visitas;
CREATE POLICY feed_visitas_propria ON public.activity_feed_visitas
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4) O EVENTO SOBE PARA O PAI, automaticamente
--
-- A trigger existe para que quem GRAVA nao precise lembrar de subir. Se o
-- envio ficasse a cargo de quem chama, o primeiro caminho novo (importacao,
-- API, agente) esqueceria -- e o feed do pai ficaria incompleto sem ninguem
-- perceber.
--
-- Sobe UM nivel, nao a arvore inteira: o desenho mostra "na subatividade" no
-- feed do pai direto. Subir ate a raiz encheria o feed da fase com o
-- apontamento de horas de uma neta, e o sinal viraria ruido.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.feed_evento_sobe_para_o_pai()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $sobe$
DECLARE
  v_pai uuid;
BEGIN
  -- So sobe o que nasceu na propria atividade. Sem isto, um evento ja subido
  -- subiria de novo e o feed da fase teria a mesma linha N vezes.
  IF NEW.activity_id IS DISTINCT FROM NEW.feed_de THEN
    RETURN NEW;
  END IF;

  SELECT parent_id INTO v_pai FROM public.activities WHERE id = NEW.activity_id;
  IF v_pai IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.activity_feed_eventos
    (activity_id, feed_de, tipo, texto, dados, autor_id, autor_nome, created_at)
  VALUES
    (NEW.activity_id, v_pai, NEW.tipo, NEW.texto, NEW.dados,
     NEW.autor_id, NEW.autor_nome, NEW.created_at);

  RETURN NEW;
END $sobe$;

DROP TRIGGER IF EXISTS trg_feed_evento_sobe ON public.activity_feed_eventos;
CREATE TRIGGER trg_feed_evento_sobe
  AFTER INSERT ON public.activity_feed_eventos
  FOR EACH ROW EXECUTE FUNCTION public.feed_evento_sobe_para_o_pai();

-- ---------------------------------------------------------------------------
-- 5) Verificacao — falha alto
-- ---------------------------------------------------------------------------
DO $conf$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'activity_feed_eventos') THEN
    RAISE EXCEPTION 'a tabela de eventos nao foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'activity_feed_visitas') THEN
    RAISE EXCEPTION 'a tabela de visitas nao foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_feed_evento_sobe') THEN
    RAISE EXCEPTION 'a trigger que sobe o evento para o pai nao existe';
  END IF;
  RAISE NOTICE 'feed criado: eventos, visitas e a subida para o pai';
END $conf$;

NOTIFY pgrst, 'reload schema';
