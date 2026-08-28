-- ============================================================================
-- FOLHAS PRESAS NO QUADRO VIRAM CARTÃO — e a trava que impede reincidir
--
-- 28/08/2026. Depois do E2 (o nível não decide papel), o quadro desenha como
-- agrupador TODO item com item_type IN (fase,entrega,pacote). Uma FOLHA (sem
-- subitem vivo) gravada assim ocupa a coluna e NÃO gera cartão — trabalho
-- invisível. A fatia dos 68 (20260827140000) corrigiu um lote; sobraram 8,
-- medidos agora em todos os projetos.
--
-- Duas partes, e a ordem importa:
--   1) as 8 folhas viram 'atividade' (cartão);
--   2) uma TRAVA no banco impede promover ao quadro um agrupador sem subitem,
--      para o defeito não voltar por uma promoção nova.
--
-- Métrica que fecha: agrupador-folha no quadro  8 -> 0.
--
-- IDS EXPLÍCITOS (não predicado): a lista foi medida num instante conhecido, e
-- é ela que vale. A asserção final (contagem = 0) prova que estes 8 eram o
-- conjunto COMPLETO — se um 9º tiver aparecido entre a medição e a execução, a
-- migration para e avisa, em vez de deixá-lo preso em silêncio.
--
-- ROLLBACK: 20260828120001
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _alvo(id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _alvo(id) VALUES
  ('c3cff2a9-5a78-4e79-a536-3ef35975ba06'),  -- 2.0 (raiz) Capacitação, Templates e Plataforma de Gestão — proj 19f78f60
  ('d7405664-8bcd-4bfd-9655-a483c680de0c'),  -- 1.2.1 — proj c3d6b220
  ('b40cbdaa-ca43-43b9-808b-5b08ae29269c'),  -- 1.2.2 — proj c3d6b220
  ('f4f62077-3836-4b8d-aa02-ea0316a22a86'),  -- 1.2.3 — proj c3d6b220
  ('f6353b5a-b287-49bf-a2f7-92cc18e143fd'),  -- 1.2.4 — proj c3d6b220
  ('487bdbad-e394-4237-9243-f1740d665d0b'),  -- 1.2.5 — proj c3d6b220
  ('d0305fa5-e7c7-4254-b83a-d51a07e14f5c'),  -- 1.1.1 — proj dcf977e9
  ('d971b024-966f-48a8-9204-3b85fc850d34')   -- 1.1.2 — proj dcf977e9
;

-- ── O ANTES, e a guarda ─────────────────────────────────────────────────────
SELECT rpad(a.item_type,12) AS "item_type", count(*) AS "linhas"
  FROM public.activities a JOIN _alvo t ON t.id=a.id GROUP BY 1;

DO $antes$
DECLARE v_total int; v_faltam int; v_nao_fase int;
BEGIN
  SELECT count(*) INTO v_total FROM _alvo;
  IF v_total <> 8 THEN RAISE EXCEPTION 'a lista tem % ids, esperava 8', v_total; END IF;
  SELECT count(*) INTO v_faltam FROM _alvo t LEFT JOIN public.activities a ON a.id=t.id WHERE a.id IS NULL;
  IF v_faltam > 0 THEN RAISE EXCEPTION '% dos 8 ids sumiram da tabela', v_faltam; END IF;
  -- todos têm de estar como foram medidos: agrupador 'fase'. Se algum já mudou,
  -- alguém mexeu no meio — melhor parar.
  SELECT count(*) INTO v_nao_fase FROM _alvo t JOIN public.activities a ON a.id=t.id
   WHERE lower(a.item_type) <> 'fase';
  IF v_nao_fase > 0 THEN RAISE EXCEPTION '% dos 8 já não são fase — refaça a medição', v_nao_fase; END IF;
END $antes$;

-- ── 1) AS 8 VIRAM ATIVIDADE ─────────────────────────────────────────────────
-- bypass: nenhum dos 8 está em projeto concluído hoje, mas o SET LOCAL cobre o
-- caso de algum entrar em concluído entre a medição e a execução — é só rótulo
-- de exibição (fase->atividade), não toca prazo, custo nem trabalho. Volta ao
-- normal antes de criar a trava, para ela nascer ativa.
SET LOCAL session_replication_role = replica;
UPDATE public.activities a SET item_type='atividade'
  FROM _alvo t WHERE t.id=a.id AND a.item_type IS DISTINCT FROM 'atividade';
SET LOCAL session_replication_role = origin;

-- ── 2) A TRAVA — o quadro não recebe agrupador sem subitem ──────────────────
CREATE OR REPLACE FUNCTION public.tg_nao_promove_agrupador_sem_filha()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  -- Só interessa item VIVO, não-marco, e AGRUPADOR (fase/entrega/pacote).
  IF NEW.is_trashed IS TRUE OR NEW.is_milestone IS TRUE THEN RETURN NEW; END IF;
  IF lower(coalesce(NEW.item_type,'')) NOT IN ('fase','entrega','pacote') THEN RETURN NEW; END IF;

  -- ...indo para uma COLUNA DO QUADRO (visível, não-backlog)?
  IF NOT EXISTS (
    SELECT 1 FROM public.workflow_stages s
     WHERE s.id = NEW.workflow_stage_id
       AND s.is_visible IS DISTINCT FROM false
       AND lower(coalesce(s.categoria::text,'')) <> 'backlog'
  ) THEN RETURN NEW; END IF;

  -- ...com subitem vivo? aí é faixa legítima e passa.
  IF EXISTS (SELECT 1 FROM public.activities f WHERE f.parent_id = NEW.id AND f.is_trashed = false)
  THEN RETURN NEW; END IF;

  RAISE EXCEPTION 'Um agrupador (Fase/Entrega) sem subitens não vira cartão no quadro. Transforme em atividade, ou adicione subitens antes de promover.'
    USING ERRCODE = 'check_violation';
END $fn$;

DROP TRIGGER IF EXISTS trg_nao_promove_agrupador_sem_filha ON public.activities;
CREATE TRIGGER trg_nao_promove_agrupador_sem_filha
  BEFORE INSERT OR UPDATE OF workflow_stage_id, item_type
  ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.tg_nao_promove_agrupador_sem_filha();

-- ── 3) A MÉTRICA: 8 -> 0 ────────────────────────────────────────────────────
DO $conf$
DECLARE v_fora int; v_resta int;
BEGIN
  SELECT count(*) INTO v_fora FROM public.activities a JOIN _alvo t ON t.id=a.id
   WHERE a.item_type <> 'atividade';
  IF v_fora > 0 THEN RAISE EXCEPTION '% dos 8 não viraram atividade', v_fora; END IF;

  SELECT count(*) INTO v_resta FROM public.activities a
    JOIN public.workflow_stages s ON s.id=a.workflow_stage_id
   WHERE a.is_trashed=false AND a.is_milestone=false AND lower(a.item_type) IN ('fase','entrega','pacote')
     AND s.is_visible IS DISTINCT FROM false AND lower(coalesce(s.categoria::text,''))<>'backlog'
     AND NOT EXISTS(SELECT 1 FROM public.activities f WHERE f.parent_id=a.id AND f.is_trashed=false);
  IF v_resta <> 0 THEN
    RAISE EXCEPTION 'ainda restam % agrupador-folha no quadro — os 8 não eram o conjunto todo', v_resta;
  END IF;
  RAISE NOTICE 'agrupador-folha no quadro: 0. As 8 viraram cartao e a trava esta no ar.';
END $conf$;

NOTIFY pgrst, 'reload schema';

-- CONFIRA ACIMA E ENTÃO:  COMMIT;  ou  ROLLBACK;
