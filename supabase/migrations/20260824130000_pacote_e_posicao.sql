-- "As fases, entregas/pacotes e atividades nao ficaram da mesma forma."
--
-- ── A CAUSA ────────────────────────────────────────────────────────────────
--
-- O modelo de EAP adotado para todos os projetos e POSICIONAL:
--
--   1     Projeto (escopo total)
--   1.1   Fase (macrofase / ciclo de vida)
--   1.1.1 Pacote de trabalho
--   1.1.1.1 Atividade
--
-- O nivel 2 ja era decidido assim. O nivel 3 nao: `eapRoleForImport` usava
-- `if (hasChildren) return "entrega"`, entao um pacote SEM filhos virava
-- "atividade". Importando a mesma EAP, 1.2.2 e 1.2.3 viravam pacote (tem
-- filhos) enquanto 1.1.1, 1.1.2 e 1.2.1 viravam atividade solta -- a mesma
-- posicao da EAP com dois significados, conforme alguem tivesse detalhado ou
-- nao. Pior: a estrutura mudava sozinha ao criar a primeira sub-atividade.
--
-- Corrigido no codigo (lib/eapModel, mesmo commit): nivel 3 e pacote por
-- POSICAO. Esta migration alinha o que JA foi importado -- 174 itens medidos
-- em 24/08/2026.
--
-- ── O QUE E TOCADO ─────────────────────────────────────────────────────────
--
-- SO item de nivel 3 exato (dois pontos no codigo: "1.2.1", nunca "1.2.1.1"),
-- gravado como `atividade`, e que NAO e marco. Marco continua marco: quem
-- escreveu "Milestone 1" declarou um ponto no tempo, nao uma caixa.
--
-- `item_type = 'fase'` e como fase E pacote sao gravados (ver `eapToPersisted`
-- em lib/eapModel): o que os distingue e o NIVEL lido do wbs_code na hora de
-- exibir, nao um valor diferente no banco.
--
-- Idempotente. Rodar NA VM:
--   PGPASSWORD=... ./scripts/apply-pacote-e-posicao.sh

-- Guard: o UPDATE muta activities. Sem ele o trigger de projeto concluido
-- abortaria se um item nivel-3 caisse em projeto fechado; e a troca de
-- item_type poderia esbarrar nos triggers de integridade da EAP. E backfill de
-- alinhamento para um estado valido, entao desliga-se os triggers durante ele.
-- Religado logo apos.
SET session_replication_role = replica;

UPDATE public.activities
   SET item_type = 'fase'
 WHERE is_trashed = false
   AND item_type = 'atividade'
   AND is_milestone = false
   AND wbs_code IS NOT NULL
   -- Numeracao pontuada de EXATAMENTE 3 niveis: "1.2.1" entra, "1.2" e
   -- "1.2.1.1" ficam de fora. `~` com anchors para nao pegar "Anexo A".
   AND wbs_code ~ '^\d+\.\d+\.\d+$';

SET session_replication_role = origin;

NOTIFY pgrst, 'reload schema';

-- Verificacao: nenhum nivel 3 pode continuar como atividade.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.activities
   WHERE is_trashed = false AND item_type = 'atividade' AND is_milestone = false
     AND wbs_code ~ '^\d+\.\d+\.\d+$';
  IF n > 0 THEN
    RAISE EXCEPTION 'ainda ha % item(ns) de nivel 3 como atividade', n;
  END IF;
  RAISE NOTICE 'OK: todo nivel 3 e pacote de trabalho.';
END $$;
