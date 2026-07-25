-- Migration MÍNIMA e isolada: faz o CHECK de activities.item_type aceitar 'pacote'.
-- NÃO normaliza dados, NÃO cria trigger, NÃO impõe regra de aninhamento — só
-- destrava o novo papel EAP "Pacote" para poder ser gravado.
--
-- Rodar NA VM (20.65.208.119), container supabase-db-1:
--   PGPASSWORD=... ./scripts/apply-item-type-allow-pacote.sh

-- 1) Remove QUALQUER check constraint existente sobre item_type em activities
--    (o nome pode variar por ambiente; descobrimos pelo catálogo).
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'activities'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%item_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.activities DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- 2) Recria um CHECK permissivo que inclui 'pacote' e mantém os valores legados
--    (para não invalidar nenhum dado atual: tarefa/subtarefa ainda existem).
ALTER TABLE public.activities
  ADD CONSTRAINT activities_item_type_check
  CHECK (item_type IN (
    'atividade', 'tarefa', 'subtarefa', 'fase', 'pacote', 'historia_usuario'
  ));
