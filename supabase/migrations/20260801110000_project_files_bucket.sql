-- CENTRAL DE DOCUMENTOS — FASE 2: upload de verdade.
--
-- Hoje a aba Documentos NÃO aceita arquivo: o campo "URL do documento" é um
-- input de texto onde a pessoa cola um link. Quem sobe arquivo de verdade é o
-- card do Kanban, no bucket `csc-attachments`.
--
-- Este bucket é PRIVADO, ao contrário de todos os outros do sistema
-- (avatars, csc-attachments, page-images e user-story-images são públicos).
-- A razão é específica deste caso: aqui circulam contratos, termos de aceite e
-- documentos assinados. Num bucket público, a URL é a credencial — quem
-- receber o link lê o arquivo mesmo sem ser membro do projeto, e o fluxo de
-- assinatura perde o sentido. O acesso passa a exigir sessão, e o download é
-- feito por URL assinada de validade curta.
--
-- Rodar NA VM: PGPASSWORD=... ./scripts/apply-project-files.sh

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-files', 'project-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Caminho: {project_id}/{timestamp}-{aleatorio}.{ext}
-- A primeira pasta é o id do projeto, e é isso que amarra o arquivo à
-- permissão: só quem enxerga o projeto lê o binário.
DROP POLICY IF EXISTS "Members read project-files" ON storage.objects;
CREATE POLICY "Members read project-files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-files'
    AND public.can_view_project_v2((storage.foldername(name))[1]::uuid, auth.uid())
  );

DROP POLICY IF EXISTS "Members upload project-files" ON storage.objects;
CREATE POLICY "Members upload project-files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-files'
    AND public.can_view_project_v2((storage.foldername(name))[1]::uuid, auth.uid())
  );

DROP POLICY IF EXISTS "Members update project-files" ON storage.objects;
CREATE POLICY "Members update project-files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-files'
    AND public.can_view_project_v2((storage.foldername(name))[1]::uuid, auth.uid())
  );

-- Apagar arquivo exige gestão, igual à exclusão do registro do documento.
DROP POLICY IF EXISTS "Managers delete project-files" ON storage.objects;
CREATE POLICY "Managers delete project-files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-files'
    AND public.can_manage_project_v2((storage.foldername(name))[1]::uuid, auth.uid())
  );

-- Guarda o caminho no storage separado da URL. `file_url` continua existindo
-- para os documentos antigos que são links externos; quando `storage_path`
-- está preenchido, a UI pede uma URL assinada em vez de usar a pública.
ALTER TABLE public.project_documents
  ADD COLUMN IF NOT EXISTS storage_path text;

DO $$
BEGIN
  RAISE NOTICE 'Bucket project-files criado como PRIVADO (public = false).';
END $$;
