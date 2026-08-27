-- ROLLBACK DO FEED DA ATIVIDADE
--
-- Derruba as duas tabelas, a trigger e a funcao.
--
-- ATENCAO: isto APAGA O HISTORICO. Os eventos nao existem em outro lugar --
-- `activity_log_entries` guarda o Registro escrito a mao, que e outra coisa.
--
-- Se o objetivo for so parar de gerar eventos novos, derrube a TRIGGER e deixe
-- as tabelas: o que ja foi registrado continua legivel, e voltar atras nao
-- custa nada.

DROP TRIGGER IF EXISTS trg_feed_evento_sobe ON public.activity_feed_eventos;
DROP FUNCTION IF EXISTS public.feed_evento_sobe_para_o_pai();

DO $aviso$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.activity_feed_eventos;
  IF v_n > 0 THEN
    RAISE NOTICE 'ATENCAO: % eventos serao apagados e nao existem em outro lugar', v_n;
  END IF;
END $aviso$;

DROP TABLE IF EXISTS public.activity_feed_visitas;
DROP TABLE IF EXISTS public.activity_feed_eventos;

NOTIFY pgrst, 'reload schema';
