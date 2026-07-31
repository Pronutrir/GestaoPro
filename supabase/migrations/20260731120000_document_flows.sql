-- DOCUMENTOS — CIÊNCIA, APROVAÇÃO E ASSINATURA (fases 1 a 4 do plano).
--
-- Decisão central de modelagem: assinar, aprovar e dar ciência NÃO são três
-- fluxos — são o mesmo participante com um `papel` diferente. É como DocuSign
-- e Clicksign modelam, e é o que permite entregar por etapas sem refazer nada.
--
--   document_flows        — o "envelope": o documento em circulação, com estado
--   document_participants — quem participa, com papel, ordem e a prova do ato
--   document_flow_events  — trilha append-only (o comprovante)
--
-- Base legal (documento INTERNO): MP 2.200-2/2001 art. 10 §2º dispensa
-- certificado ICP-Brasil quando as partes admitem o meio como válido; a Lei
-- 14.063/2020 classifica login+senha como assinatura simples, e um sistema com
-- autenticação + hash + trilha atinge o nível avançado.
--
-- Rodar NA VM: PGPASSWORD=... ./scripts/apply-document-flows.sh

-- ============================================================
-- 1. O FLUXO (envelope)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.document_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.project_documents(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- ciencia | aprovacao | assinatura — define o papel PADRÃO dos participantes
  -- e o vocabulário da tela; a estrutura é a mesma para os três.
  kind text NOT NULL DEFAULT 'ciencia',
  -- rascunho | circulando | concluido | recusado | cancelado
  -- Terminais (concluido/recusado/cancelado) NÃO voltam: precisa mudar? nova
  -- versão, novo fluxo. É essa regra que dá valor probatório à trilha.
  status text NOT NULL DEFAULT 'rascunho',
  title text,
  message text,
  -- Impressão digital do arquivo no momento da circulação (Fase 3): prova que
  -- o documento não mudou depois de assinado.
  file_hash text,
  file_url_snapshot text,
  -- Prazo: só AVISA que atrasou (decisão C) — não fecha sozinho.
  due_date date,
  -- Versão do documento a que este fluxo se refere (Fase 2).
  document_version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  -- Fase 4: vínculo com assinatura externa (Clicksign/D4Sign/ZapSign).
  -- Nasce vazio; quando houver signatário sem conta, é adaptador — não
  -- refatoração.
  external_provider text,
  external_id text
);

CREATE INDEX IF NOT EXISTS document_flows_doc_idx ON public.document_flows(document_id);
CREATE INDEX IF NOT EXISTS document_flows_project_idx ON public.document_flows(project_id, status);

ALTER TABLE public.document_flows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read document_flows" ON public.document_flows;
CREATE POLICY "Members read document_flows" ON public.document_flows
  FOR SELECT TO authenticated
  USING (public.can_view_project_v2(project_id, auth.uid()));

-- Enviar para circular = quem pode editar o projeto (decisão B): admin,
-- líder ou gestor. Mesma regra do orçamento.
DROP POLICY IF EXISTS "Managers write document_flows" ON public.document_flows;
CREATE POLICY "Managers write document_flows" ON public.document_flows
  FOR ALL TO authenticated
  USING (public.can_manage_project_v2(project_id, auth.uid()))
  WITH CHECK (public.can_manage_project_v2(project_id, auth.uid()));

-- ============================================================
-- 2. PARTICIPANTES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.document_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.document_flows(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_name text,
  -- assinante | aprovador | ciencia | observador
  role text NOT NULL DEFAULT 'ciencia',
  -- ORDEM COMO INTEIRO: iguais = paralelo, diferentes = sequencial, misto
  -- funciona naturalmente. Um enum "paralelo|sequencial" não daria conta.
  position integer NOT NULL DEFAULT 1,
  -- Observador não trava a conclusão; os demais papéis sim.
  is_blocking boolean NOT NULL DEFAULT true,
  -- pendente | notificado | visualizado | concluido | recusado
  status text NOT NULL DEFAULT 'pendente',
  notified_at timestamptz,
  viewed_at timestamptz,
  completed_at timestamptz,
  -- Recusa exige motivo (Fase 2).
  refusal_reason text,
  -- PROVA DO ATO (o que dá validade à ciência/assinatura):
  ip text,
  user_agent text,
  -- Clickwrap: guarda o texto EXATO que a pessoa viu ao confirmar. Sem isso,
  -- não há como demonstrar a que ela consentiu.
  accepted_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flow_id, user_id, role)
);

CREATE INDEX IF NOT EXISTS document_participants_flow_idx ON public.document_participants(flow_id, position);
CREATE INDEX IF NOT EXISTS document_participants_user_idx ON public.document_participants(user_id, status);

ALTER TABLE public.document_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read document_participants" ON public.document_participants;
CREATE POLICY "Members read document_participants" ON public.document_participants
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.document_flows f
    WHERE f.id = flow_id AND public.can_view_project_v2(f.project_id, auth.uid())
  ));

-- Gestor do projeto monta a lista de participantes.
DROP POLICY IF EXISTS "Managers manage document_participants" ON public.document_participants;
CREATE POLICY "Managers manage document_participants" ON public.document_participants
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.document_flows f
    WHERE f.id = flow_id AND public.can_manage_project_v2(f.project_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.document_flows f
    WHERE f.id = flow_id AND public.can_manage_project_v2(f.project_id, auth.uid())
  ));

-- ...MAS cada pessoa atualiza a PRÓPRIA linha (é ela quem dá ciência/assina).
DROP POLICY IF EXISTS "Own participation update" ON public.document_participants;
CREATE POLICY "Own participation update" ON public.document_participants
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 3. TRILHA (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.document_flow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.document_flows(id) ON DELETE CASCADE,
  participant_id uuid REFERENCES public.document_participants(id) ON DELETE SET NULL,
  -- criado | enviado | notificado | visualizado | ciencia | aprovado
  -- | assinado | recusado | cancelado | concluido | lembrete
  event_type text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name text,
  ip text,
  user_agent text,
  detail text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_flow_events_flow_idx
  ON public.document_flow_events(flow_id, occurred_at);

ALTER TABLE public.document_flow_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read flow_events" ON public.document_flow_events;
CREATE POLICY "Members read flow_events" ON public.document_flow_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.document_flows f
    WHERE f.id = flow_id AND public.can_view_project_v2(f.project_id, auth.uid())
  ));

-- Só INSERT: a trilha é append-only. Sem UPDATE, sem DELETE — é o que a
-- torna prova. Qualquer membro do projeto pode gerar evento (visualizar,
-- dar ciência, assinar).
DROP POLICY IF EXISTS "Members append flow_events" ON public.document_flow_events;
CREATE POLICY "Members append flow_events" ON public.document_flow_events
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.document_flows f
    WHERE f.id = flow_id AND public.can_view_project_v2(f.project_id, auth.uid())
  ));

-- ============================================================
-- 4. Documento: versão vigente e vínculo com quem subiu (Fase 2)
-- ============================================================
ALTER TABLE public.project_documents
  -- A última versão APROVADA — não a última criada. Uma versão nova em
  -- aprovação não substitui a vigente (regra do SharePoint).
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true,
  -- Agrupa as versões do mesmo documento (v1, v2, v3 apontam para a raiz).
  ADD COLUMN IF NOT EXISTS supersedes_id uuid REFERENCES public.project_documents(id) ON DELETE SET NULL,
  -- "Adicionado por" deixa de ser texto livre: vira vínculo com a pessoa.
  ADD COLUMN IF NOT EXISTS uploaded_by_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
