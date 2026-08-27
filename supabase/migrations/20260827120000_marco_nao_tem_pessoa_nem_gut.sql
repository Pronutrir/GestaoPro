-- MARCO NAO TEM RESPONSAVEL NEM GUT — a protecao desce para o banco
--
-- ============================================================================
-- O ARGUMENTO E O PROPRIO NUMERO
--
-- A auditoria de 27/08 separou os campos do marco em dois grupos, e a diferenca
-- entre eles nao e de opiniao:
--
--   O QUE O BANCO PROTEGE          O QUE SO A TELA PROTEGIA
--   wbs_code .......... 0 sujos    assigned_to ....... 60 sujos
--   filhas ............ 0 sujos    gravity/urgency/tendency ... 3
--   horas ............. 0 sujos    priority_score .... 3
--   custo ............. 0 sujos
--
-- Zero contra sessenta. A tela parou de oferecer esses campos ontem (commit
-- 6ace54d), mas tela que para de oferecer nao limpa o que ja entrou — e nada
-- impede a proxima via de escrita (importacao, API, agente de IA) de gravar de
-- novo.
--
-- ============================================================================
-- ALCANCE REAL: 60 LINHAS, NAO 11
--
-- As 11 sao as VIVAS. Ha 49 marcos na lixeira igualmente sujos, e lixeira nao e
-- destino final: restaurar um deles devolveria o dado sujo. Limpar so o vivo
-- seria consertar a metade que da para ver.
--
-- Contado em 27/08/2026, direto da tabela:
--
--   marcos na tabela ... 220   (57 vivos, 163 na lixeira)
--   sujos .............. 60    (11 vivos, 49 na lixeira)
--   com assigned_to .... 60
--   com GUT ............ 3     (subconjunto dos 60, nao soma)
--
-- ROLLBACK: 20260827120001 — devolve os valores a partir da sombra.
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 1) A sombra, ANTES de limpar
--
-- Sem ela, "limpar" e perder. O responsavel de um marco pode ter sido posto de
-- proposito por alguem que usava o campo como "quem confirma" — e essa pessoa
-- precisa poder ser recuperada, ainda que o campo saia.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS marco_limpeza_backup jsonb;

COMMENT ON COLUMN public.activities.marco_limpeza_backup IS
  'O que a migration 20260827120000 apagou de um marco (responsavel, GUT). Existe para reverter e para responder "quem estava aqui antes?". Nunca reescrita depois.';

UPDATE public.activities
   SET marco_limpeza_backup = jsonb_strip_nulls(jsonb_build_object(
         'assigned_to',    assigned_to,
         'gravity',        gravity,
         'urgency',        urgency,
         'tendency',       tendency,
         'priority_score', priority_score,
         'priority',       NULLIF(priority, ''),
         'em',             now()
       ))
 WHERE is_milestone = true
   AND marco_limpeza_backup IS NULL
   AND (
        COALESCE(btrim(assigned_to), '') <> ''
     OR COALESCE(gravity, 0) > 0
     OR COALESCE(urgency, 0) > 0
     OR COALESCE(tendency, 0) > 0
     OR COALESCE(priority_score, 0) > 0
   );

-- ───────────────────────────────────────────────────────────────────────────
-- 2) A limpeza
--
-- Vivos E lixeira: restaurar um marco descartado nao pode trazer o dado sujo
-- de volta.
--
-- `priority` NAO e zerado quando vale 'pendente': esse e o valor de "sem
-- avaliacao", e apagar trocaria "nao avaliado" por NULL sem ganho nenhum.
-- ───────────────────────────────────────────────────────────────────────────
UPDATE public.activities
   SET assigned_to    = NULL,
       gravity        = NULL,
       urgency        = NULL,
       tendency       = NULL,
       priority_score = NULL,
       priority       = CASE WHEN lower(COALESCE(priority, '')) IN ('', 'pendente')
                             THEN priority ELSE NULL END
 WHERE is_milestone = true
   AND (
        COALESCE(btrim(assigned_to), '') <> ''
     OR COALESCE(gravity, 0) > 0
     OR COALESCE(urgency, 0) > 0
     OR COALESCE(tendency, 0) > 0
     OR COALESCE(priority_score, 0) > 0
   );

-- ───────────────────────────────────────────────────────────────────────────
-- 3) A trava — para nao voltar a sujar
--
-- CHECK e nao trigger: a regra e sobre a PROPRIA linha, nao depende de mais
-- nada, e CHECK e mais barata e mais dificil de desligar por engano. E o mesmo
-- desenho da trava de `wbs_code` (migration 20260811140000), que hoje mostra
-- zero registros sujos — a prova de que a camada certa e esta.
--
-- `NOT VALID` seria a saida se houvesse linha impossivel de limpar. Nao ha: o
-- passo 2 zera todas, e a constraint entra VALIDADA. Se falhar aqui, e porque
-- alguma linha escapou — e o erro alto e melhor que a trava frouxa.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.activities
  DROP CONSTRAINT IF EXISTS marco_sem_responsavel;
ALTER TABLE public.activities
  ADD CONSTRAINT marco_sem_responsavel
  CHECK (NOT (COALESCE(is_milestone, false) AND COALESCE(btrim(assigned_to), '') <> ''));

ALTER TABLE public.activities
  DROP CONSTRAINT IF EXISTS marco_sem_gut;
ALTER TABLE public.activities
  ADD CONSTRAINT marco_sem_gut
  CHECK (NOT (COALESCE(is_milestone, false) AND (
       COALESCE(gravity, 0) > 0
    OR COALESCE(urgency, 0) > 0
    OR COALESCE(tendency, 0) > 0
    OR COALESCE(priority_score, 0) > 0
  )));

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Verificacao — falha alto
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_sujos   int;
  v_backup  int;
BEGIN
  SELECT count(*) INTO v_sujos
    FROM public.activities
   WHERE is_milestone = true
     AND (COALESCE(btrim(assigned_to), '') <> ''
       OR COALESCE(gravity, 0) > 0
       OR COALESCE(urgency, 0) > 0
       OR COALESCE(tendency, 0) > 0
       OR COALESCE(priority_score, 0) > 0);

  IF v_sujos > 0 THEN
    RAISE EXCEPTION 'ainda ha % marcos com responsavel ou GUT', v_sujos;
  END IF;

  SELECT count(*) INTO v_backup
    FROM public.activities WHERE marco_limpeza_backup IS NOT NULL;

  RAISE NOTICE 'marcos limpos: % linhas guardadas na sombra', v_backup;

  -- As duas travas precisam existir DE VERDADE. Uma migration que roda e nao
  -- deixa a constraint e o pior dos casos: limpa uma vez e nao protege depois.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marco_sem_responsavel') THEN
    RAISE EXCEPTION 'a constraint marco_sem_responsavel nao foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marco_sem_gut') THEN
    RAISE EXCEPTION 'a constraint marco_sem_gut nao foi criada';
  END IF;
END $$;
