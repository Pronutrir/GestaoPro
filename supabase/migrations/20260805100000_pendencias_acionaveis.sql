-- Pendências acionáveis: reunião e lição aprendida
--
-- A tela de Pendências lia só `activities`. Mas pendência nasce em mais lugares
-- — o pedido foi explícito: "pode ser originária de reunião, lição aprendida".
-- Duas coisas impediam isso:
--
-- 1. `meeting_actions.assigned_to` é TEXT. A única linha da base guarda a
--    string "teste". Sem referência a profiles, não dá para dizer de quem é a
--    ação, nem alimentar a aba "Minhas" — que compara com auth.uid().
--
-- 2. `lessons_learned` não tem responsável nem prazo. Tem problem, solution e
--    suggestion, todos texto livre. Sem quem e sem quando, uma lição não é
--    acionável: não há como vencer nem quem cobrar. Ela vira registro, não
--    pendência.
--
-- Esta migration resolve os dois sem descartar o que já foi digitado.
-- Idempotente: rodar de novo não duplica nada.

-- ── 1. Ação de reunião: responsável de verdade ───────────────────────────────
-- Coluna nova em vez de trocar o tipo da existente: o ALTER TYPE falharia com
-- "teste" gravado, e queremos preservar o texto livre como fallback de exibição
-- até alguém reatribuir a ação a um usuário real.
ALTER TABLE public.meeting_actions
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.meeting_actions.assignee_id IS
  'Responsável como usuário. assigned_to (text) fica como rótulo legado de quem foi digitado à mão.';

-- Casa o texto legado com um perfil quando bate exatamente com e-mail ou nome.
-- Só quando houver UM único candidato: casar por nome ambíguo atribuiria
-- trabalho à pessoa errada, o que é pior que deixar sem dono.
UPDATE public.meeting_actions ma
   SET assignee_id = p.id
  FROM public.profiles p
 WHERE ma.assignee_id IS NULL
   AND ma.assigned_to IS NOT NULL
   AND btrim(ma.assigned_to) <> ''
   AND (lower(btrim(ma.assigned_to)) = lower(p.email)
        OR lower(btrim(ma.assigned_to)) = lower(p.full_name))
   AND (SELECT count(*) FROM public.profiles p2
         WHERE lower(btrim(ma.assigned_to)) = lower(p2.email)
            OR lower(btrim(ma.assigned_to)) = lower(p2.full_name)) = 1;

CREATE INDEX IF NOT EXISTS meeting_actions_assignee_id_idx
  ON public.meeting_actions(assignee_id) WHERE is_completed = false;

-- ── 2. Lição aprendida: quem e quando ────────────────────────────────────────
-- Sem estes campos a lição não pode ser pendência de forma honesta: apareceria
-- sem dono e sem data, que é justamente o que a tela cobra das outras.
ALTER TABLE public.lessons_learned
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS is_resolved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

COMMENT ON COLUMN public.lessons_learned.assigned_to IS
  'Quem deve aplicar a recomendação. Sem responsável, a lição é registro e não pendência.';
COMMENT ON COLUMN public.lessons_learned.due_date IS
  'Prazo para aplicar. Só entra em Pendências quando preenchido — sem prazo não há como vencer.';

CREATE INDEX IF NOT EXISTS lessons_learned_pendencia_idx
  ON public.lessons_learned(due_date)
  WHERE is_resolved = false AND is_trashed = false;

-- Marca a data de resolução sozinha, para não depender de a tela lembrar.
CREATE OR REPLACE FUNCTION public.set_lesson_resolved_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_resolved AND NOT COALESCE(OLD.is_resolved, false) THEN
    NEW.resolved_at := now();
  ELSIF NOT NEW.is_resolved THEN
    NEW.resolved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lessons_learned_resolved_at ON public.lessons_learned;
CREATE TRIGGER lessons_learned_resolved_at
  BEFORE UPDATE ON public.lessons_learned
  FOR EACH ROW EXECUTE FUNCTION public.set_lesson_resolved_at();

-- ── 3. Verificação ───────────────────────────────────────────────────────────
DO $$
DECLARE n_ma int; n_ll int;
BEGIN
  SELECT count(*) INTO n_ma FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'meeting_actions'
     AND column_name = 'assignee_id';
  SELECT count(*) INTO n_ll FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'lessons_learned'
     AND column_name IN ('assigned_to', 'due_date', 'is_resolved', 'resolved_at');
  IF n_ma <> 1 OR n_ll <> 4 THEN
    RAISE EXCEPTION 'Colunas nao criadas: meeting_actions=% lessons_learned=%', n_ma, n_ll;
  END IF;
  RAISE NOTICE 'OK: meeting_actions.assignee_id e lessons_learned (4 colunas) prontos.';
END $$;
