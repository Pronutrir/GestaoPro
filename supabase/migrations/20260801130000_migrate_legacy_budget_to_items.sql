-- ORÇAMENTO LEGADO -> ITEM DE ORÇAMENTO
--
-- Antes da Composição do Orçamento, o valor planejado do projeto era um número
-- solto em projects.budget_planned, editado por um diálogo ("Editar Orçamento").
-- Com o modelo novo, o planejado é a SOMA dos itens de budget_items — e o campo
-- antigo deixou de alimentar a tela.
--
-- O problema prático: 7 projetos têm R$ 218.500 em budget_planned e NENHUM item
-- cadastrado. Some o botão antigo (que é o passo seguinte na UI) e esse dinheiro
-- fica invisível: existe no banco, não aparece em lugar nenhum, e a linha de base
-- nasce zerada como se o projeto não tivesse orçamento.
--
-- Esta migration converte cada valor legado em UM item "Orçamento inicial
-- (migrado)", preservando o total. Depois disso o painel novo passa a mostrar o
-- mesmo número que a tela antiga mostrava.
--
-- Idempotente: só cria item para projeto que tem budget_planned > 0 e ainda não
-- tem nenhum item. Rodar de novo não duplica.
--
-- NÃO apaga projects.budget_planned. A coluna continua lá como registro do que
-- foi migrado — apagar seria irreversível e não há ganho em fazê-lo agora.
--
-- Rodar NA VM: PGPASSWORD=... ./scripts/apply-budget-migration.sh

-- ============================================================
-- 1. ANTES — o que será migrado
-- ============================================================
DO $$
DECLARE
  n_proj integer;
  v_total numeric;
BEGIN
  SELECT count(*), coalesce(sum(p.budget_planned), 0)
    INTO n_proj, v_total
  FROM public.projects p
  WHERE coalesce(p.budget_planned, 0) > 0
    AND p.is_trashed = false
    AND NOT EXISTS (SELECT 1 FROM public.budget_items b WHERE b.project_id = p.id);

  RAISE NOTICE 'A migrar: % projeto(s), total R$ %', n_proj, round(v_total, 2);
END $$;

-- ============================================================
-- 2. MIGRAÇÃO
-- ============================================================
-- quantity=1 e unit_cost=valor: total_cost é coluna GERADA (quantity*unit_cost),
-- então o total do item bate exatamente com o budget_planned de origem.
INSERT INTO public.budget_items (project_id, description, category, quantity, unit_cost, notes)
SELECT
  p.id,
  'Orçamento inicial (migrado)',
  'outros',
  1,
  p.budget_planned,
  'Valor que estava no campo antigo de orçamento do projeto, convertido em item '
    || 'para aparecer na Composição do Orçamento. Ajuste ou detalhe em itens '
    || 'menores conforme o planejamento evoluir.'
FROM public.projects p
WHERE coalesce(p.budget_planned, 0) > 0
  AND p.is_trashed = false
  AND NOT EXISTS (SELECT 1 FROM public.budget_items b WHERE b.project_id = p.id);

-- ============================================================
-- 3. VERIFICAÇÃO — o total tem de bater
-- ============================================================
DO $$
DECLARE
  r record;
  n_div integer := 0;
BEGIN
  FOR r IN
    SELECT p.title,
           p.budget_planned AS legado,
           coalesce(sum(b.total_cost), 0) AS itens
    FROM public.projects p
    LEFT JOIN public.budget_items b ON b.project_id = p.id
    WHERE coalesce(p.budget_planned, 0) > 0 AND p.is_trashed = false
    GROUP BY p.id, p.title, p.budget_planned
  LOOP
    IF round(r.legado, 2) <> round(r.itens, 2) THEN
      -- Divergência é esperada onde JÁ havia itens antes desta migration: ali o
      -- planejado real é a soma dos itens, e o campo antigo é que está velho.
      RAISE NOTICE 'Divergente (ok se o projeto ja tinha itens): % — legado R$ %, itens R$ %',
        r.title, round(r.legado, 2), round(r.itens, 2);
      n_div := n_div + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Verificacao concluida. % projeto(s) com valores diferentes.', n_div;
END $$;
