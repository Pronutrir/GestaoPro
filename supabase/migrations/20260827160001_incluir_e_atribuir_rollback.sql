-- ROLLBACK — derruba `incluir_e_atribuir`.
--
-- NAO desfaz vinculos nem atribuicoes ja criados: eles sao decisao de gente,
-- registrada no feed com a frase inteira. Derrubar a funcao so tira a via
-- rapida; incluir na equipe continua possivel pela tela de equipe.

DROP FUNCTION IF EXISTS public.incluir_e_atribuir(uuid, uuid, text, text);

NOTIFY pgrst, 'reload schema';
