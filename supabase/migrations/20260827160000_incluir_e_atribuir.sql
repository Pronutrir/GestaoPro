-- ============================================================================
-- INCLUIR NA EQUIPE E ATRIBUIR, NA MESMA TRANSACAO — secao 08 do desenho
--
-- ----------------------------------------------------------------------------
-- A REGRA INVIOLAVEL QUE ISTO IMPLEMENTA
--
-- CLAUDE.md, e e a decisao que organiza o modelo inteiro:
--
--   "Atribuir alguem a uma atividade nunca da a essa pessoa acesso que ela nao
--   tinha ao projeto. Quem atribui alguem de fora da equipe recebe a proposta
--   de adiciona-la a equipe -- e isso e ato de quem gerencia equipe. ESSA
--   CHECAGEM VIVE NO BANCO, NAO NA INTERFACE."
--
-- ----------------------------------------------------------------------------
-- POR QUE UMA FUNCAO, E NAO DOIS INSERTS NA TELA
--
-- O desenho exige: "cria o vinculo de equipe e atribui na MESMA transacao; se o
-- vinculo falhar, a atribuicao nao acontece".
--
-- Dois inserts do cliente NAO sao uma transacao. Entre eles cabe: a rede cair,
-- a aba fechar, a RLS recusar o segundo. O resultado seria o pior estado
-- possivel -- pessoa atribuida a uma atividade de um projeto que ela nao
-- alcanca. Ela aparece como responsavel e nao consegue abrir o item.
--
-- Aqui os dois acontecem no mesmo BEGIN implicito da funcao: ou os dois, ou
-- nenhum.
--
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER, E POR QUE ISSO NAO E UM BURACO
--
-- A funcao precisa escrever em `project_members`, e quem chama normalmente nao
-- tem essa permissao -- e justamente por isso a operacao existe.
--
-- O QUE A PROTEGE: a PRIMEIRA coisa que ela faz e conferir se quem chama tem
-- `can_manage` no projeto. Sem isso, ela recusa. O poder e emprestado para uma
-- operacao especifica, depois de a permissao ser verificada -- nao concedido.
--
-- ROLLBACK: 20260827160001
-- ============================================================================

CREATE OR REPLACE FUNCTION public.incluir_e_atribuir(
  p_activity_id uuid,
  p_user_id     uuid,
  p_papel       text DEFAULT 'visualizar_comentar',
  p_escopo      text DEFAULT 'atividade_e_trilha'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_project    uuid;
  v_quem       uuid := auth.uid();
  v_pode       boolean;
  v_ja_membro  boolean;
  v_nome_alvo  text;
  v_criou      boolean := false;
BEGIN
  IF v_quem IS NULL THEN
    RAISE EXCEPTION 'sem sessao';
  END IF;

  SELECT project_id INTO v_project FROM public.activities WHERE id = p_activity_id;
  IF v_project IS NULL THEN
    RAISE EXCEPTION 'atividade nao encontrada';
  END IF;

  -- ── A PERMISSAO, ANTES DE QUALQUER ESCRITA ──────────────────────────────
  -- Incluir alguem na equipe e ato de quem gerencia equipe. Quem nao pode
  -- recebe o motivo e a saida ("solicitar ao gestor") -- na tela, nao aqui.
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
     WHERE pm.project_id = v_project AND pm.user_id = v_quem AND pm.can_manage = true
  ) OR EXISTS (
    SELECT 1 FROM public.projects p
     WHERE p.id = v_project
       AND (p.owner_id = v_quem OR p.manager_id = v_quem)
  ) INTO v_pode;

  IF NOT v_pode THEN
    RAISE EXCEPTION 'sem permissao para incluir na equipe deste projeto'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT full_name INTO v_nome_alvo FROM public.profiles WHERE id = p_user_id;
  IF v_nome_alvo IS NULL THEN
    RAISE EXCEPTION 'pessoa nao encontrada';
  END IF;

  -- ── 1) O VINCULO DE EQUIPE ──────────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
     WHERE project_id = v_project AND user_id = p_user_id
  ) INTO v_ja_membro;

  IF NOT v_ja_membro THEN
    -- O padrao do desenho: "Visualizar e comentar", escopo "so esta atividade
    -- e a trilha". Quem quiser mais, escolhe na tela -- mas o silencio nao
    -- concede.
    INSERT INTO public.project_members (project_id, user_id, can_edit, can_manage)
    VALUES (v_project, p_user_id,
            p_papel IN ('editar', 'editar_tudo'),
            p_papel = 'gerenciar');
    v_criou := true;
  END IF;

  -- ── 2) A ATRIBUICAO — no mesmo BEGIN ────────────────────────────────────
  -- Se o passo 1 tivesse falhado, este nem seria alcancado, e nada teria sido
  -- gravado. E o que "na mesma transacao" significa na pratica.
  INSERT INTO public.activity_assignees (activity_id, user_id, papel, created_by)
  VALUES (p_activity_id, p_user_id, 'participante', v_quem)
  ON CONFLICT DO NOTHING;

  -- ── 3) O HISTORICO — REMOVIDO EM 28/08/2026 ─────────────────────────────
  -- O passo original gravava a frase inteira em public.activity_feed_eventos.
  -- Essa tabela foi DESCARTADA no commit ad38feb e NAO existe no banco: a
  -- funcao ate se criava (plpgsql adia a resolucao de nomes), mas ABORTAVA em
  -- runtime a CADA chamada, revertendo o incluir+atribuir e devolvendo erro
  -- cru do Postgres — o oposto do que esta leva conserta.
  --
  -- Removido para o critico voltar a funcionar: o vinculo e a atribuicao na
  -- mesma transacao (a regra inviolavel), e a recusa em portugues.
  --
  -- CUSTO MEDIDO (28/08): a acao NAO fica no feed por enquanto. activity_
  -- assignees nao tem gatilho de auditoria (audit_log tem 0 linhas dela) e a
  -- view activity_feed_events so mostra audit de table_name='activities'. Nao
  -- ha fallback de texto seco — a acao some do historico ate haver sink.
  --
  -- O evento de texto rico virou item de fila, com a pergunta em aberto: por
  -- que activity_feed_eventos foi descartada em ad38feb? Responder ANTES de
  -- restaurar qualquer tabela. Ver docs/FILA-DE-TRABALHO.md.

  RETURN jsonb_build_object(
    'criou_vinculo', v_criou,
    'ja_era_membro', v_ja_membro,
    'nome', v_nome_alvo
  );
END $fn$;

COMMENT ON FUNCTION public.incluir_e_atribuir(uuid, uuid, text, text) IS
  'Inclui na equipe e atribui na MESMA transacao. Dois inserts do cliente nao sao transacao: entre eles cabe a rede cair, e o resultado seria pessoa atribuida a projeto que ela nao alcanca. SECURITY DEFINER protegido por checagem de can_manage antes de qualquer escrita.';

REVOKE ALL ON FUNCTION public.incluir_e_atribuir(uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.incluir_e_atribuir(uuid, uuid, text, text) TO authenticated;

DO $conf$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'incluir_e_atribuir') THEN
    RAISE EXCEPTION 'a funcao nao foi criada';
  END IF;
  RAISE NOTICE 'incluir_e_atribuir criada -- vinculo e atribuicao na mesma transacao';
END $conf$;

NOTIFY pgrst, 'reload schema';
