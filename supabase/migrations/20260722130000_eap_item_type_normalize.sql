-- Etapa 1 da hierarquia EAP (PMBOK): normaliza item_type em papéis semânticos
-- e habilita o novo papel "pacote" (Pacote de Trabalho).
--
-- Papéis EAP resultantes:
--   fase            → Fase / Entrega (nível agrupador)
--   pacote          → Pacote de Trabalho (nó controlável; agrupa atividades)
--   atividade       → Trabalho executável (folha)
--   historia_usuario→ fora da EAP (contexto ágil; preservado)
--
-- Marco NÃO é um item_type: continua sendo a flag is_milestone.
--
-- Rodar NA VM (20.65.208.119), container supabase-db-1:
--   PGPASSWORD=... ./scripts/apply-eap-item-type-migration.sh

-- 1) Normaliza os valores de trabalho executável para 'atividade'.
--    Hoje no banco: tarefa (582), atividade (203), subtarefa (155) → todos 'atividade'.
UPDATE public.activities
   SET item_type = 'atividade'
 WHERE item_type IN ('tarefa', 'subtarefa', 'subatividade');

-- 2) Qualquer valor inesperado (fora do conjunto canônico) também vira 'atividade',
--    exceto 'fase', 'pacote' e 'historia_usuario' que são preservados.
UPDATE public.activities
   SET item_type = 'atividade'
 WHERE item_type NOT IN ('fase', 'pacote', 'atividade', 'historia_usuario');

-- 3) CHECK constraint: impede texto livre divergente daqui para frente.
--    Removido antes de recriar para idempotência.
ALTER TABLE public.activities
  DROP CONSTRAINT IF EXISTS activities_item_type_check;

ALTER TABLE public.activities
  ADD CONSTRAINT activities_item_type_check
  CHECK (item_type IN ('fase', 'pacote', 'atividade', 'historia_usuario'));

-- 4) Default coerente para novas linhas.
ALTER TABLE public.activities
  ALTER COLUMN item_type SET DEFAULT 'atividade';

-- Nota sobre wbs_code: NÃO recebe UNIQUE. O mesmo código EAP (ex.: "1.0") existe
-- legitimamente em projetos diferentes. Unicidade por (project_id, wbs_code) fica
-- como validação futura opcional — hoje há duplicatas legadas mesmo dentro de projeto.
