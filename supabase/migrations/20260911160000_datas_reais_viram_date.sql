-- Migration: as datas REAIS da atividade viram `date`, e o início real passa a
-- ser carimbado pelo banco
-- Data: 11/09/2026
--
-- ────────────────────────────────────────────────────────────────────────────
-- O PROBLEMA: DOIS TIPOS PARA A MESMA IDEIA
--
-- Na tela da atividade, "Previsto" e "Realizado" são o mesmo tipo de coisa —
-- um par de DIAS. No banco não eram:
--
--   start_date, end_date                   date
--   actual_start_date, actual_end_date     timestamptz   <-- instante
--   baseline_start_date, baseline_end_date timestamptz
--
-- O código trata os quatro como texto `YYYY-MM-DD`. Ao gravar num `timestamptz`
-- ele mandava o dia em UTC (`new Date().toISOString().slice(0, 10)`); ao ler,
-- recortava os 10 primeiros caracteres, que é de novo o dia em UTC. Os dois
-- lados erravam na mesma direção, então a tela parecia coerente consigo mesma —
-- e discordava do banco.
--
-- Medido em produção em 11/09/2026, com o relógio do navegador fixado às 22:30
-- de São Paulo (01:30 UTC do dia 12):
--
--   clique às 12:19 -> actual_end_date "2026-09-11"  (certo)
--   clique às 22:30 -> actual_end_date "2026-09-12"  (o dia seguinte)
--
-- O valor gravado às 22:30 ficou `2026-09-12 00:00:00+00`. Convertido para São
-- Paulo isso é 11/09 21:00 — ou seja, um SELECT com fuso lia 11/09 e a tela
-- lia 12/09, na MESMA linha. E `completed_at`, gravado no mesmo clique com
-- `toISOString()` inteiro, saía correto: dois campos nascidos juntos
-- discordavam em um dia.
--
-- O lado do cliente já foi corrigido (helper `hojeLocalISO()` em
-- `lib/dataLocal.ts`). Esta migration tira a causa de baixo: um dia deixa de
-- ser guardado como instante.
--
-- ────────────────────────────────────────────────────────────────────────────
-- POR QUE `AT TIME ZONE 'UTC'` NA CONVERSÃO, E NÃO 'America/Sao_Paulo'
--
-- A conversão precisa preservar O QUE A TELA JÁ MOSTRA hoje, não "consertar"
-- o passado. Todo leitor faz `.slice(0, 10)` sobre o ISO em UTC, então o dia
-- exibido hoje é o dia UTC. Converter por São Paulo deslocaria as linhas um
-- dia para trás e trocaria um erro por outro, agora visível.
--
-- Em produção nenhuma linha tem hora diferente de 00:00 UTC (conferido em
-- 11/09/2026), então a conversão é exata. A guarda abaixo recusa a migration
-- se num outro ambiente houver hora de verdade guardada ali: nesse caso alguém
-- gravou um INSTANTE de propósito e a decisão tem que ser humana.
--
-- `baseline_*` entram junto por serem da mesma família e por `endVariance()`
-- comparar as três com `.slice(0, 10)`. Estão vazias em produção (0 linhas).

DO $guarda$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
    FROM public.activities
   WHERE (actual_start_date   IS NOT NULL AND actual_start_date::time   <> '00:00:00')
      OR (actual_end_date     IS NOT NULL AND actual_end_date::time     <> '00:00:00')
      OR (baseline_start_date IS NOT NULL AND baseline_start_date::time <> '00:00:00')
      OR (baseline_end_date   IS NOT NULL AND baseline_end_date::time   <> '00:00:00');
  IF n > 0 THEN
    RAISE EXCEPTION
      '% linha(s) guardam hora em colunas de data real/baseline. Converter para date descartaria essa hora — decida o que fazer com elas antes de aplicar.', n;
  END IF;
END $guarda$;

ALTER TABLE public.activities
  ALTER COLUMN actual_start_date   TYPE date USING (actual_start_date   AT TIME ZONE 'UTC')::date,
  ALTER COLUMN actual_end_date     TYPE date USING (actual_end_date     AT TIME ZONE 'UTC')::date,
  ALTER COLUMN baseline_start_date TYPE date USING (baseline_start_date AT TIME ZONE 'UTC')::date,
  ALTER COLUMN baseline_end_date   TYPE date USING (baseline_end_date   AT TIME ZONE 'UTC')::date;

COMMENT ON COLUMN public.activities.actual_start_date IS
  'DIA em que o trabalho comecou de fato. `date`, nao instante — era timestamptz e recebia dia em UTC (migration 20260911160000).';
COMMENT ON COLUMN public.activities.actual_end_date IS
  'DIA em que o trabalho terminou de fato. `date`, nao instante. Para o INSTANTE da conclusao use completed_at.';

-- ────────────────────────────────────────────────────────────────────────────
-- O INÍCIO REAL PASSA A SER CARIMBADO PELO BANCO
--
-- Concluir gravava `actual_end_date` e nunca `actual_start_date`. A tela
-- mostrava `Realizado — → 11/09` — uma janela sem a ponta esquerda — e, depois
-- de reabrir (que devolve `in_progress`), passava a dizer "não começou" para
-- uma atividade em andamento.
--
-- São SEIS caminhos que concluem (Kanban ×2, diálogo ×2, tela da atividade,
-- Backlog). Repetir a regra nos seis é o que o CLAUDE.md proíbe — "Nunca
-- reescrever regra de pai/filha dentro de uma tela" — e ainda deixaria de fora
-- quem escreve pela API. A regra mora aqui, uma vez.
--
-- QUANDO CARIMBA: só na TRANSIÇÃO para `in_progress`/`completed`, ou quando o
-- término real aparece pela primeira vez. Não a cada UPDATE — senão editar o
-- título de uma atividade em andamento gravaria o dia da edição como início.
--
-- COM QUE VALOR: o dia local, limitado pelo término real quando ele já existe.
-- O `LEAST` é o que impede esta correção de criar a janela invertida que a
-- outra metade deste trabalho foi arrumar: preencher um fim real retroativo
-- (digamos 03/09) carimbaria hoje como início e produziria 11/09 → 03/09.
--
-- O fuso é fixo de propósito. `now()` no banco é UTC, e "o dia de hoje" aqui é
-- o dia de quem usa o sistema — um produto em pt-BR, com datas em dd/mm/aaaa.
CREATE OR REPLACE FUNCTION public.marcar_inicio_real()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  dia_local date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  comecou   boolean;
BEGIN
  IF NEW.actual_start_date IS NOT NULL THEN
    RETURN NEW;
  END IF;

  comecou := CASE
    WHEN TG_OP = 'INSERT' THEN
      NEW.status IN ('in_progress', 'completed') OR NEW.actual_end_date IS NOT NULL
    ELSE
      (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('in_progress', 'completed'))
      OR (NEW.actual_end_date IS NOT NULL AND OLD.actual_end_date IS NULL)
  END;

  IF comecou THEN
    NEW.actual_start_date := LEAST(dia_local, COALESCE(NEW.actual_end_date, dia_local));
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_marcar_inicio_real ON public.activities;
CREATE TRIGGER trg_marcar_inicio_real
BEFORE INSERT OR UPDATE ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.marcar_inicio_real();

NOTIFY pgrst, 'reload schema';
