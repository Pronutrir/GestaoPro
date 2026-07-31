-- TAP COMO ATO FORMAL — fases 1 a 3.
--
-- Hoje "Aprovar TAP" grava três chaves num JSONB e mostra um toast. Não valida
-- campo, não registra quem aprovou além do nome, não avisa ninguém, e o
-- "bloqueio" é só de UI: qualquer gestor reabre e apaga o carimbo sem deixar
-- rastro. Ao lado disso existe um motor de assinatura completo (document_flows)
-- construído para arquivos e páginas, e nunca ligado ao TAP.
--
-- Esta migration liga os dois e dá ao TAP o que falta: versões imutáveis e
-- notificação de verdade.
--
-- Decisões embutidas (com os números do banco que as sustentam):
--
--  * QUEM APROVA: quem foi designado no fluxo. Hoje 7 pessoas (3 admin +
--    4 gestor, de 23) aprovam o TAP de QUALQUER projeto sem serem parte dele.
--  * SPONSOR: continua texto livre, NÃO vira papel obrigatório — 0 de 25
--    projetos têm sponsor preenchido, então exigir isso travaria todos.
--    O fluxo aceita qualquer pessoa como aprovador.
--  * TRAVA O PROJETO: não. O TAP registra, não bloqueia. Travar pararia 25
--    projetos em andamento por um documento que nunca foi usado. Vira gate
--    depois, se quiserem — o contrário custa caro.
--  * REABRIR: exige nova rodada. Sem isso a assinatura não vale nada.
--
-- Aditiva e idempotente. Rodar NA VM: PGPASSWORD=... ./scripts/apply-tap-flow.sh
-- DEPENDE de 20260731120000_document_flows.sql e 20260801100000_pages_rls...

-- ============================================================
-- 1. TERCEIRO ALVO DO ENVELOPE: O PRÓPRIO TAP
-- ============================================================
-- Mesma cirurgia que a migration de páginas já fez uma vez. Coluna dedicada
-- (não um target_type/target_id genérico) para manter FK real e cascade real —
-- é o que protege a trilha de auditoria.
ALTER TABLE public.document_flows
  ADD COLUMN IF NOT EXISTS charter_project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- A constraint antiga exigia exatamente um entre arquivo e página. Passa a
-- aceitar exatamente um entre os TRÊS.
ALTER TABLE public.document_flows DROP CONSTRAINT IF EXISTS document_flows_one_target;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_flows_one_target_v2'
  ) THEN
    ALTER TABLE public.document_flows
      ADD CONSTRAINT document_flows_one_target_v2
      CHECK (
        (CASE WHEN document_id       IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN page_id           IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN charter_project_id IS NOT NULL THEN 1 ELSE 0 END) = 1
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS document_flows_charter_idx
  ON public.document_flows(charter_project_id);

-- ============================================================
-- 2. VERSÕES DO TAP — append-only
-- ============================================================
-- Cada aprovação/reabertura vira uma versão imutável. Hoje reabrir apaga
-- approved_at/approved_by e ninguém fica sabendo que houve um TAP aprovado
-- antes, nem com que conteúdo.
CREATE TABLE IF NOT EXISTS public.project_charter_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version integer NOT NULL,
  -- Cópia integral do charter_data no momento do ato: é o que foi assinado.
  snapshot jsonb NOT NULL,
  -- SHA-256 do conteúdo, para provar que a versão não mudou depois.
  content_hash text,
  -- 'enviado' | 'aprovado' | 'recusado' | 'reaberto'
  event text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version, event)
);

CREATE INDEX IF NOT EXISTS charter_versions_project_idx
  ON public.project_charter_versions(project_id, version DESC);

ALTER TABLE public.project_charter_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read charter_versions" ON public.project_charter_versions;
CREATE POLICY "Members read charter_versions" ON public.project_charter_versions
  FOR SELECT TO authenticated
  USING (public.can_view_project_v2(project_id, auth.uid()));

DROP POLICY IF EXISTS "Members insert charter_versions" ON public.project_charter_versions;
CREATE POLICY "Members insert charter_versions" ON public.project_charter_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.can_view_project_v2(project_id, auth.uid()));
-- Sem UPDATE e sem DELETE de propósito: histórico que pode ser editado não é
-- histórico. Reabrir gera uma versão NOVA.

-- ============================================================
-- 3. ESTADO DO TAP — coluna de verdade
-- ============================================================
-- Antes o estado era derivado de charter_data->>'approved_at' ser nulo ou não:
-- só existiam "rascunho" e "aprovado", sem lugar para "em aprovação".
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS charter_status text NOT NULL DEFAULT 'rascunho',
  ADD COLUMN IF NOT EXISTS charter_version integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_charter_status_check') THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_charter_status_check
      CHECK (charter_status IN ('rascunho', 'em_aprovacao', 'aprovado', 'recusado'));
  END IF;
END $$;

-- Backfill: TAP que já tinha carimbo nasce 'aprovado'; o resto, 'rascunho'.
UPDATE public.projects
SET charter_status = 'aprovado'
WHERE charter_data ? 'approved_at'
  AND charter_data->>'approved_at' IS NOT NULL
  AND charter_status = 'rascunho';

-- ============================================================
-- 4. NOTIFICAÇÃO DO FLUXO — a lacuna que já existe hoje
-- ============================================================
-- O participante nasce com status 'notificado', mas isso é só um RÓTULO:
-- nenhuma linha em notifications é criada por nenhum caminho do código. Quem
-- precisa assinar só descobre se abrir a aba do projeto por conta própria.
-- Isso vale para documentos e páginas também, não só para o TAP.
--
-- notify_flow_participants avisa QUEM ESTÁ NA VEZ (menor position pendente
-- entre os bloqueantes) — os demais são avisados quando a vez chegar.
CREATE OR REPLACE FUNCTION public.notify_flow_participants(_flow_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flow      record;
  v_pos       integer;
  v_title     text;
  v_kind      text;
  v_inserted  integer := 0;
BEGIN
  SELECT * INTO v_flow FROM public.document_flows WHERE id = _flow_id;
  IF NOT FOUND OR v_flow.status <> 'circulando' THEN RETURN 0; END IF;

  -- Posição corrente: menor position ainda não resolvida entre os que bloqueiam.
  SELECT min(position) INTO v_pos
  FROM public.document_participants
  WHERE flow_id = _flow_id
    AND is_blocking = true
    AND status NOT IN ('concluido', 'recusado');

  IF v_pos IS NULL THEN RETURN 0; END IF;

  v_kind := coalesce(v_flow.kind, 'ciencia');
  v_title := coalesce(v_flow.title, 'documento');

  INSERT INTO public.notifications (target_user_id, project_id, type, title, message)
  SELECT
    p.user_id,
    v_flow.project_id,
    'flow_pending',
    CASE v_kind
      WHEN 'assinatura' THEN 'Assinatura pendente: ' || v_title
      WHEN 'aprovacao'  THEN 'Aprovação pendente: '  || v_title
      ELSE 'Ciência pendente: ' || v_title
    END,
    coalesce(v_flow.created_by_name, 'Alguém') || ' enviou para você.'
      || CASE WHEN v_flow.due_date IS NOT NULL
              THEN ' Prazo: ' || to_char(v_flow.due_date, 'DD/MM/YYYY') || '.'
              ELSE '' END
  FROM public.document_participants p
  WHERE p.flow_id = _flow_id
    AND p.position = v_pos
    AND p.is_blocking = true
    AND p.status NOT IN ('concluido', 'recusado')
    AND p.user_id IS NOT NULL
    -- Não repete o aviso da mesma vez em 24h.
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.target_user_id = p.user_id
        AND n.type = 'flow_pending'
        AND n.project_id = v_flow.project_id
        AND n.created_at > now() - interval '24 hours'
    );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Marca como notificado de fato (antes o rótulo era gravado sem aviso algum).
  UPDATE public.document_participants
  SET status = 'notificado', notified_at = now()
  WHERE flow_id = _flow_id AND position = v_pos AND status = 'pendente';

  RETURN v_inserted;
END $$;

GRANT EXECUTE ON FUNCTION public.notify_flow_participants(uuid) TO authenticated;

-- Avança sozinho: quando alguém conclui, a próxima posição é avisada. Sem isto
-- a ordem sequencial é decorativa — todos nascem "notificado" e ninguém recebe.
CREATE OR REPLACE FUNCTION public.on_participant_resolved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'concluido' AND coalesce(OLD.status, '') <> 'concluido' THEN
    PERFORM public.notify_flow_participants(NEW.flow_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_participant_resolved ON public.document_participants;
CREATE TRIGGER trg_participant_resolved
  AFTER UPDATE ON public.document_participants
  FOR EACH ROW EXECUTE FUNCTION public.on_participant_resolved();

-- ============================================================
-- 5. VERIFICAÇÃO
-- ============================================================
DO $$
DECLARE
  n_alvo integer;
  n_ver  integer;
  n_fn   integer;
BEGIN
  SELECT count(*) INTO n_alvo FROM information_schema.columns
   WHERE table_schema='public' AND table_name='document_flows'
     AND column_name='charter_project_id';
  SELECT count(*) INTO n_ver FROM information_schema.tables
   WHERE table_schema='public' AND table_name='project_charter_versions';
  SELECT count(*) INTO n_fn FROM pg_proc
   WHERE proname='notify_flow_participants';

  RAISE NOTICE 'charter_project_id: % | project_charter_versions: % | notify_flow_participants: %',
    n_alvo, n_ver, n_fn;

  IF n_alvo = 0 OR n_ver = 0 OR n_fn = 0 THEN
    RAISE EXCEPTION 'Migration do TAP incompleta';
  END IF;
END $$;
