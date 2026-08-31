-- EAP — unifica os papéis para o modelo de 3 tipos usado na interface:
--   Fase/Entrega (agrupa, em qualquer nível) · Atividade (folha) · Marco (folha).
--
-- Contexto: a UI deixou de oferecer "Pacote" como tipo. Todo AGRUPADOR passa a
-- ser 'fase' (Fase/Entrega). 'pacote' continua ACEITO pelo banco (compat), mas
-- os dados existentes são reclassificados para 'fase' para ficarem coerentes com
-- o que o usuário vê. O trigger de aninhamento (…160000) já trata 'fase' e
-- 'pacote' como agrupadores, então esta migração não viola nenhuma regra.
--
-- Classificação (por posição na árvore + is_milestone):
--   - tem filhos            -> 'fase'       (agrupador, qualquer nível)
--   - is_milestone          -> 'atividade'  (marco: o papel é a flag, não o tipo)
--   - folha                 -> 'atividade'
--   - historia_usuario      -> preservado   (fora da EAP; contexto ágil)
--
-- REVERSÍVEL: guarda o item_type anterior em item_type_prev_eap_unify. O rollback
-- está no fim do arquivo (comentado).
--
-- Idempotente: rodar de novo não causa efeito colateral (o backup só é gravado
-- na primeira execução, quando a coluna ainda não existe).
--
-- Rodar NA VM (20.65.208.119), container supabase-db-1:
--   PGPASSWORD=... ./scripts/apply-eap-three-roles-unify.sh

-- 1) Garante que o CHECK aceita 'fase' (e mantém 'pacote' legado + valores atuais).
ALTER TABLE public.activities
  DROP CONSTRAINT IF EXISTS activities_item_type_check;
ALTER TABLE public.activities
  ADD CONSTRAINT activities_item_type_check
  -- Mantem fechado nos 4 valores normalizados por 20260722130000/20260722150000.
  -- Reabrir 'tarefa'/'subtarefa' deixaria a UI regravar tipos que eap_is_group
  -- trata como folha, desfazendo a normalizacao em silencio.
  CHECK (item_type IN ('fase', 'pacote', 'atividade', 'historia_usuario'));

-- 2) Backup do tipo anterior (só cria a coluna se ainda não existir — preserva o
--    valor original mesmo que a migração rode mais de uma vez).
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS item_type_prev_eap_unify text;

-- Os backfills abaixo tocam atividades de projetos ja concluidos, e o trigger
-- trg_prevent_activity_mutation_on_concluded_project (20260526150000) aborta
-- qualquer UPDATE nessas linhas. Como isto e correcao de esquema, e nao edicao
-- de usuario, desligamos os triggers pela duracao do backfill.
SET session_replication_role = replica;

UPDATE public.activities
SET item_type_prev_eap_unify = item_type
WHERE item_type_prev_eap_unify IS NULL;

-- 3) Reclassifica para os 3 papéis. Um CTE identifica quem tem filhos.
WITH parents AS (
  SELECT DISTINCT parent_id AS id
  FROM public.activities
  WHERE parent_id IS NOT NULL
)
UPDATE public.activities a
SET item_type = CASE
  -- historia_usuario permanece (fora da EAP)
  WHEN a.item_type = 'historia_usuario' THEN a.item_type
  -- marco é sempre folha
  WHEN a.is_milestone THEN 'atividade'
  -- agrupador (tem filhos) -> Fase/Entrega, em qualquer nível
  WHEN a.id IN (SELECT id FROM parents) THEN 'fase'
  -- folha
  ELSE 'atividade'
END
WHERE a.item_type <> 'historia_usuario';

-- Religa os triggers de negocio.
SET session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- ROLLBACK (executar manualmente se necessário — restaura o tipo anterior):
--
--   UPDATE public.activities
--   SET item_type = item_type_prev_eap_unify
--   WHERE item_type_prev_eap_unify IS NOT NULL;
--
--   ALTER TABLE public.activities DROP COLUMN IF EXISTS item_type_prev_eap_unify;
-- ---------------------------------------------------------------------------
