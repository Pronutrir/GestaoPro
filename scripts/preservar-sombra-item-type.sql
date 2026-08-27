-- ============================================================================
-- PRESERVAR A SOMBRA — uma tabela propria, fora do alcance das migrations
--
-- RODAR ANTES de qualquer reescrita da migration de congelamento.
--
-- ----------------------------------------------------------------------------
-- POR QUE ISTO EXISTE
--
-- `activities.item_type_antes_congelar` e hoje o UNICO registro de que 767
-- itens eram 'atividade' antes de a migration 20260824130000_pacote_e_posicao
-- grava-los como 'fase'. Essa historia nao esta em mais lugar nenhum: nao ha
-- log de valores antigos, e a propria migration que a criou nao a documenta —
-- ela foi preenchida por acidente de sequencia, e nao de proposito.
--
-- E ela e FRAGIL de um jeito especifico: a migration de congelamento, do jeito
-- que esta, faria `UPDATE ... SET item_type_antes_congelar = item_type WHERE
-- item_type_antes_congelar IS NULL`. Hoje esse WHERE nao casa com nada, entao a
-- sombra sobrevive. Mas basta uma reescrita descuidada — trocar o WHERE, ou
-- fazer um DROP/ADD da coluna "para comecar limpo" — e os 767 somem sem aviso.
--
-- Coluna dentro de `activities` esta no caminho de todo mundo que mexe em
-- `activities`. Uma tabela separada, nao.
--
-- ----------------------------------------------------------------------------
-- O QUE ESTA TABELA E, E O QUE ELA NAO E
--
-- E um INSTANTANEO datado, nao um espelho. Ela nao e mantida, nao tem trigger,
-- e nao deve ser atualizada: o valor dela e justamente ser de 27/08/2026, antes
-- da reescrita. Se alguem precisar de outro instantaneo, cria outro com outra
-- data no nome — nao sobrescreve este.
--
-- Copias redundantes no repositorio, para o caso de o banco se perder:
--   docs/medicoes/sombra-item_type-27-08-2026/sombra.csv    (8.199 linhas)
--   docs/medicoes/sombra-item_type-27-08-2026/sombra.json
--   docs/medicoes/sombra-item_type-27-08-2026/restaurar-sombra.sql
--
-- Tres formatos de proposito: o CSV se le sem ferramenta nenhuma, o JSON se
-- processa, e o SQL restaura. Guardar so um deles e apostar que a ferramenta
-- certa vai existir no dia em que precisar.
-- ============================================================================

BEGIN;

-- IF NOT EXISTS, e sem DROP: se a tabela ja existe, ela e de uma execucao
-- anterior e vale MAIS que esta — e mais antiga, logo mais perto do original.
CREATE TABLE IF NOT EXISTS public.item_type_sombra_20260827 (
  id                  uuid PRIMARY KEY,
  project_id          uuid,
  wbs_code            text,
  title               text,
  item_type_hoje      text,
  item_type_antes     text,
  is_milestone        boolean,
  parent_id           uuid,
  is_trashed          boolean,
  copiado_em          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.item_type_sombra_20260827 IS
  'Instantaneo de activities.item_type_antes_congelar em 27/08/2026, antes da reescrita da migration de congelamento. Unico registro de que 767 itens eram ''atividade'' antes do 20260824130000_pacote_e_posicao. NAO e espelho: nao atualizar, nao sobrescrever. Copias no repo em docs/medicoes/sombra-item_type-27-08-2026/.';

-- ON CONFLICT DO NOTHING pelo mesmo motivo do IF NOT EXISTS: a copia mais
-- antiga vence.
INSERT INTO public.item_type_sombra_20260827
  (id, project_id, wbs_code, title, item_type_hoje, item_type_antes,
   is_milestone, parent_id, is_trashed)
SELECT id, project_id, wbs_code, title, item_type, item_type_antes_congelar,
       is_milestone, parent_id, is_trashed
  FROM public.activities
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Verificacao — falha alto
-- ---------------------------------------------------------------------------
DO $conf$
DECLARE
  v_ativ  int;
  v_copia int;
  v_dif   int;
  v_767   int;
BEGIN
  SELECT count(*) INTO v_ativ  FROM public.activities;
  SELECT count(*) INTO v_copia FROM public.item_type_sombra_20260827;

  IF v_copia < v_ativ THEN
    RAISE EXCEPTION 'a copia tem % linhas e activities tem % — incompleta', v_copia, v_ativ;
  END IF;

  SELECT count(*) INTO v_dif
    FROM public.item_type_sombra_20260827
   WHERE item_type_hoje IS DISTINCT FROM item_type_antes;

  SELECT count(*) INTO v_767
    FROM public.item_type_sombra_20260827
   WHERE item_type_antes = 'atividade' AND item_type_hoje = 'fase';

  RAISE NOTICE 'copiadas ....... % linhas', v_copia;
  RAISE NOTICE 'divergentes .... % (a historia que se estava perdendo)', v_dif;
  RAISE NOTICE 'atividade->fase . % (os do pacote_e_posicao)', v_767;

  -- Se os 767 nao estiverem la, a copia foi feita DEPOIS de algo ja ter
  -- sobrescrito a sombra — e ai ela nao serve para o que foi criada.
  IF v_767 = 0 THEN
    RAISE EXCEPTION 'nenhuma linha atividade->fase na copia: a sombra ja foi sobrescrita?';
  END IF;
END $conf$;

-- COMMIT; ou ROLLBACK; — confira os numeros acima.
-- Esperado em 27/08/2026: 8.199 copiadas, 785 divergentes, 767 atividade->fase.
