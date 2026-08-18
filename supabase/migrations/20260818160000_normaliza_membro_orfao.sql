-- Dois membros num estado que a tela nunca soube exibir.
--
-- `can_create = true` e as outras tres colunas `false`: a pessoa pode criar
-- atividade, mas nao pode editar nem mover -- nem a que ela mesma acabou de
-- criar. Nao ha nivel na tela de equipe que signifique isso, entao ela era
-- exibida como "Acompanhar" (le e comenta), que e o nivel ERRADO nos dois
-- sentidos: promete menos do que a pessoa tem (criar) e mais do que ela
-- consegue fazer com o que criou.
--
-- Nao foi escolha de ninguem. Vem do AddProjectDialog, que gravava
-- `can_create: true` com o resto `false` para todo mundo que entrava na equipe
-- no momento da CRIACAO do projeto -- enquanto o EditProjectDialog, para a
-- mesma acao, gravava o preset "Executar". Duas telas, a mesma acao, dois
-- resultados. O codigo do front foi unificado no mesmo commit desta migration.
--
-- Medido em 18/08/2026: 2 linhas em 72.
--
-- PARA ONDE VAO: "Executar" (criar + editar + mover, sem excluir). E o destino
-- coerente com o unico sinal deliberado que existe na linha -- alguem quis que
-- essas pessoas criassem atividade. Rebaixar para "so leitura" descartaria
-- esse sinal; promover para "excluir" inventaria um que nunca existiu.
UPDATE public.project_members
   SET can_edit = true,
       can_move = true
 WHERE COALESCE(can_create, false) = true
   AND COALESCE(can_edit,   false) = false
   AND COALESCE(can_move,   false) = false
   AND COALESCE(can_delete, false) = false;

-- Verificacao: o estado orfao deixa de existir.
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
    FROM public.project_members
   WHERE COALESCE(can_create, false) = true
     AND COALESCE(can_edit,   false) = false
     AND COALESCE(can_move,   false) = false
     AND COALESCE(can_delete, false) = false;

  IF n > 0 THEN
    RAISE EXCEPTION 'ainda ha % membro(s) com can_create sozinho', n;
  END IF;

  RAISE NOTICE 'Membros orfaos normalizados. Restantes: 0';
END $$;

-- Reversao: nao ha volta automatica -- as duas linhas passam a ser
-- indistinguiveis das demais "Executar". Os user_id/project_id afetados estao
-- no log da aplicacao (o script imprime ANTES e DEPOIS).
