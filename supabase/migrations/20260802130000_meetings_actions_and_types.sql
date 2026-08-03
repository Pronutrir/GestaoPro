-- Reuniões: tipos configuráveis, gravação e transcrição.
--
-- ESCOPO MENOR DO QUE O PLANO SUPUNHA. Ao conferir o banco em 02/08/2026,
-- `meeting_actions` JÁ EXISTE e já tem description, assigned_to, due_date,
-- activity_id e is_completed — ou seja, ação com dono, prazo e promoção a
-- atividade já estavam prontas. O que faltava era só a notificação (feita no
-- app, sem migration) e o painel (leitura).
--
-- Sobra para o banco:
--
-- 1. Os tipos de reunião eram constantes no código (Daily/Planning/Review/
--    Retrospective — cerimônias de Scrum). A metodologia daqui é por
--    atividades/EAP: zero sprints cadastradas. Viram DADO, editável por
--    projeto, com a lista inicial tirada do vocabulário real da equipe
--    (levantamento nos títulos das 1.308 atividades).
--
-- 2. `meetings` não tinha onde guardar gravação nem transcrição.
--
-- 3. `meeting_actions` não tinha índice para o painel (abertas / atrasadas).

-- ═══════════════════════════════════════════════════════════════════
-- 1) Tipos de reunião — por projeto, editáveis
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.meeting_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  label text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  -- O tipo pré-selecionado ao criar reunião. Só um por projeto (índice abaixo).
  is_default boolean NOT NULL DEFAULT false,
  -- Pede a Fase da EAP ao criar (usado por "Validação / Homologação", que
  -- fecha etapa). O campo meetings.phase_id já existia e nunca foi usado.
  asks_phase boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_types_project_idx
  ON public.meeting_types(project_id, display_order);

-- Um único padrão por projeto.
CREATE UNIQUE INDEX IF NOT EXISTS meeting_types_one_default_idx
  ON public.meeting_types(project_id) WHERE is_default;

ALTER TABLE public.meeting_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read meeting_types" ON public.meeting_types;
CREATE POLICY "Members read meeting_types" ON public.meeting_types
  FOR SELECT TO authenticated
  USING (public.can_view_project_v2(project_id, auth.uid()));

DROP POLICY IF EXISTS "Managers write meeting_types" ON public.meeting_types;
CREATE POLICY "Managers write meeting_types" ON public.meeting_types
  FOR ALL TO authenticated
  USING (public.can_manage_project_v2(project_id, auth.uid()))
  WITH CHECK (public.can_manage_project_v2(project_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════
-- 2) meetings: tipo, gravação e transcrição
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS meeting_type_id uuid REFERENCES public.meeting_types(id) ON DELETE SET NULL,
  -- Link (Meet/Teams/Zoom) em vez de upload: uma reunião de 1h passa de 500 MB,
  -- e a gravação já vive na ferramenta que a produziu.
  ADD COLUMN IF NOT EXISTS recording_url text,
  ADD COLUMN IF NOT EXISTS transcript text;

-- ═══════════════════════════════════════════════════════════════════
-- 3) Índices para o painel de ações
-- ═══════════════════════════════════════════════════════════════════
-- "minhas ações abertas" e "atrasadas" são as duas perguntas do painel.
CREATE INDEX IF NOT EXISTS meeting_actions_assignee_idx
  ON public.meeting_actions(assigned_to) WHERE is_completed = false;
CREATE INDEX IF NOT EXISTS meeting_actions_due_idx
  ON public.meeting_actions(due_date) WHERE is_completed = false;

-- ═══════════════════════════════════════════════════════════════════
-- 4) Semear os tipos nos projetos existentes
-- ═══════════════════════════════════════════════════════════════════
-- Nomes tirados do que a equipe já escreve nas atividades — não de manual.
-- "Kick Off" (16 ocorrências) e não "Abertura"; "Treinamento" (77) entra
-- porque os títulos têm forma de evento: "Treinamento com Fulano (Setor)".
INSERT INTO public.meeting_types (project_id, label, display_order, is_default, asks_phase)
SELECT p.id, t.label, t.ord, t.is_def, t.phase
FROM public.projects p
CROSS JOIN (VALUES
  ('Kick Off',                    0, false, false),
  ('Levantamento de requisitos',  1, false, false),
  ('Alinhamento',                 2, true,  false),
  ('Treinamento',                 3, false, false),
  ('Validação / Homologação',     4, false, true),
  ('Encerramento',                5, false, false)
) AS t(label, ord, is_def, phase)
WHERE NOT EXISTS (
  SELECT 1 FROM public.meeting_types mt WHERE mt.project_id = p.id
);

-- Projetos criados DEPOIS desta migration também precisam da lista.
CREATE OR REPLACE FUNCTION public.seed_meeting_types()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.meeting_types (project_id, label, display_order, is_default, asks_phase)
  VALUES
    (NEW.id, 'Kick Off',                   0, false, false),
    (NEW.id, 'Levantamento de requisitos', 1, false, false),
    (NEW.id, 'Alinhamento',                2, true,  false),
    (NEW.id, 'Treinamento',                3, false, false),
    (NEW.id, 'Validação / Homologação',    4, false, true),
    (NEW.id, 'Encerramento',               5, false, false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_meeting_types_trigger ON public.projects;
CREATE TRIGGER seed_meeting_types_trigger
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.seed_meeting_types();
