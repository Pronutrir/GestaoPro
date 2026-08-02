-- CONVERSA DA ATIVIDADE — anexo, resposta, reação e registro de edição.
--
-- `activity_comments` guardava só texto: content, author e data. Para discutir
-- trabalho de verdade falta o que a conversa de uma tarefa exige — mostrar a
-- tela ("quebrou aqui, olha o print"), responder a um ponto específico quando
-- várias pessoas escrevem, e concordar sem gerar mais uma mensagem.
--
-- Tudo ADITIVO e opcional: comentário antigo continua válido sem nenhum destes
-- campos, e a tela degrada quando as colunas ainda não existem.
--
-- Rodar NA VM: PGPASSWORD=... ./scripts/apply-comments-rich.sh

-- ============================================================
-- 1. COLUNAS
-- ============================================================
ALTER TABLE public.activity_comments
  -- [{ url, path, name, type, size }] — imagem aparece na conversa, outros
  -- tipos viram anexo clicável. jsonb em vez de tabela à parte: anexo não tem
  -- vida própria fora da mensagem, e a lista é sempre lida junto com ela.
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Resposta a outra mensagem. ON DELETE SET NULL de propósito: apagar a
  -- mensagem citada não pode apagar a resposta — a resposta continua sendo
  -- conteúdo de alguém.
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.activity_comments(id) ON DELETE SET NULL,

  -- { "👍": ["uuid", ...] } — quem reagiu, não só quantos. Sem a lista não dá
  -- para saber se você já reagiu, nem para desfazer.
  ADD COLUMN IF NOT EXISTS reactions jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Carimbo que sustenta o "editada". Hoje dá para reescrever uma mensagem sem
  -- deixar marca — numa conversa que decide trabalho, isso é problema.
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

CREATE INDEX IF NOT EXISTS activity_comments_reply_idx
  ON public.activity_comments(reply_to_id) WHERE reply_to_id IS NOT NULL;

-- ============================================================
-- 2. BUCKET PRIVADO
-- ============================================================
-- Privado, como o dos documentos: um print de tarefa pode ter dado de cliente,
-- e em bucket público a URL vira a credencial — quem tiver o link vê, sem
-- passar por permissão nenhuma.
INSERT INTO storage.buckets (id, name, public)
VALUES ('activity-attachments', 'activity-attachments', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Caminho: {project_id}/{timestamp}-{aleatorio}.{ext}
-- A primeira pasta é o id do projeto, e é ela que amarra o anexo à permissão.
DROP POLICY IF EXISTS "Members read activity-attachments" ON storage.objects;
CREATE POLICY "Members read activity-attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'activity-attachments'
    AND public.can_view_project_v2((storage.foldername(name))[1]::uuid, auth.uid())
  );

DROP POLICY IF EXISTS "Members upload activity-attachments" ON storage.objects;
CREATE POLICY "Members upload activity-attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'activity-attachments'
    AND public.can_view_project_v2((storage.foldername(name))[1]::uuid, auth.uid())
  );

-- Apagar exige gestão do projeto: o anexo é prova do que foi discutido.
DROP POLICY IF EXISTS "Managers delete activity-attachments" ON storage.objects;
CREATE POLICY "Managers delete activity-attachments" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'activity-attachments'
    AND public.can_manage_project_v2((storage.foldername(name))[1]::uuid, auth.uid())
  );

-- ============================================================
-- 3. VERIFICAÇÃO
-- ============================================================
DO $$
DECLARE
  n_cols integer;
  n_bucket integer;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'activity_comments'
     AND column_name IN ('attachments', 'reply_to_id', 'reactions', 'edited_at');

  SELECT count(*) INTO n_bucket FROM storage.buckets WHERE id = 'activity-attachments';

  RAISE NOTICE 'activity_comments: % de 4 colunas | bucket: %', n_cols, n_bucket;

  IF n_cols <> 4 OR n_bucket <> 1 THEN
    RAISE EXCEPTION 'Migration da conversa incompleta';
  END IF;
END $$;
