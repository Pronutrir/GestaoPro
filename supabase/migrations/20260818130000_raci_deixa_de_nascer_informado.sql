-- O "I" do RACI era default do banco, nao escolha de ninguem.
--
-- A coluna nasceu com `DEFAULT 'I'` (20260512002520). Como so o EditProjectDialog
-- escreve nela, e todos os demais inserts de project_members omitem a coluna,
-- cada membro novo entrava rotulado "Informado -- so acompanha".
--
-- Medido em 18/08/2026, nas 72 linhas:
--
--     34x  "I"  com permissao TOTAL, inclusive excluir
--     10x  "I"  que cria, edita e move
--      5x  "I"  que so le                      <- os unicos em que o rotulo bate
--      5x  "R"
--     17x  vazio
--
-- Ou seja: 44 das 50 pessoas rotuladas "so acompanha" podiam mexer no projeto.
-- O rotulo dizia uma coisa e a permissao fazia outra -- e a leitura errada e
-- perigosa justamente por parecer informacao de governanca.
--
-- Distribuicao por mes de criacao confirma que e default e nao escolha: maio
-- 15, junho 13, julho 13, agosto 9. Sempre a mesma letra, sempre a primeira
-- da lista.
--
-- A tela ja contornava isso na LEITURA (EditProjectDialog trata "I" como
-- nao-definido, para a matriz nao mentir que todo mundo e Informado). Aqui o
-- contorno vira correcao: o banco para de gravar.
--
-- Os 44 "I" contraditorios sao limpos; os 5 em que o rotulo bate ficam. A
-- origem do dado nao importa quando o dado esta certo.
--
-- O CHECK continua aceitando 'I' -- quem quiser marcar Informado, marca. O que
-- muda e que passa a ser clique, nao silencio.

ALTER TABLE public.project_members ALTER COLUMN raci DROP DEFAULT;

-- Limpa os "I" CONTRADITORIOS: os que dizem "so acompanha" e ao mesmo tempo
-- podem criar, editar, mover ou excluir. Sao 44 das 50 linhas, e neles o
-- rotulo comprovadamente nao foi escolhido -- ninguem marca "so acompanha"
-- para quem tem permissao total.
--
-- Os outros 5 FICAM. Sao "I" com as quatro permissoes desligadas: ali o
-- rotulo descreve exatamente a pessoa, e apagar seria destruir a unica
-- informacao de governanca correta da tabela por causa da origem dela.
-- Default ou nao, hoje esta certo.
--
-- Nao toca em 'R', 'A' nem 'C': esses alguem clicou.
UPDATE public.project_members
   SET raci = NULL
 WHERE raci = 'I'
   AND (COALESCE(can_create, false) OR COALESCE(can_edit, false)
        OR COALESCE(can_delete, false) OR COALESCE(can_move, false));

COMMENT ON COLUMN public.project_members.raci IS
  'Papel na governanca (R/A/C/I) -- rotulo, NAO permissao. Sem default: NULL significa nao definido. Quem decide acesso e can_create/can_edit/can_delete/can_move.';

-- Verificacao.
DO $$
DECLARE
  tem_default boolean;
  n_i int;
BEGIN
  SELECT column_default IS NOT NULL INTO tem_default
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'project_members' AND column_name = 'raci';
  IF tem_default THEN
    RAISE EXCEPTION 'a coluna raci ainda tem DEFAULT';
  END IF;

  -- Nenhum "I" CONTRADITORIO pode sobrar. Os "I" que so leem continuam --
  -- esses estao certos e nao entram nesta conta.
  SELECT count(*) INTO n_i
    FROM public.project_members
   WHERE raci = 'I'
     AND (COALESCE(can_create, false) OR COALESCE(can_edit, false)
          OR COALESCE(can_delete, false) OR COALESCE(can_move, false));
  IF n_i <> 0 THEN
    RAISE EXCEPTION 'ainda restam % linhas com raci = I e permissao de escrita', n_i;
  END IF;

  RAISE NOTICE 'OK: raci sem default; % linhas com papel definido (% delas "I" que so leem).',
    (SELECT count(*) FROM public.project_members WHERE raci IS NOT NULL),
    (SELECT count(*) FROM public.project_members WHERE raci = 'I');
END $$;
