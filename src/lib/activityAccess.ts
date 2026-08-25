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

  // 4a. Criador da atividade — comparação por id, que é FK de verdade aqui.
  if (usuario.id && atividade.created_by && atividade.created_by === usuario.id) return true;

  // 2. Líder ou gestor DESTE projeto.
  if (projeto && (matchesIdentity(projeto.owner, candidatos) || matchesIdentity(projeto.manager, candidatos))) {
    return true;
  }

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
