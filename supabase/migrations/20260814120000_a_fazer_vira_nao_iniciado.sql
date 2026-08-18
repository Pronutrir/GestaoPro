-- "A Fazer" vira "Não iniciado".
--
-- O nome dizia a mesma coisa que "Backlog", e a distinção entre as duas
-- categorias — `backlog` (existe, não priorizado) e `a_iniciar` (priorizado,
-- pronto para começar) — é real no modelo mas invisível na tela: as duas valem
-- 0% de progresso e a aba Backlog mostra as duas juntas. Quem olhava o quadro
-- via dois nomes para o mesmo estado.
--
-- "Não iniciado" descreve o que a coluna É, sem competir com o nome da aba.
--
-- ALCANCE: 41 projetos usam esse título (medido em 14/08/2026). Isto inclui
-- projetos de outras equipes — foi decisão explícita de padronizar em toda a
-- base, não efeito colateral.
--
-- Só o TÍTULO muda. A categoria `a_iniciar`, a posição, a cor, a marca de
-- entrada e o vínculo das atividades ficam intactos: nenhuma tarefa muda de
-- coluna, nenhum percentual se altera.
--
-- Rodar NA VM (20.65.208.119), container supabase-db-1:
--   PGPASSWORD=... ./scripts/apply-a-fazer-nao-iniciado.sh

-- Casa com as variações que a base tem hoje ("A Fazer", "A fazer", "a fazer",
-- com espaços em volta). `btrim` + `lower` porque o título é digitado à mão na
-- tela de colunas e ninguém garante a grafia.
--
-- Quem já renomeou para outra coisa não é tocado: a condição exige o texto
-- exato, não um "parecido com".
UPDATE public.workflow_stages
SET title = 'Não iniciado'
WHERE lower(btrim(title)) IN ('a fazer', 'afazer')
  -- A categoria confirma que é a coluna certa. Sem esta linha, uma coluna
  -- chamada "A Fazer" que alguém tenha marcado como `andamento` (por engano ou
  -- de propósito) seria renomeada junto, e o nome passaria a mentir.
  AND categoria = 'a_iniciar';

NOTIFY pgrst, 'reload schema';

-- Reversão (manual):
--   UPDATE public.workflow_stages SET title = 'A Fazer'
--   WHERE title = 'Não iniciado' AND categoria = 'a_iniciar';
--
-- Atenção: a reversão devolve o nome a TODAS as colunas "Não iniciado" —
-- inclusive as que já se chamavam assim antes desta migração, se houver.
