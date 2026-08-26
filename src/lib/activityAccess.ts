/**
 * QUEM PODE MEXER NUMA ATIVIDADE — fonte única, espelho de `can_update_activity_v2`.
 *
 * ============================================================================
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * A pergunta "esta atividade é minha?" estava escrita SEIS vezes: duas em
 * `canMutateActivity` (uma na página do projeto, outra no ActivityKanban), uma
 * em `isMineActivity`, uma inline em `useProjectAccess`, e mais duas em SQL
 * (`is_activity_actor_v2` e `tem_atividade_no_projeto_v2`).
 *
 * As duas de `canMutateActivity` DIVERGIAM: a do Kanban era
 * `isAdmin || canEdit || canMove || isMineActivity` e não reconhecia o líder
 * nem o gestor do projeto; a da página reconhecia. A mesma pessoa via o botão
 * numa tela e não via na outra — e o próprio comentário do código admitia que
 * "as duas existem lado a lado com regras diferentes".
 *
 * Cada uma foi corrigida em data diferente, por um sintoma diferente. Unificar
 * é o que impede a divergência de voltar na próxima correção.
 * ============================================================================
 *
 * A ORDEM DOS TESTES ESPELHA A RLS (`can_update_activity_v2`), do vínculo mais
 * forte para o mais fraco:
 *
 *   1. admin do sistema                      → is_admin_user_v2
 *   2. líder ou gestor DESTE projeto         → is_project_leader_v2
 *   3. equipe com can_edit / can_move        → can_member_action
 *   4. criador, responsável ou participante  → is_activity_actor_v2
 *
 * O nível de acesso GLOBAL (Gestor/Coordenador) sozinho NÃO basta: o banco
 * nunca reconheceu isso para mutar atividade de outra pessoa, e a tela não
 * deve prometer o que o banco recusa.
 *
 * A comparação é por identidade tolerante (`matchesIdentity`) porque `owner`,
 * `manager`, `assigned_to` e `participants` são TEXTO LIVRE com o nome da
 * pessoa, não FK — parte da base guarda UUID nesses campos, e a RLS faz a
 * mesma comparação frouxa (nome, email ou uuid).
 */
import { anyMatchesIdentity, buildUserCandidates, matchesIdentity } from "@/lib/identityMatch";

/** O que precisamos saber da atividade. Propositalmente mínimo. */
export interface AtividadeParaAcesso {
  created_by?: string | null;
  assigned_to?: string | null;
  participants?: string[] | null;
}

/** O que precisamos saber do projeto — os dois campos de liderança. */
export interface ProjetoParaAcesso {
  owner?: string | null;
  manager?: string | null;
}

/** Quem está perguntando, e o que a equipe lhe concede neste projeto. */
export interface UsuarioParaAcesso {
  /** admin do SISTEMA (o interruptor), não "canManage". */
  isAdmin?: boolean;
  id?: string | null;
  email?: string | null;
  fullName?: string | null;
  profileId?: string | null;
  /** de `project_members.can_edit` — permissão de equipe, já resolvida. */
  canEdit?: boolean;
  /** de `project_members.can_move`. */
  canMove?: boolean;
  /**
   * de `project_members.can_edit_own` — edita as atividades em que ATUA
   * (responsável, participante ou criador).
   *
   * É a ÚNICA coluna que separa o papel "Editar apenas as minhas" (true) do
   * "Visualizar e comentar" (false); as outras quatro são `false` nos dois.
   * Escolher entre esses dois papéis na tela sempre gravou o valor certo — só
   * que ninguém lia: nem o front, nem a RLS. Os dois papéis se comportavam
   * igual, e "Visualizar e comentar" editava assim mesmo.
   *
   * `undefined` conta como `true`: é o comportamento que o sistema sempre teve,
   * e a coluna nasceu com DEFAULT true justamente para não tirar acesso de
   * ninguém na migration de 18/08. Quem não é membro da equipe chega aqui com
   * `undefined` e seu acesso vem do vínculo, como antes.
   */
  canEditOwn?: boolean;
}

/**
 * `true` se a pessoa pode editar/mover/concluir ESTA atividade.
 *
 * Não cobre EXCLUIR: a policy de DELETE não aceita a via do ator (item 4) —
 * só admin, líder/gestor e `can_member_action('delete')`. Quem precisa dessa
 * resposta tem de testar `can_delete` separadamente, senão a tela volta a
 * prometer o que o banco recusa.
 */
export function podeMutarAtividade(
  atividade: AtividadeParaAcesso | null | undefined,
  projeto: ProjetoParaAcesso | null | undefined,
  usuario: UsuarioParaAcesso,
): boolean {
  if (!atividade) return false;
  if (usuario.isAdmin) return true;

  // 3. Equipe com permissão: vale para QUALQUER atividade do projeto, então é
  //    testado antes de montar os candidatos de identidade (mais barato).
  if (usuario.canEdit || usuario.canMove) return true;

  const candidatos = buildUserCandidates([
    usuario.fullName,
    usuario.email,
    usuario.profileId,
    usuario.id,
  ]);
  if (candidatos.length === 0 && !usuario.id) return false;

  // 2. Líder ou gestor DESTE projeto. ANTES da via do ator, de propósito:
  //    quem lidera não depende de `can_edit_own`, que é permissão de MEMBRO.
  if (projeto && (matchesIdentity(projeto.owner, candidatos) || matchesIdentity(projeto.manager, candidatos))) {
    return true;
  }

  /**
   * 4. VIA DO ATOR — e é aqui, e só aqui, que `can_edit_own` manda.
   *
   * O papel "Visualizar e comentar" grava `can_edit_own = false` para dizer
   * "não edita NEM as dela". Sem este teste, os quatro `false` das outras
   * colunas caíam direto na via do ator e a pessoa editava assim mesmo — os
   * papéis "Editar apenas as minhas" e "Visualizar e comentar" ficavam
   * indistinguíveis, que era o defeito relatado.
   *
   * Não afeta quem tem `can_edit`/`can_move`: esses já retornaram `true` lá em
   * cima, e a coluna nunca foi um teto sobre eles.
   */
  if (usuario.canEditOwn === false) return false;

  // 4a. Criador da atividade — comparação por id, que é FK de verdade aqui.
  if (usuario.id && atividade.created_by && atividade.created_by === usuario.id) return true;

  // 4b. Responsável OU participante — a RLS reconhece os dois.
  if (matchesIdentity(atividade.assigned_to, candidatos)) return true;
  return Array.isArray(atividade.participants)
    && anyMatchesIdentity(atividade.participants, candidatos);
}

/**
 * O vínculo com a atividade em si — criador, responsável ou participante —
 * IGNORANDO o que a equipe concede. É o espelho de `is_activity_actor_v2`.
 *
 * Serve para as telas que precisam distinguir "é meu trabalho" de "eu posso
 * mexer": o filtro "Minhas", o recorte de quem entra só por atividade, e o
 * degrau intermediário de acesso. Não confundir com `podeMutarAtividade`.
 */
export function ehAtividadeDaPessoa(
  atividade: AtividadeParaAcesso | null | undefined,
  usuario: Pick<UsuarioParaAcesso, "id" | "email" | "fullName" | "profileId">,
): boolean {
  if (!atividade) return false;
  const candidatos = buildUserCandidates([
    usuario.fullName,
    usuario.email,
    usuario.profileId,
    usuario.id,
  ]);
  if (usuario.id && atividade.created_by && atividade.created_by === usuario.id) return true;
  if (matchesIdentity(atividade.assigned_to, candidatos)) return true;
  return Array.isArray(atividade.participants)
    && anyMatchesIdentity(atividade.participants, candidatos);
}
