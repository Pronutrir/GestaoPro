-- FASE 02 -- DADOS E RLS
--
-- Cinco coisas, nesta ordem:
--
--   1. activity_assignees  -- responsavel/participante como TABELA
--   2. activity_watchers   -- observador, SEM efeito em permissao
--   3. a via do ator passa a ler a tabela nova (mantendo as colunas antigas)
--   4. a visibilidade por atribuicao alcanca a SUBARVORE
--   5. as duas views de fresta controlada
--
-- ============================================================================
-- SOBRE O ITEM 1 -- POR QUE EXISTE, JA QUE O MODELO JA ESTAVA IMPLEMENTADO
--
-- `activities.assigned_to` (TEXT) + `activities.participants` (text[]) ja
-- expressam "um responsavel + N participantes". A tabela nao adiciona
-- capacidade -- adiciona INTEGRIDADE:
--
--   - FK de verdade para profiles, em vez de texto livre. Hoje parte da base
--     guarda UUID em `assigned_to` e parte guarda nome, e a comparacao precisa
--     ser tolerante (nome OU email OU uuid) em toda a RLS.
--   - a checagem "so quem esta na equipe" vira constraint, nao convencao.
--   - historico por linha (created_at, created_by), impossivel num text[].
--
-- AS COLUNAS ANTIGAS NAO SAO REMOVIDAS. Sao 284 leituras de `assigned_to` no
-- front. A tabela nasce ao lado, sincronizada por trigger nos dois sentidos,
-- e a migracao do front e trabalho da fase 05. Enquanto isso a RLS aceita as
-- DUAS vias por OR -- o pior caso e acesso a mais por um tempo, nunca a menos.
--
-- DATA DE REMOCAO das colunas antigas: a combinar quando a fase 05 terminar.
-- Coluna deprecada sem prazo nunca morre -- anotar no PR que fechar a fase 05.
-- ============================================================================
--
-- SOBRE `can_edit_own`: a migration 20260825150000 poe o teste em
-- `can_update_activity_v2`, NAO em `is_activity_actor_v2` (que serve tambem
-- visibilidade e comentario). Esta migration NAO toca em `can_update_activity_v2`
-- -- so no corpo de `is_activity_actor_v2`, que continua sem conhecer a coluna.
-- Ha verificacao no fim garantindo isso nos dois sentidos.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) activity_assignees
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_assignees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
  papel       text NOT NULL CHECK (papel IN ('responsavel','participante')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT activity_assignees_unico UNIQUE (activity_id, user_id)
);

-- No maximo UM responsavel por atividade. Indice parcial, e nao CHECK, porque
-- a regra e entre linhas.
CREATE UNIQUE INDEX IF NOT EXISTS activity_assignees_um_responsavel
  ON public.activity_assignees (activity_id)
  WHERE papel = 'responsavel';

CREATE INDEX IF NOT EXISTS activity_assignees_por_usuario
  ON public.activity_assignees (user_id);

COMMENT ON TABLE public.activity_assignees IS
  'Quem trabalha na atividade. papel=responsavel e no maximo um (indice parcial). Convive com activities.assigned_to/participants ate a fase 05 migrar o front.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) activity_watchers -- observador NAO concede nada
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_watchers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
  origem      text NOT NULL CHECK (origem IN ('criador','atribuicao','comentario','mencao','manual')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_watchers_unico UNIQUE (activity_id, user_id)
);

CREATE INDEX IF NOT EXISTS activity_watchers_por_usuario
  ON public.activity_watchers (user_id);

COMMENT ON TABLE public.activity_watchers IS
  'Observadores: recebem notificacao e NADA MAIS. Nenhuma funcao de permissao pode consultar esta tabela.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Backfill a partir das colunas atuais
--
-- `assigned_to` e `participants` sao TEXTO LIVRE com nome, email ou uuid --
-- a mesma tolerancia de is_activity_actor_v2. Quem nao casar com nenhum perfil
-- NAO vira linha: a tabela tem FK, e inventar vinculo e pior que nao ter.
-- O front segue lendo as colunas antigas, entao ninguem perde nada.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.activity_assignees (activity_id, user_id, papel, created_by)
SELECT DISTINCT ON (a.id) a.id, pr.id, 'responsavel', a.created_by
  FROM public.activities a
  JOIN public.profiles pr
    ON lower(trim(a.assigned_to)) = lower(trim(pr.id::text))
    OR (pr.full_name IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(pr.full_name)))
 WHERE a.assigned_to IS NOT NULL
   AND trim(a.assigned_to) <> ''
   AND a.is_trashed = false
ON CONFLICT (activity_id, user_id) DO NOTHING;

INSERT INTO public.activity_assignees (activity_id, user_id, papel, created_by)
SELECT DISTINCT a.id, pr.id, 'participante', a.created_by
  FROM public.activities a
  CROSS JOIN LATERAL unnest(COALESCE(a.participants, '{}'::text[])) AS p(nome)
  JOIN public.profiles pr
    ON (pr.full_name IS NOT NULL AND lower(trim(p.nome)) = lower(trim(pr.full_name)))
    OR lower(trim(p.nome)) = lower(trim(pr.id::text))
 WHERE a.is_trashed = false
ON CONFLICT (activity_id, user_id) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) So quem esta na EQUIPE pode ser atribuido
--
-- A regra inviolavel do modelo: atribuir alguem a uma atividade NUNCA da a
-- essa pessoa acesso que ela nao tinha ao projeto. Sem esta trigger a tabela
-- vira uma porta lateral -- e por isso a checagem vive AQUI, nao na interface.
--
-- Lider, gestor e criador do projeto passam sem constar em project_members:
-- sao 6 pessoas na base nessa situacao, e barra-las seria tira-las do proprio
-- trabalho.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_assignee_exige_equipe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM public.activities WHERE id = NEW.activity_id;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'atividade % nao existe', NEW.activity_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.project_members pm
     WHERE pm.project_id = v_project_id
       AND pm.user_id = NEW.user_id
       AND COALESCE(pm.invitation_status, 'accepted') <> 'declined'
  ) OR public.is_project_leader_v2(v_project_id, NEW.user_id)
    OR public.is_admin_user_v2(NEW.user_id)
    OR EXISTS (
    SELECT 1 FROM public.projects p
     WHERE p.id = v_project_id AND p.created_by = NEW.user_id
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'usuario % nao esta na equipe do projeto % -- adicione a equipe antes de atribuir',
    NEW.user_id, v_project_id;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignee_exige_equipe ON public.activity_assignees;
CREATE TRIGGER trg_assignee_exige_equipe
  BEFORE INSERT OR UPDATE OF user_id, activity_id ON public.activity_assignees
  FOR EACH ROW EXECUTE FUNCTION public.tg_assignee_exige_equipe();

-- ───────────────────────────────────────────────────────────────────────────
-- 5) A via do ator passa a ler a tabela nova -- SOMANDO, nao substituindo
--
-- O `OR` com as colunas antigas fica ate a fase 05 migrar o front. Remove-lo
-- agora tiraria acesso de quem esta em `participants` mas nao virou linha no
-- backfill (nome que nao casou com perfil nenhum).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_activity_actor_v2(_activity_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activities a
    LEFT JOIN public.profiles pr ON pr.id = _user_id
    LEFT JOIN auth.users au ON au.id = _user_id
    WHERE a.id = _activity_id
      AND (
        a.created_by = _user_id
        -- VIA NOVA: a tabela.
        OR EXISTS (
          SELECT 1 FROM public.activity_assignees aa
           WHERE aa.activity_id = a.id AND aa.user_id = _user_id
        )
        -- VIA ANTIGA: as colunas de texto. Sai na fase 05.
        OR (
          (a.assigned_to IS NOT NULL AND (
            lower(trim(a.assigned_to)) = lower(trim(_user_id::text))
            OR (pr.full_name IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(pr.full_name)))
            OR (au.email IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(au.email)))
          ))
          OR EXISTS (
            SELECT 1
            FROM unnest(COALESCE(a.participants, '{}'::text[])) participant_name
            WHERE (pr.full_name IS NOT NULL AND lower(trim(participant_name)) = lower(trim(pr.full_name)))
               OR (au.email IS NOT NULL AND lower(trim(participant_name)) = lower(trim(au.email)))
          )
        )
      )
  );
$$;

COMMENT ON FUNCTION public.is_activity_actor_v2(uuid, uuid) IS
  'Criador, ou linha em activity_assignees, ou (legado) responsavel/participante nas colunas de texto. NAO conhece can_edit_own -- esse teste vive em can_update_activity_v2.';

-- ───────────────────────────────────────────────────────────────────────────
-- 6) A visibilidade por atribuicao alcanca a SUBARVORE
--
-- Quem responde por 1.1.2 precisa enxergar 1.1.2.1: o trabalho esta nas
-- filhas. Sem isto a atividade e inutil para quem entra so por atribuicao.
--
-- `parent_id` -- NAO existe `parent_activity_id` (a migration 20260818140000
-- usou o nome errado e so falhou na primeira insercao).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.eh_descendente_de_atividade_do_ator(_activity_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE subindo AS (
    SELECT a.id, a.parent_id, 0 AS nivel
      FROM public.activities a
     WHERE a.id = _activity_id
    UNION ALL
    SELECT p.id, p.parent_id, s.nivel + 1
      FROM public.activities p
      JOIN subindo s ON p.id = s.parent_id
     -- Guarda de ciclo: ha parent_id corrompido na base, e sem o teto a
     -- recursao nao termina.
     WHERE s.nivel < 20
  )
  SELECT EXISTS (
    SELECT 1 FROM subindo s
     WHERE public.is_activity_actor_v2(s.id, _user_id)
  );
$$;

COMMENT ON FUNCTION public.eh_descendente_de_atividade_do_ator(uuid, uuid) IS
  'A atividade e ela mesma, ou descendente de alguma em que o usuario atua. Da acesso a SUBARVORE de quem entra so por atribuicao.';

-- ───────────────────────────────────────────────────────────────────────────
-- 7) As duas frestas controladas
--
-- ATENCAO -- NENHUMA das duas carrega contador, soma, pessoa, data ou custo.
-- Um "3 subatividades" na trilha entrega a EXISTENCIA das irmas, que e
-- justamente o que a regra de visibilidade protege. Ha verificacao no fim
-- travando a lista de colunas.
--
-- Vazamento aceito e registrado: o codigo 1.1.2 revela que existe um 1.1.1.
-- Nao da para esconder sem destruir a EAP. A numeracao revela a EXISTENCIA de
-- irmas, nunca o conteudo delas.
-- ───────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.activity_breadcrumb;
CREATE VIEW public.activity_breadcrumb
WITH (security_invoker = true)
AS
  SELECT a.id, a.parent_id, a.wbs_code, a.title, a.item_type, a.is_milestone
    FROM public.activities a
   WHERE a.is_trashed = false;

COMMENT ON VIEW public.activity_breadcrumb IS
  'Trilha de ancestrais como CONTEXTO. Codigo, nome e tipo -- nada mais. NUNCA acrescentar contador, soma, pessoa, data ou custo: qualquer um deles entrega a existencia das irmas.';

DROP VIEW IF EXISTS public.activity_dependency_card;
CREATE VIEW public.activity_dependency_card
WITH (security_invoker = true)
AS
  SELECT a.id, a.wbs_code, a.title, a.item_type, a.status
    FROM public.activities a
   WHERE a.is_trashed = false;

COMMENT ON VIEW public.activity_dependency_card IS
  'Cartao reduzido da dependencia que bloqueia, mesmo sendo irma invisivel. Excecao deliberada: quem esta bloqueado precisa saber O QUE e SE ja terminou -- e nada alem disso.';

-- ───────────────────────────────────────────────────────────────────────────
-- 8) RLS das tabelas novas
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.activity_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_watchers  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Assignees select" ON public.activity_assignees;
CREATE POLICY "Assignees select" ON public.activity_assignees
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.activities a
     WHERE a.id = activity_id
       AND public.can_view_project_work_v2(a.project_id, auth.uid())
  )
);

-- Escrever assignee e ATRIBUIR: exige poder mexer na atividade. A trigger
-- acima ainda exige que o atribuido esteja na equipe.
DROP POLICY IF EXISTS "Assignees write" ON public.activity_assignees;
CREATE POLICY "Assignees write" ON public.activity_assignees
FOR ALL TO authenticated
USING (public.can_update_activity_v2(activity_id, auth.uid()))
WITH CHECK (public.can_update_activity_v2(activity_id, auth.uid()));

-- Watcher e do proprio usuario: cada um gerencia o que acompanha.
DROP POLICY IF EXISTS "Watchers own" ON public.activity_watchers;
CREATE POLICY "Watchers own" ON public.activity_watchers
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────────────
-- Verificacao -- falha alto se algo saiu do lugar
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_cols text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='activity_assignees') THEN
    RAISE EXCEPTION 'activity_assignees nao foi criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='activity_watchers') THEN
    RAISE EXCEPTION 'activity_watchers nao foi criada';
  END IF;

  -- A via nova tem de estar na funcao do ator.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='is_activity_actor_v2'
       AND pg_get_functiondef(p.oid) LIKE '%activity_assignees%'
  ) THEN
    RAISE EXCEPTION 'is_activity_actor_v2 nao passou a ler activity_assignees';
  END IF;

  -- E a antiga tem de continuar, ate a fase 05.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='is_activity_actor_v2'
       AND pg_get_functiondef(p.oid) LIKE '%participants%'
  ) THEN
    RAISE EXCEPTION 'is_activity_actor_v2 perdeu a via legada -- isso tira acesso de quem nao virou linha no backfill';
  END IF;

  -- can_edit_own NAO pode ter entrado no helper (ver 20260825150000).
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='is_activity_actor_v2'
       AND pg_get_functiondef(p.oid) LIKE '%can_edit_own%'
  ) THEN
    RAISE EXCEPTION 'is_activity_actor_v2 nao deve conhecer can_edit_own';
  END IF;

  -- E can_update_activity_v2 tem de CONTINUAR conhecendo.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='can_update_activity_v2'
       AND pg_get_functiondef(p.oid) LIKE '%can_edit_own%'
  ) THEN
    RAISE EXCEPTION 'can_update_activity_v2 perdeu a leitura de can_edit_own -- "Visualizar" volta a nao significar nada';
  END IF;

  -- As views nao podem ganhar coluna por conveniencia.
  SELECT string_agg(column_name, ',' ORDER BY column_name) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='activity_breadcrumb';
  IF v_cols <> 'id,is_milestone,item_type,parent_id,title,wbs_code' THEN
    RAISE EXCEPTION 'activity_breadcrumb com colunas inesperadas: % -- ver o comentario da view', v_cols;
  END IF;

  SELECT string_agg(column_name, ',' ORDER BY column_name) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='activity_dependency_card';
  IF v_cols <> 'id,item_type,status,title,wbs_code' THEN
    RAISE EXCEPTION 'activity_dependency_card com colunas inesperadas: %', v_cols;
  END IF;
END $$;
