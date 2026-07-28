-- Migra as HISTÓRIAS DE USUÁRIO existentes (que têm atividade) para o REGISTRO
-- da atividade (tabela activity_comments), preservando a data original.
--
-- Contexto: "história de usuário" é artefato de metodologia ágil; o fluxo de
-- trabalho é por atividades/EAP. A aba Histórias foi ocultada (featureFlags) e
-- o acompanhamento passou para o Registro da atividade. Esta migration traz o
-- conteúdo já escrito para o novo lugar.
--
-- Segura: COPIA (não move). As histórias originais permanecem em user_stories
-- intactas — nada é apagado aqui. Idempotente: usa um marcador no autor para
-- não duplicar se rodar 2x. Reversível pelo bloco no fim (comentado).
--
-- Rodar NA VM (20.65.208.119), container supabase-db-1:
--   PGPASSWORD=... ./scripts/apply-migrate-user-stories-to-registro.sh

BEGIN;

-- Backup de segurança das histórias antes de qualquer coisa.
CREATE TABLE IF NOT EXISTS public._backup_user_stories_20260727 AS
  SELECT * FROM public.user_stories;

-- Copia cada história COM atividade e NÃO na lixeira para activity_comments.
-- content = "**título**\n\nnarrativa" (narrativa opcional).
-- author  = "História (migrada)" — marcador que garante idempotência.
-- created_at preservado (a entrada aparece na data original no Registro).
INSERT INTO public.activity_comments (activity_id, content, author, created_at, is_trashed)
SELECT
  us.activity_id,
  '**' || coalesce(nullif(btrim(us.title), ''), 'História') || '**'
    || case
         when coalesce(btrim(us.narrative), '') <> '' then E'\n\n' || us.narrative
         else ''
       end
    || case
         when us.image_url is not null then E'\n\n📎 ' || us.image_url
         else ''
       end,
  'História (migrada)',
  us.created_at,
  false
FROM public.user_stories us
WHERE us.activity_id IS NOT NULL
  AND us.is_trashed = false
  -- idempotência: não recria o que já foi migrado para esta atividade.
  AND NOT EXISTS (
    SELECT 1 FROM public.activity_comments ac
    WHERE ac.activity_id = us.activity_id
      AND ac.author = 'História (migrada)'
      AND ac.content LIKE '**' || coalesce(nullif(btrim(us.title), ''), 'História') || '**%'
  );

-- Arquiva (soft-delete) as histórias que foram migradas — recuperáveis, não apagadas.
UPDATE public.user_stories us
SET is_trashed = true, trashed_at = now()
WHERE us.activity_id IS NOT NULL
  AND us.is_trashed = false;

-- Relatório do que foi feito.
DO $$
DECLARE v_copiadas int; v_soltas int;
BEGIN
  SELECT count(*) INTO v_copiadas FROM public.activity_comments WHERE author = 'História (migrada)';
  SELECT count(*) INTO v_soltas FROM public.user_stories WHERE activity_id IS NULL AND is_trashed = false;
  RAISE NOTICE 'Registro: % entradas migradas de histórias.', v_copiadas;
  RAISE NOTICE 'Histórias SOLTAS (sem atividade) preservadas em user_stories: %.', v_soltas;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSÃO (rodar manualmente se precisar desfazer):
--
--   BEGIN;
--   -- remove as entradas criadas por esta migration
--   DELETE FROM public.activity_comments WHERE author = 'História (migrada)';
--   -- desarquiva as histórias (restaura do backup o estado is_trashed anterior)
--   UPDATE public.user_stories us
--     SET is_trashed = b.is_trashed, trashed_at = b.trashed_at
--     FROM public._backup_user_stories_20260727 b
--     WHERE b.id = us.id;
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
