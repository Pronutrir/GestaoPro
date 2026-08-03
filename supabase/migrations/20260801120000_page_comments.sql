-- CENTRAL DE DOCUMENTOS — FASE 3: comentários e menções na página escrita.
--
-- O editor não tinha nenhuma forma de conversa: para comentar um trecho de uma
-- ata, a pessoa mandava mensagem por fora e a discussão se perdia do documento.
-- É o recurso que aproxima o módulo do Word e do Google Docs.
--
-- Modelagem: o comentário guarda uma ÂNCORA (`anchor_text`), não uma posição.
-- Posição em documento editável envelhece a cada parágrafo inserido acima;
-- o texto citado sobrevive à edição e, se o trecho for apagado, o comentário
-- fica órfão de forma visível em vez de apontar para o lugar errado.
--
-- Rodar NA VM: PGPASSWORD=... ./scripts/apply-page-comments.sh

CREATE TABLE IF NOT EXISTS public.page_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.project_pages(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- Resposta a outro comentário: é o que forma a conversa (thread).
  parent_id uuid REFERENCES public.page_comments(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name text,
  body text NOT NULL,
  -- Trecho comentado, copiado no momento do comentário. Ver nota acima.
  anchor_text text,
  -- Resolvido some da vista por padrão, mas NÃO é apagado: a decisão de por
  -- que algo mudou costuma valer mais que o texto final.
  resolved boolean NOT NULL DEFAULT false,
  resolved_by_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  -- Pessoas citadas com @ neste comentário; cada uma recebe notificação.
  mentions uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS page_comments_page_idx
  ON public.page_comments(page_id, created_at);
CREATE INDEX IF NOT EXISTS page_comments_open_idx
  ON public.page_comments(page_id) WHERE resolved = false;

ALTER TABLE public.page_comments ENABLE ROW LEVEL SECURITY;

-- Ler: quem enxerga o projeto.
DROP POLICY IF EXISTS "Members read page_comments" ON public.page_comments;
CREATE POLICY "Members read page_comments" ON public.page_comments
  FOR SELECT TO authenticated
  USING (public.can_view_project_v2(project_id, auth.uid()));

-- Comentar: qualquer membro. Comentário é participação, não gestão.
DROP POLICY IF EXISTS "Members create page_comments" ON public.page_comments;
CREATE POLICY "Members create page_comments" ON public.page_comments
  FOR INSERT TO authenticated
  WITH CHECK (public.can_view_project_v2(project_id, auth.uid()));

-- Editar/resolver: o autor, ou quem gerencia o projeto. Sem isso, um
-- comentário mal formulado ficaria preso para sempre.
DROP POLICY IF EXISTS "Author or manager update page_comments" ON public.page_comments;
CREATE POLICY "Author or manager update page_comments" ON public.page_comments
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.can_manage_project_v2(project_id, auth.uid()))
  WITH CHECK (author_id = auth.uid() OR public.can_manage_project_v2(project_id, auth.uid()));

DROP POLICY IF EXISTS "Author or manager delete page_comments" ON public.page_comments;
CREATE POLICY "Author or manager delete page_comments" ON public.page_comments
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.can_manage_project_v2(project_id, auth.uid()));

-- updated_at automático, mesmo trigger usado no resto do schema.
DROP TRIGGER IF EXISTS update_page_comments_updated_at ON public.page_comments;
CREATE TRIGGER update_page_comments_updated_at
  BEFORE UPDATE ON public.page_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$
BEGIN
  RAISE NOTICE 'page_comments criada com RLS v2 (ler: membro; editar/resolver: autor ou gestor).';
END $$;
