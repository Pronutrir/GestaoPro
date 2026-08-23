-- "Projeto criado com aviso: new row violates row-level security policy for
-- table notifications"
--
-- ── O QUE ACONTECE ─────────────────────────────────────────────────────────
--
-- Criar projeto com equipe faz duas escritas em sequencia:
--
--   1. `project_members` -- os convidados entram com `invitation_status =
--      'pending'`, porque o aceite vem depois, pela notificacao;
--   2. `notifications`   -- o convite em si. Sem ele a pessoa fica
--      "aguardando" para sempre, sem nunca saber que foi convidada.
--
-- A politica de INSERT em `notifications` exige vinculo com o projeto, e o
-- vinculo e conferido por `is_project_member_v2`, que so conta membro
-- ACEITO (`COALESCE(invitation_status,'accepted') = 'accepted'`).
--
-- O convidado acabou de entrar como 'pending'. Logo, no instante do passo 2
-- ele ainda nao e membro aos olhos da politica, e a linha e recusada. O
-- convite nunca chega -- e o unico caminho de aceite morre com ele.
--
-- Nao e caso de borda nem corrida entre requisicoes: e a ordem normal do
-- fluxo. Todo projeto criado com equipe cai nisso.
--
-- ── POR QUE NAO AFROUXAR A POLITICA ───────────────────────────────────────
--
-- A saida obvia seria aceitar 'pending' na politica de notifications. Seria
-- pior: `is_project_member_v2` e usada em varias politicas, e mexer nela
-- abriria leitura e escrita de projeto para quem apenas foi convidado e ainda
-- nao respondeu -- ou recusou. O aceite deixaria de significar alguma coisa.
--
-- Uma politica sob medida so para 'project_invite' tambem nao serve: a coluna
-- `type` e texto livre vindo do cliente, entao a regra seria "quem escrever a
-- palavra certa entra", que nao e regra nenhuma.
--
-- ── A CORRECAO ─────────────────────────────────────────────────────────────
--
-- O convite passa a nascer por uma funcao SECURITY DEFINER, que valida QUEM
-- convida em vez de quem e convidado -- que e a pergunta certa. A funcao so
-- grava se:
--
--   * ha sessao (`auth.uid()`);
--   * quem chama pode gerenciar o projeto (`can_manage_project_v2`); e
--   * o destinatario realmente tem convite pendente naquele projeto.
--
-- A politica da tabela fica intacta. Escrita direta continua exigindo membro
-- aceito, como antes.
--
-- Aditiva e idempotente. Rodar NA VM:
--   PGPASSWORD=... ./scripts/apply-convite-pela-funcao.sh

CREATE OR REPLACE FUNCTION public.enviar_convites_do_projeto(
  _project_id uuid,
  _user_ids   uuid[],
  _titulo     text,
  _mensagem   text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _quem uuid := auth.uid();
  _n    integer := 0;
BEGIN
  IF _quem IS NULL OR _project_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Quem convida precisa mandar no projeto. É a checagem que substitui a da
  -- política -- e a correta: o convite é ato de quem gerencia, não de quem
  -- recebe.
  IF NOT public.can_manage_project_v2(_project_id, _quem) THEN
    RAISE EXCEPTION 'sem permissao para convidar neste projeto'
      USING ERRCODE = '42501';
  END IF;

  -- Só para quem TEM convite pendente. Impede usar esta função como porta
  -- para notificar qualquer pessoa: o destinatário tem de ser um convidado
  -- real, criado no passo anterior do mesmo fluxo.
  --
  -- `NOT EXISTS` evita convite repetido quando a tela é reenviada -- a pessoa
  -- receberia dois cartões para o mesmo projeto, e responder um deixaria o
  -- outro pendurado.
  INSERT INTO public.notifications (project_id, target_user_id, type, title, message)
  SELECT _project_id, pm.user_id, 'project_invite', _titulo, _mensagem
    FROM public.project_members pm
   WHERE pm.project_id = _project_id
     AND pm.user_id = ANY(_user_ids)
     AND COALESCE(pm.invitation_status, 'accepted') = 'pending'
     AND NOT EXISTS (
       SELECT 1 FROM public.notifications n
        WHERE n.project_id = _project_id
          AND n.target_user_id = pm.user_id
          AND n.type = 'project_invite'
          AND n.is_read = false
     );

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

COMMENT ON FUNCTION public.enviar_convites_do_projeto(uuid, uuid[], text, text) IS
  'Cria as notificacoes de convite de um projeto. SECURITY DEFINER porque o convidado ainda esta "pending" e por isso nao passa na politica de notifications; a permissao conferida e a de QUEM CONVIDA (can_manage_project_v2).';

REVOKE ALL ON FUNCTION public.enviar_convites_do_projeto(uuid, uuid[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enviar_convites_do_projeto(uuid, uuid[], text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
