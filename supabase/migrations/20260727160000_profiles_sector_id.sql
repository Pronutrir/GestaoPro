-- Vincula profiles ao setor por ID (FK), no lugar do texto livre.
--
-- Hoje profiles.sector é TEXTO (o nome do setor). Renomear um setor em Estrutura
-- NÃO atualizava as pessoas. Esta migration adiciona profiles.sector_id → sectors.id
-- e faz o backfill casando pelo nome (sectors.name é UNIQUE).
--
-- A coluna antiga `sector` (texto) é MANTIDA por ora para não quebrar o código
-- que ainda a lê; será removida numa migration futura após a UI migrar de vez.
-- Um trigger mantém as duas em sincronia durante a transição.
--
-- Reversível: DROP da coluna/trigger no fim (comentado).
--
-- Rodar NA VM (20.65.208.119), container supabase-db-1:
--   PGPASSWORD=... ./scripts/apply-profiles-sector-id.sh

-- 1) Coluna FK (setor pode ficar nulo; ao excluir o setor, vira NULL).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL;

-- 2) Backfill: casa profiles.sector (nome) com sectors.name (case-insensitive,
--    ignorando espaços). Só preenche onde ainda está nulo.
UPDATE public.profiles p
SET sector_id = s.id
FROM public.sectors s
WHERE p.sector_id IS NULL
  AND p.sector IS NOT NULL
  AND lower(btrim(p.sector)) = lower(btrim(s.name));

-- 3) Cria setores que existiam só como texto em profiles mas não na tabela
--    sectors (evita perder o vínculo). Depois refaz o backfill desses.
INSERT INTO public.sectors (name)
SELECT DISTINCT btrim(p.sector)
FROM public.profiles p
WHERE p.sector IS NOT NULL AND btrim(p.sector) <> ''
  AND p.sector_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.sectors s WHERE lower(btrim(s.name)) = lower(btrim(p.sector))
  )
ON CONFLICT (name) DO NOTHING;

UPDATE public.profiles p
SET sector_id = s.id
FROM public.sectors s
WHERE p.sector_id IS NULL
  AND p.sector IS NOT NULL
  AND lower(btrim(p.sector)) = lower(btrim(s.name));

-- 4) Trigger de sincronização durante a transição:
--    - se sector_id muda, atualiza o texto sector com o nome do setor;
--    - se só o texto muda (código legado), tenta resolver o sector_id pelo nome.
CREATE OR REPLACE FUNCTION public.sync_profile_sector()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sector_id IS DISTINCT FROM OLD.sector_id THEN
    SELECT name INTO NEW.sector FROM public.sectors WHERE id = NEW.sector_id;
  ELSIF NEW.sector IS DISTINCT FROM OLD.sector THEN
    SELECT id INTO NEW.sector_id FROM public.sectors
    WHERE lower(btrim(name)) = lower(btrim(NEW.sector));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_profile_sector ON public.profiles;
CREATE TRIGGER trg_sync_profile_sector
  BEFORE UPDATE OF sector, sector_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_sector();

-- ---------------------------------------------------------------------------
-- ROLLBACK (manual):
--   DROP TRIGGER IF EXISTS trg_sync_profile_sector ON public.profiles;
--   DROP FUNCTION IF EXISTS public.sync_profile_sector();
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS sector_id;
-- ---------------------------------------------------------------------------
