-- ============================================================================
-- QUEM RESPONDE PELA ENTREGA DISTRIBUI O TRABALHO DAS FILHAS
--
-- ----------------------------------------------------------------------------
-- O RELATO, E POR QUE A CORRECAO DA TELA NAO BASTOU
--
-- 31/08/2026, com captura: o responsavel pela entrega 1.2.1.5 escolhe alguem
-- para a subatividade 1.2.1.5.1, "clico em um e nao entra e nao salva".
--
-- A tela foi corrigida hoje (canAssign passou a aceitar o responsavel do pai).
-- O BANCO NAO. E o banco e quem decide:
--
--   can_update_activity_v2 aceita QUATRO vias
--     1. admin do sistema
--     2. lider ou gestor do projeto
--     3. equipe com can_edit ou can_move
--     4. ator DA PROPRIA atividade (criador, responsavel, participante)
--
-- Numa subatividade recem-criada, quem responde pelo PAI nao e nenhuma delas:
-- nao e responsavel dela (o campo esta vazio -- e a premissa do caso), nao e
-- participante, e nao tem can_edit no projeto (e membro "editar apenas as
-- minhas"). O UPDATE casava ZERO linhas.
--
-- E zero linha nao e erro: o PostgREST devolve 200 com count 0. Por isso o
-- sintoma foi "nao entra e nao salva" em vez de uma mensagem -- ver
-- docs/ sobre erro do banco chegando como silencio.
--
-- ----------------------------------------------------------------------------
-- POR QUE O PAI DIRETO, E NAO A ARVORE INTEIRA
--
-- Ja existe `eh_descendente_de_atividade_do_ator`, que sobe ate a raiz -- mas
-- ela serve LEITURA (p00_escopo_de_leitura), e leitura e escrita nao merecem o
-- mesmo alcance. Usa-la aqui daria ao responsavel de uma FASE o poder de
-- escrever em qualquer neta, bisneta e tataraneta. Isso e gerencia de projeto,
-- e essa via ja existe: e o passo 2.
--
-- Um degrau. Quem responde pela entrega distribui o trabalho DELA.
--
-- ----------------------------------------------------------------------------
-- POR QUE SO O RESPONSAVEL, E NAO QUALQUER ATOR DO PAI
--
-- `is_activity_actor_v2` inclui participante e criador. Participar da entrega
-- e executar junto; distribuir o trabalho e ato de quem RESPONDE por ela.
--
-- Isto e mais estreito que a via 4 de proposito, e espelha exatamente o que
-- lib/activityAccess.ts faz em canAssign:
--
--     (ator && matchesIdentity(assigned_to))
--     || matchesIdentity(responsavel_do_pai)
--
-- ----------------------------------------------------------------------------
-- A COMPARACAO E DUPLA, E NAO E ZELO
--
-- `assigned_to` guarda NOME em 657 das 667 atividades (medido em 26/08), e
-- `assigned_to_id` so existe onde a conversao de 20260826200000 ja passou.
-- Conferir so o id recusaria a maioria da base; so o nome erraria com
-- homonimo. As duas, como o resto do sistema ja faz.
--
-- ROLLBACK: 20260831120001
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 1) A via nova, isolada numa funcao propria
--
-- Funcao separada, e nao um OR embutido em can_update_activity_v2, por dois
-- motivos: da para testa-la sozinha, e o rollback derruba a via sem tocar no
-- resto da regra de UPDATE.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.responde_pelo_pai_direto(_activity_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.activities filha
      JOIN public.activities pai ON pai.id = filha.parent_id
     WHERE filha.id = _activity_id
       AND (
         -- por identificador, quando a conversao ja respondeu
         (pai.assigned_to_id IS NOT NULL AND pai.assigned_to_id = _user_id)
         -- ou por texto, que e como a maioria da base ainda guarda
         OR EXISTS (
           SELECT 1
             FROM public.profiles p
            WHERE p.id = _user_id
              AND COALESCE(btrim(pai.assigned_to), '') <> ''
              AND lower(btrim(pai.assigned_to)) IN (
                    lower(btrim(COALESCE(p.full_name, ''))),
                    lower(btrim(COALESCE(p.email, '')))
                  )
         )
         -- ou o proprio uuid gravado como texto no campo
         OR lower(btrim(COALESCE(pai.assigned_to, ''))) = lower(_user_id::text)
       )
  );
$$;

COMMENT ON FUNCTION public.responde_pelo_pai_direto(uuid, uuid) IS
  'O usuario responde pelo pai DIRETO desta atividade. Um degrau so: subir ate a raiz daria ao dono da fase escrita em qualquer descendente, o que e gerencia de projeto (via 2). Compara por id E por texto porque assigned_to guarda nome em 657 das 667 atividades. Espelha canAssign em lib/activityAccess.ts.';

REVOKE ALL ON FUNCTION public.responde_pelo_pai_direto(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.responde_pelo_pai_direto(uuid, uuid) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) A regra de UPDATE ganha a quinta via
--
-- O corpo abaixo e o de 20260825150000 com UMA linha a mais. As quatro vias
-- anteriores ficam intactas -- inclusive a excecao de `can_edit_own`, que
-- continua rebaixando "Visualizar e comentar".
--
-- A via nova NAO passa por `can_edit_own`, e isso e deliberado: aquela coluna
-- rebaixa quem atua na PROPRIA atividade. Quem responde pela entrega e um
-- papel diferente, e ja foi checado ao ser posto como responsavel dela.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_update_activity_v2(_activity_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activities a
    WHERE a.id = _activity_id
      AND (
        public.is_admin_user_v2(_user_id)
        OR public.is_project_leader_v2(a.project_id, _user_id)
        -- NIVEL PROJETO: a equipe com can_edit ou can_move mexe em tudo.
        -- `can_edit_own` NAO e teto sobre estes: quem edita tudo, edita tudo.
        OR public.can_member_action(a.project_id, _user_id, 'edit')
        OR public.can_member_action(a.project_id, _user_id, 'move')
        -- NIVEL TAREFA: criador, responsavel ou participante -- SALVO se a
        -- pessoa for membro com can_edit_own = false ("Visualizar e comentar").
        OR (
          public.is_activity_actor_v2(a.id, _user_id)
          AND NOT EXISTS (
            SELECT 1
            FROM public.project_members pm
            WHERE pm.project_id = a.project_id
              AND pm.user_id = _user_id
              AND pm.can_edit_own = false
          )
        )
        -- NIVEL PAI (31/08/2026): quem RESPONDE pela entrega distribui o
        -- trabalho das filhas dela. Um degrau, e so o responsavel.
        OR public.responde_pelo_pai_direto(a.id, _user_id)
      )
  );
$$;

COMMENT ON FUNCTION public.can_update_activity_v2(uuid, uuid) IS
  'Admin, lider/gestor, equipe com can_edit ou can_move, quem responde pela atividade (exceto can_edit_own=false), ou quem responde pelo PAI DIRETO. Espelha podeMutarAtividade e canAssign em lib/activityAccess.ts.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Verificacao -- falha alto
--
-- As duas primeiras guardam o que ja existia: a migration de 25/08 deixou uma
-- verificacao identica porque a leitura de `can_edit_own` ja se perdeu uma vez
-- numa reescrita. Reescrever a funcao e exatamente o momento de reconferir.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='responde_pelo_pai_direto'
  ) THEN
    RAISE EXCEPTION 'responde_pelo_pai_direto nao foi criada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='can_update_activity_v2'
       AND pg_get_functiondef(p.oid) LIKE '%can_edit_own%'
  ) THEN
    RAISE EXCEPTION 'can_update_activity_v2 perdeu a leitura de can_edit_own -- "Visualizar" volta a nao significar nada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='can_update_activity_v2'
       AND pg_get_functiondef(p.oid) LIKE '%responde_pelo_pai_direto%'
  ) THEN
    RAISE EXCEPTION 'can_update_activity_v2 nao ganhou a via do pai';
  END IF;

  -- A via nova nao pode ter alargado a arvore inteira. Se a funcao citar a
  -- recursiva de leitura, alguem trocou um degrau por todos.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='responde_pelo_pai_direto'
       AND pg_get_functiondef(p.oid) LIKE '%eh_descendente_de_atividade_do_ator%'
  ) THEN
    RAISE EXCEPTION 'a via do pai virou a arvore inteira -- isso e gerencia de projeto, ja coberta pela via 2';
  END IF;

  RAISE NOTICE 'via do pai direto ativa em can_update_activity_v2';
END $$;

NOTIFY pgrst, 'reload schema';
