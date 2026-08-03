-- CENTRAL DE DOCUMENTOS — FASE 1 (corretiva) e base das fases 2 e 5.
--
-- Três problemas reais achados na leitura do código, em ordem de gravidade:
--
-- 1. `project_pages` tem as QUATRO policies com USING (true). Qualquer usuário
--    autenticado lê, cria, edita e apaga páginas de QUALQUER projeto — só a UI
--    filtra por project_id. Todas as demais tabelas do sistema já usam os
--    helpers _v2; esta ficou para trás e é a correção mais urgente aqui.
--
-- 2. Sem FK em project_pages.project_id: apagar um projeto deixava páginas
--    órfãs para sempre.
--
-- 3. Gravação last-write-wins: dois usuários na mesma página e um perde o
--    trabalho, sem aviso e sem histórico para recuperar. A coluna `revision`
--    abaixo permite à UI detectar o conflito antes de sobrescrever.
--
-- Aproveita para preparar a fusão (fase 2) e o versionamento (fase 5):
-- páginas ganham fase/atividade como os arquivos já têm, e ganham a tabela de
-- histórico que hoje não existe em lado nenhum.
--
-- Aditiva e idempotente. Rodar NA VM: PGPASSWORD=... ./scripts/apply-pages-rls.sh

-- ============================================================
-- 1. INTEGRIDADE — FK que faltava
-- ============================================================
-- Limpa órfãs antes de criar a FK, senão o ADD CONSTRAINT falha.
--
-- São páginas cujo projeto já não existe: a UI sempre filtra por project_id,
-- então ninguém as alcança. Ainda assim o apagamento é definitivo, e por isso
-- o número aparece no log em vez de sumir em silêncio — se vier alto, vale
-- parar e conferir antes de seguir com o resto da migration.
DO $$
DECLARE n_orfas integer;
BEGIN
  SELECT count(*) INTO n_orfas FROM public.project_pages p
   WHERE NOT EXISTS (SELECT 1 FROM public.projects pr WHERE pr.id = p.project_id);

  IF n_orfas > 0 THEN
    RAISE NOTICE 'project_pages: apagando % pagina(s) orfa(s) (projeto inexistente)', n_orfas;
  ELSE
    RAISE NOTICE 'project_pages: nenhuma pagina orfa a apagar';
  END IF;
END $$;

DELETE FROM public.project_pages p
WHERE NOT EXISTS (SELECT 1 FROM public.projects pr WHERE pr.id = p.project_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_pages_project_id_fkey'
  ) THEN
    ALTER TABLE public.project_pages
      ADD CONSTRAINT project_pages_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 2. COLUNAS — fusão (fase 2) e detecção de conflito (fase 1)
-- ============================================================
ALTER TABLE public.project_pages
  -- Vínculo com fase/atividade: o arquivo já tinha, a página não. Sem isso a
  -- lista unificada não consegue agrupar os dois tipos lado a lado.
  ADD COLUMN IF NOT EXISTS phase_id uuid REFERENCES public.phases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL,
  -- Contador que sobe a cada gravação. A UI compara o que carregou com o que
  -- está no banco: diferente = outra pessoa salvou no meio do caminho.
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_name text;

CREATE INDEX IF NOT EXISTS project_pages_phase_idx ON public.project_pages(phase_id);
CREATE INDEX IF NOT EXISTS project_pages_activity_idx ON public.project_pages(activity_id);

-- ============================================================
-- 3. RLS DE VERDADE — o defeito grave
-- ============================================================
ALTER TABLE public.project_pages ENABLE ROW LEVEL SECURITY;

-- Derruba TODAS as policies antigas da tabela, inclusive as USING(true) cujos
-- nomes variam entre ambientes. Sem isso, uma policy permissiva sobrevivente
-- anula as novas (policies são OR entre si).
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'project_pages'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.project_pages', pol.policyname);
  END LOOP;
END $$;

-- Ler: quem enxerga o projeto. Mesma regra de toda tabela de projeto.
CREATE POLICY "Members read project_pages" ON public.project_pages
  FOR SELECT TO authenticated
  USING (public.can_view_project_v2(project_id, auth.uid()));

-- Escrever: qualquer membro do projeto. Documento é trabalho colaborativo —
-- restringir a criação de página a gestor mataria o uso. A governança fica no
-- fluxo de assinatura (fase 3), não no ato de escrever.
CREATE POLICY "Members create project_pages" ON public.project_pages
  FOR INSERT TO authenticated
  WITH CHECK (public.can_view_project_v2(project_id, auth.uid()));

CREATE POLICY "Members update project_pages" ON public.project_pages
  FOR UPDATE TO authenticated
  USING (public.can_view_project_v2(project_id, auth.uid()))
  WITH CHECK (public.can_view_project_v2(project_id, auth.uid()));

-- Apagar exige gestão: excluir documento do projeto não é ato de rotina.
CREATE POLICY "Managers delete project_pages" ON public.project_pages
  FOR DELETE TO authenticated
  USING (public.can_manage_project_v2(project_id, auth.uid()));

-- ============================================================
-- 4. HISTÓRICO DE VERSÕES (base da fase 5)
-- ============================================================
-- Uma linha por gravação consolidada. Append-only por RLS: histórico que pode
-- ser editado não é histórico.
CREATE TABLE IF NOT EXISTS public.page_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.project_pages(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  title text,
  content jsonb NOT NULL,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name text,
  -- 'auto' (gravação normal) | 'manual' | 'restauracao'
  origin text NOT NULL DEFAULT 'auto',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, revision)
);

CREATE INDEX IF NOT EXISTS page_versions_page_idx
  ON public.page_versions(page_id, revision DESC);

ALTER TABLE public.page_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read page_versions" ON public.page_versions;
CREATE POLICY "Members read page_versions" ON public.page_versions
  FOR SELECT TO authenticated
  USING (public.can_view_project_v2(project_id, auth.uid()));

DROP POLICY IF EXISTS "Members insert page_versions" ON public.page_versions;
CREATE POLICY "Members insert page_versions" ON public.page_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.can_view_project_v2(project_id, auth.uid()));
-- Sem UPDATE e sem DELETE de propósito: restaurar cria uma versão NOVA.

-- ============================================================
-- 5. FLUXO DE ASSINATURA TAMBÉM PARA PÁGINA ESCRITA (fase 3)
-- ============================================================
-- Hoje document_flows.document_id aponta só para project_documents, então o
-- que é escrito aqui não circula. Em vez de duplicar o fluxo inteiro, o
-- envelope passa a aceitar QUALQUER um dos dois alvos — a estrutura de
-- participantes, ordem e trilha continua idêntica.
ALTER TABLE public.document_flows
  ADD COLUMN IF NOT EXISTS page_id uuid REFERENCES public.project_pages(id) ON DELETE CASCADE;

-- document_id era NOT NULL; com página, ele fica vazio.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'document_flows'
      AND column_name = 'document_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.document_flows ALTER COLUMN document_id DROP NOT NULL;
  END IF;
END $$;

-- Exatamente um alvo: ou arquivo, ou página. Nunca os dois, nunca nenhum.
-- Guarda tambem contra a versao v2 (criada em 20260801140000_tap_flow): se o
-- TAP ja rodou, esta constraint foi substituida pela de 3 alvos. Recria-la
-- aqui, numa reaplicacao, rejeitaria todo fluxo de TAP em silencio.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname IN ('document_flows_one_target', 'document_flows_one_target_v2')
  ) THEN
    ALTER TABLE public.document_flows
      ADD CONSTRAINT document_flows_one_target
      CHECK ((document_id IS NOT NULL) <> (page_id IS NOT NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS document_flows_page_idx ON public.document_flows(page_id);

-- ============================================================
-- 6. VERSIONAMENTO DE ARQUIVO — ligando as colunas órfãs
-- ============================================================
-- is_current, supersedes_id e uploaded_by_id foram criadas na migration do
-- fluxo e nunca conectadas a nada. O índice abaixo é o que torna a consulta
-- "só os documentos vigentes" barata quando a fase 5 usar as colunas.
CREATE INDEX IF NOT EXISTS project_documents_current_idx
  ON public.project_documents(project_id, is_current)
  WHERE is_trashed = false;

-- Backfill defensivo: linhas antigas nasceram antes da coluna existir.
UPDATE public.project_documents SET is_current = true WHERE is_current IS NULL;

-- ============================================================
-- 7. VERIFICAÇÃO
-- ============================================================
DO $$
DECLARE
  n_permissive integer;
  n_policies integer;
BEGIN
  SELECT count(*) INTO n_policies FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'project_pages';
  SELECT count(*) INTO n_permissive FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'project_pages'
     AND coalesce(qual, '') = 'true';

  RAISE NOTICE 'project_pages: % policies, % permissivas (esperado 4 e 0)',
    n_policies, n_permissive;

  IF n_permissive > 0 THEN
    RAISE EXCEPTION 'Ainda existe policy USING(true) em project_pages';
  END IF;
END $$;
