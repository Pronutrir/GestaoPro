-- ROLLBACK DA FASE 05 -- volta a coluna a ser fonte unica
--
-- Derruba os dois triggers de sincronia. `activity_assignees` fica no banco,
-- com as linhas que tiver: a tabela nao atrapalha ninguem parada, e apagar
-- dado por causa de um rollback de trigger seria destruir mais do que se
-- consertou.
--
-- DEPOIS DISTO A TABELA VOLTA A ENVELHECER -- que e o estado de antes da
-- migration. Se alguma tela ja estiver LENDO de `activity_assignees` quando
-- este rollback rodar, ela passa a mostrar responsavel vencido. Reverta a tela
-- junto, ou nao reverta.
--
-- `resolver_profile_do_texto` FICA: e uma funcao de leitura, sem efeito
-- colateral, e outras coisas podem ter passado a usa-la.

DROP TRIGGER IF EXISTS trg_assigned_to_para_tabela ON public.activities;
DROP TRIGGER IF EXISTS trg_tabela_para_assigned_to ON public.activity_assignees;

DROP FUNCTION IF EXISTS public.tg_assigned_to_para_tabela();
DROP FUNCTION IF EXISTS public.tg_tabela_para_assigned_to();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname IN
      ('trg_assigned_to_para_tabela','trg_tabela_para_assigned_to')) THEN
    RAISE EXCEPTION 'os triggers de sincronia ainda existem';
  END IF;
  RAISE NOTICE 'sincronia desligada. activities.assigned_to volta a ser fonte unica.';
END $$;
