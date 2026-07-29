-- Conserta o backfill de categoria da migration 20260728233000.
--
-- O que deu errado: o backfill anterior derivou a categoria só das flags
-- (is_final, display_order, contributes_to_progress). Como "A Fazer" tem
-- contributes_to_progress = true, ela caiu no ELSE e virou 'andamento' —
-- junto com "Em Andamento", "Em Teste" e "Aprovada". Só Backlog e Concluída
-- ficaram certas, e o quadro passou a exibir quase tudo como "em andamento".
--
-- Por que usar o NOME aqui, se o bug original era o nome decidir a semântica:
-- o defeito era o rename RECORRENTE reescrever a categoria a cada edição.
-- Este é um backfill único sobre dados legados, onde o nome é a única pista
-- que distingue "a fazer" de "em andamento" — essa diferença nunca existiu
-- em coluna nenhuma do banco. Depois daqui, a categoria só muda por escolha
-- explícita do usuário.
--
-- Conservador de propósito: NÃO mexe em quem já é 'concluida' ou 'cancelada'
-- (encerramento é decisão de negócio) nem em 'backlog' (display_order = 0).
-- Idempotente.

-- Remove acentos sem depender da extensão unaccent (que pode não estar
-- instalada): translate() cobre as vogais acentuadas do português.
CREATE OR REPLACE FUNCTION pg_temp.sem_acento(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(translate(
    COALESCE(t, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
  ));
$$;

UPDATE public.workflow_stages s
SET categoria = 'a_iniciar'::public.workflow_category
WHERE s.categoria = 'andamento'
  AND s.display_order > 0
  AND pg_temp.sem_acento(s.title) ~ '(a fazer|afazer|todo|to do|pendente|aguardando|fila|priorizad[oa]|planejad[oa]|nao iniciad[oa])';

UPDATE public.workflow_stages s
SET categoria = 'cancelada'::public.workflow_category
WHERE s.categoria NOT IN ('concluida', 'cancelada')
  AND pg_temp.sem_acento(s.title) ~ '(cancelad[oa]|descartad[oa]|arquivad[oa]|rejeitad[oa])';

-- Relatório do resultado, para conferência no log da aplicação.
DO $$
DECLARE r record;
BEGIN
  RAISE NOTICE '--- Categorias por coluna apos o conserto ---';
  FOR r IN
    SELECT categoria, count(*) AS colunas, string_agg(DISTINCT title, ' | ') AS titulos
    FROM public.workflow_stages GROUP BY categoria ORDER BY 1
  LOOP
    RAISE NOTICE '% (%): %', r.categoria, r.colunas, r.titulos;
  END LOOP;
END $$;

-- Reversão: não há — a categoria é editável na interface, coluna a coluna.
