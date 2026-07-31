-- LIÇÕES APRENDIDAS — captura por evento e entrega no momento certo.
--
-- O diagnóstico da pesquisa: o gargalo NÃO é a captura, é a ENTREGA. Sistemas
-- de lições falham porque criam um processo novo em vez de se embutir no
-- processo que pretendem melhorar. Por isso:
--   1. o sistema PERGUNTA quando o evento acontece (lesson_prompts), com o
--      contexto pronto — em vez de esperar alguém lembrar;
--   2. a lição VOLTA na fase onde foi aprendida, sem ninguém precisar buscar.
--
-- Também corrige dois defeitos existentes, encontrados na análise:
--   - o ramo 'blocked' de generate_overdue_notifications NUNCA dispara: procura
--     workflow_stages.is_blocked, mas a marcação migrou para activities em julho;
--   - promover comentário para lição gravava categoria fora da lista.
--
-- Rodar NA VM: PGPASSWORD=... ./scripts/apply-lesson-prompts.sh

-- ============================================================
-- 1. CONVITES DE REGISTRO (o sistema perguntando)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lesson_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES public.activities(id) ON DELETE CASCADE,
  phase_id uuid REFERENCES public.phases(id) ON DELETE SET NULL,
  -- bloqueio | atraso | risco | orcamento | encerramento
  trigger_type text NOT NULL,
  -- Contexto JÁ ESCRITO, para a pessoa só completar duas frases.
  context_title text NOT NULL,
  context_detail text,
  -- Impacto medido (dias bloqueados, dias de atraso) — quantifica a lição.
  impact_days integer,
  -- Quem viveu o problema é quem tem o que dizer.
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- pendente | respondido | dispensado
  status text NOT NULL DEFAULT 'pendente',
  lesson_id uuid REFERENCES public.lessons_learned(id) ON DELETE SET NULL,
  dismissed_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  -- Evita reconvidar pelo mesmo evento.
  UNIQUE (project_id, activity_id, trigger_type)
);

CREATE INDEX IF NOT EXISTS lesson_prompts_project_idx
  ON public.lesson_prompts(project_id, status);
CREATE INDEX IF NOT EXISTS lesson_prompts_user_idx
  ON public.lesson_prompts(target_user_id, status);

ALTER TABLE public.lesson_prompts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read lesson_prompts" ON public.lesson_prompts;
CREATE POLICY "Members read lesson_prompts" ON public.lesson_prompts
  FOR SELECT TO authenticated
  USING (public.can_view_project_v2(project_id, auth.uid()));

DROP POLICY IF EXISTS "Members write lesson_prompts" ON public.lesson_prompts;
CREATE POLICY "Members write lesson_prompts" ON public.lesson_prompts
  FOR ALL TO authenticated
  USING (public.can_view_project_v2(project_id, auth.uid()))
  WITH CHECK (public.can_view_project_v2(project_id, auth.uid()));

-- ============================================================
-- 2. A LIÇÃO GANHA ORIGEM E CICLO DE VIDA
-- ============================================================
ALTER TABLE public.lessons_learned
  -- De onde veio: sem isso a lição perde a evidência (quanto custou, quando).
  ADD COLUMN IF NOT EXISTS source_activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_trigger text,
  ADD COLUMN IF NOT EXISTS impact_days integer,
  -- "Reportado por" deixa de ser texto livre.
  ADD COLUMN IF NOT EXISTS reported_by_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- CICLO (OTAN): uma lição só é "aprendida" quando algo muda por causa dela.
  -- identificada | acao_atribuida | aplicada
  ADD COLUMN IF NOT EXISTS lifecycle text NOT NULL DEFAULT 'identificada',
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS action_text text,
  -- Fechamento VERIFICADO, não autodeclarado: sem essa etapa, a equipe marca
  -- "resolvido" só para limpar a fila e o status vira ficção.
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS applied_by_name text,
  -- funcionou | nao_funcionou — classificação simples que orienta a leitura.
  ADD COLUMN IF NOT EXISTS outcome text,
  -- Quantas vezes esta lição foi exibida no planejamento de outra atividade.
  -- É a métrica que importa (reuso), não quantas lições foram escritas.
  ADD COLUMN IF NOT EXISTS reuse_count integer NOT NULL DEFAULT 0;

-- Categoria legada invalida: "Registro da atividade" nao existe na lista da UI,
-- entao essas licoes nunca apareciam em nenhum filtro.
UPDATE public.lessons_learned SET category = 'general'
  WHERE category NOT IN ('general','technical','process','communication','risk','quality');

-- ============================================================
-- 3. GERADOR DE CONVITES (o motor dos gatilhos)
-- ============================================================
-- Segue o mesmo padrão de generate_overdue_notifications: chamado pelo cliente
-- ao abrir o projeto, idempotente, sem depender de cron (que não existe aqui).
CREATE OR REPLACE FUNCTION public.generate_lesson_prompts(
  p_project_id uuid,
  p_blocked_days_threshold integer DEFAULT 3,
  p_delay_days_threshold integer DEFAULT 5
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- GATILHO 1: bloqueio resolvido que custou dias.
  -- É o de melhor evidência de campo: agrupar bloqueios por motivo revela
  -- causa sistêmica, e o custo em dias quantifica a prioridade.
  INSERT INTO public.lesson_prompts (
    project_id, activity_id, phase_id, trigger_type,
    context_title, context_detail, impact_days, target_user_id
  )
  SELECT
    a.project_id, a.id, a.phase_id, 'bloqueio',
    a.title,
    COALESCE(a.blocked_reason, 'sem motivo registrado'),
    a.blocked_days_total,
    NULL
  FROM public.activities a
  WHERE a.project_id = p_project_id
    AND a.is_trashed = false
    AND a.is_blocked = false                       -- já foi resolvido
    AND COALESCE(a.blocked_days_total, 0) >= p_blocked_days_threshold
    AND NOT EXISTS (
      SELECT 1 FROM public.lesson_prompts lp
      WHERE lp.activity_id = a.id AND lp.trigger_type = 'bloqueio'
    );

  -- GATILHO 2: entrega concluída com atraso relevante.
  INSERT INTO public.lesson_prompts (
    project_id, activity_id, phase_id, trigger_type,
    context_title, context_detail, impact_days, target_user_id
  )
  SELECT
    a.project_id, a.id, a.phase_id, 'atraso',
    a.title,
    'previsto para ' || to_char(a.end_date, 'DD/MM/YYYY')
      || ', concluído em ' || to_char(a.completed_at, 'DD/MM/YYYY'),
    (a.completed_at::date - a.end_date),
    NULL
  FROM public.activities a
  WHERE a.project_id = p_project_id
    AND a.is_trashed = false
    AND a.status = 'completed'
    AND a.end_date IS NOT NULL
    AND a.completed_at IS NOT NULL
    AND (a.completed_at::date - a.end_date) >= p_delay_days_threshold
    AND NOT EXISTS (
      SELECT 1 FROM public.lesson_prompts lp
      WHERE lp.activity_id = a.id AND lp.trigger_type = 'atraso'
    );
END;
$$;

-- ============================================================
-- 4. CORREÇÃO: o aviso de bloqueio nunca disparava
-- ============================================================
-- O ramo procurava workflow_stages.is_blocked, mas o bloqueio virou flag da
-- ATIVIDADE em 29/07 ("block in place": o card fica onde o trabalho está).
-- Desde então este trecho estava morto — nenhum aviso de bloqueio saía.
CREATE OR REPLACE FUNCTION public.generate_overdue_notifications(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Atrasadas (inalterado)
  INSERT INTO public.notifications (project_id, activity_id, target_user_id, type, title, message)
  SELECT
    a.project_id, a.id, recipients.user_id, 'overdue',
    '⏰ Atividade atrasada: ' || a.title,
    'A atividade "' || a.title || '" está atrasada desde ' || to_char(a.end_date, 'DD/MM/YYYY') || '.'
  FROM public.activities a
  CROSS JOIN LATERAL public.notification_recipient_user_ids(a.id) recipients
  WHERE a.project_id = p_project_id
    AND a.end_date < CURRENT_DATE
    AND a.status != 'completed'
    AND a.is_trashed = false
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.activity_id = a.id AND n.type = 'overdue'
        AND n.target_user_id = recipients.user_id
        AND n.created_at > now() - interval '24 hours'
    );

  -- Bloqueadas — agora lendo a flag CERTA (activities.is_blocked)
  INSERT INTO public.notifications (project_id, activity_id, target_user_id, type, title, message)
  SELECT
    a.project_id, a.id, recipients.user_id, 'blocked',
    '🚫 Atividade bloqueada: ' || a.title,
    'A atividade "' || a.title || '" está bloqueada'
      || COALESCE(': ' || a.blocked_reason, '') || '.'
  FROM public.activities a
  CROSS JOIN LATERAL public.notification_recipient_user_ids(a.id) recipients
  WHERE a.project_id = p_project_id
    AND a.is_blocked = true
    AND a.status != 'completed'
    AND a.is_trashed = false
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.activity_id = a.id AND n.type = 'blocked'
        AND n.target_user_id = recipients.user_id
        AND n.created_at > now() - interval '24 hours'
    );
END;
$$;

NOTIFY pgrst, 'reload schema';
