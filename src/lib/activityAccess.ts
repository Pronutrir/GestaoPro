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

  /**
   * O pai desta atividade — só usado para subir a árvore localmente
   * (`souResponsavelDeAncestralNaArvore`). Ausente/`null` em consultas que
   * não pedem a coluna: nesse caso a subida simplesmente não acontece.
   */
  parent_id?: string | null;

  // ── Identificador, quando a conversão já respondeu ──────────────────────
  // Migration 20260826200000. Quando presentes, MANDAM: são FK, e homônimo
  // não os confunde. Quando ausentes (pendente, ou consulta que não pediu a
  // coluna), a comparação por texto continua valendo — e ela já recusa nome
  // ambíguo desde 20260826180000.
  assigned_to_id?: string | null;
  participant_ids?: string[] | null;

  /**
   * O RESPONSÁVEL DO PAI — para destravar a atribuição nas filhas.
   *
   * OPCIONAL de propósito: quem não passar mantém o comportamento anterior.
   * Quem passar permite que o dono de uma entrega distribua o trabalho dela.
   *
   * Não é o pai inteiro, é só quem responde por ele. A função de acesso não
   * deve precisar carregar a árvore para responder uma pergunta de permissão.
   */
  responsavel_do_pai?: string | null;
  responsavel_do_pai_id?: string | null;

  /**
   * O usuário é RESPONSÁVEL de um ANCESTRAL desta atividade (a subárvore).
   *
   * Pré-resolvido: a página chama a função SQL
   * `eh_descendente_de_atividade_do_responsavel(activityId, userId)` (que sobe a
   * árvore inteira) e passa o booleano aqui. A função de acesso não carrega a
   * árvore — pergunta de permissão não deve puxar dados. `responsavel_do_pai`
   * (pai DIRETO) continua honrado como atalho quando este não vier.
   *
   * Espelha, no cliente, a via de EDIÇÃO da subárvore que a RLS concede em
   * `can_update_activity_v2` via `eh_descendente_de_atividade_do_responsavel`
   * (migration 20260901120000). Decisão do dono do produto em 01/09/2026:
   * quem responde por um ramo edita e atribui em todo o ramo.
   */
  souResponsavelDeAncestral?: boolean;
}

/**
 * A pessoa é o responsável/participante POR IDENTIFICADOR?
 *
 * `null` quando a atividade não traz as colunas novas — e null aqui significa
 * "não sei", não "não é". Quem chama cai na comparação por texto.
 */
function vinculoPorIdentificador(
  atividade: AtividadeParaAcesso,
  userId: string | null | undefined,
): boolean | null {
  if (!userId) return null;
  const temColunas =
    atividade.assigned_to_id !== undefined || atividade.participant_ids !== undefined;
  if (!temColunas) return null;

  if (atividade.assigned_to_id && atividade.assigned_to_id === userId) return true;
  if (Array.isArray(atividade.participant_ids) && atividade.participant_ids.includes(userId)) {
    return true;
  }

  // As colunas vieram e a pessoa não está nelas. Só é resposta definitiva se
  // o registro FOI convertido: `assigned_to_id` nulo com `assigned_to`
  // preenchido é um pendente (nome ambíguo), e aí o texto ainda decide.
  const convertido = !!atividade.assigned_to_id || !atividade.assigned_to;
  return convertido ? false : null;
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
  /**
   * perfil **Visualizador** — `user_roles.role = 'visualizador'`.
   *
   * É um TETO: anula qualquer papel de projeto, por mais permissivo que seja.
   * Decisão confirmada em 26/08/2026, seguindo o modelo monday (o único dos 7
   * produtos pesquisados que trata o papel global como verbo, e o trata como
   * teto rígido — inclusive fechando a rota de escape).
   *
   * Vivia FORA desta função, na página (`canEdit = canWrite && ...`), o que
   * fazia `podeMutarAtividade` responder errado para quem a chamasse sem
   * multiplicar por `canWrite` — exatamente o caso do ActivityKanban.
   */
  ehVisualizador?: boolean;
  /** de `project_members.can_create`. */
  canCreate?: boolean;
  /** de `project_members.can_edit` — permissão de equipe, já resolvida. */
  canEdit?: boolean;
  /** de `project_members.can_delete`. */
  canDelete?: boolean;
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

  /**
   * 2. Visualizador ENCERRA — precisa vir ANTES de qualquer outro passo.
   *
   * Sem este teste, um Visualizador que fosse responsável/participante de uma
   * atividade (via `assigned_to`/`participants`) editava por essa via: a via
   * do ator só olha `canEditOwn` (coluna de EQUIPE), que não tem relação
   * nenhuma com o perfil Visualizador do SISTEMA. Era possível editar mesmo
   * sendo só-leitura. Espelha o passo 2 de `capacidadesNaAtividade` — a
   * mesma regra vivia em dois lugares e só um deles a aplicava.
   */
  if (usuario.ehVisualizador) return false;

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

  // 4c ANTES de 4b terminar. Motivo: quando as colunas de identificador ja
  // vieram convertidas, vinculoPorIdentificador devolve `false` DEFINITIVO
  // (nao null) -- e um `return porId` ali encerraria a funcao ANTES de
  // chegar no teste da subarvore. Era exatamente o caso de A.1 (colunas
  // convertidas, vinculo direto nenhum, mas RESP responde por A, o pai):
  // a funcao retornava false sem nunca olhar `souResponsavelDeAncestral`.
  // Reportado em 04/09/2026 (teste 3.2 do checklist).
  if (atividade.souResponsavelDeAncestral) return true;

  // 4b. Responsável OU participante — a RLS reconhece os dois.
  //     IDENTIFICADOR primeiro: quando a conversão já respondeu, homônimo não
  //     confunde. Só cai no texto quando a resposta por id é "não sei".
  const porId = vinculoPorIdentificador(atividade, usuario.id);
  if (porId !== null) return porId;

  if (matchesIdentity(atividade.assigned_to, candidatos)) return true;
  if (Array.isArray(atividade.participants) && anyMatchesIdentity(atividade.participants, candidatos)) {
    return true;
  }

  // 4c (continuacao). O atalho do PAI DIRETO (responsavel_do_pai) e a
  // comparacao textual continuam aqui para quem nao tem `souResponsavelDeAncestral`
  // pre-calculado (ex.: telas que so mandam o pai direto, nao o RPC completo).
  return matchesIdentity(atividade.responsavel_do_pai, candidatos)
    || (!!atividade.responsavel_do_pai_id && !!usuario.id
        && atividade.responsavel_do_pai_id === usuario.id);
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

  // Identificador primeiro — mesma precedência de `podeMutarAtividade`.
  const porId = vinculoPorIdentificador(atividade, usuario.id);
  if (porId !== null) return porId;

  if (matchesIdentity(atividade.assigned_to, candidatos)) return true;
  return Array.isArray(atividade.participants)
    && anyMatchesIdentity(atividade.participants, candidatos);
}

/**
 * A pessoa é o RESPONSÁVEL desta atividade? (não participante, não criador.)
 *
 * Espelho de `eh_responsavel_da_atividade_v2` (SQL): só o vínculo de
 * responsável — a FK `assigned_to_id` quando presente, senão a coluna legada
 * `assigned_to`. NUNCA `participants`. É o que distingue quem ganha o poder
 * sobre a subárvore (responsável) de quem não ganha (participante).
 */
export function ehResponsavelDaAtividade(
  atividade: AtividadeParaAcesso | null | undefined,
  usuario: Pick<UsuarioParaAcesso, "id" | "email" | "fullName" | "profileId">,
): boolean {
  if (!atividade) return false;
  if (usuario.id && atividade.assigned_to_id && atividade.assigned_to_id === usuario.id) return true;
  // `assigned_to_id` presente e diferente = convertido: o texto não decide mais.
  if (atividade.assigned_to_id) return false;
  const candidatos = buildUserCandidates([
    usuario.fullName, usuario.email, usuario.profileId, usuario.id,
  ]);
  return matchesIdentity(atividade.assigned_to, candidatos);
}

/**
 * Sobe a árvore, a partir de `atividade.parent_id`, em busca de um ANCESTRAL
 * do qual `usuario` é responsável — versão CLIENT-SIDE de
 * `eh_descendente_de_atividade_do_responsavel` (RLS, 20260901120000), para
 * telas que já têm a lista de atividades do projeto em memória (o Kanban) e
 * não querem pagar um round-trip de RPC por card.
 *
 * `porId` é o mapa id -> atividade (mesmo formato de `AtividadeParaAcesso`,
 * com pelo menos `id`, `parent_id`, `assigned_to_id`, `assigned_to`).
 */
export function souResponsavelDeAncestralNaArvore(
  atividade: AtividadeParaAcesso | null | undefined,
  porId: Map<string, AtividadeParaAcesso>,
  usuario: Pick<UsuarioParaAcesso, "id" | "email" | "fullName" | "profileId">,
): boolean {
  if (!atividade?.parent_id || !usuario.id) return false;
  const candidatos = buildUserCandidates([
    usuario.fullName, usuario.email, usuario.profileId, usuario.id,
  ]);
  const visitados = new Set<string>();
  let paiId: string | null | undefined = atividade.parent_id;
  while (paiId && !visitados.has(paiId)) {
    visitados.add(paiId);
    const pai = porId.get(paiId);
    if (!pai) break;
    if (pai.assigned_to_id) {
      if (pai.assigned_to_id === usuario.id) return true;
    } else if (matchesIdentity(pai.assigned_to, candidatos)) {
      return true;
    }
    paiId = pai.parent_id;
  }
  return false;
}

/**
 * A pessoa pode EXCLUIR (arquivar/soft-delete) esta atividade?
 *
 * NÃO é sinônimo de `podeMutarAtividade` — excluir é uma capacidade própria,
 * mais estreita. `podeMutarAtividade` também retorna `true` para quem só tem
 * `canEdit`/`canMove` (sem `canDelete`) e para PARTICIPANTE simples (via
 * ator, sem ser responsável) — nenhum dos dois deveria poder excluir.
 *
 * FALTAVA. O card do Kanban usava `podeMexer` (== `canMutateActivity` ==
 * `podeMutarAtividade`) para desenhar o botão "Arquivar", e por isso:
 *   - participante sem responsabilidade via e conseguia excluir (a decisão de
 *     04/09/2026 é `canDelete: ehResponsavelDoRamo`, não "qualquer ator");
 *   - papel "Editar tudo" (`canEdit`/`canMove`, sem `canDelete`) via e
 *     conseguia excluir, quando o roteiro do produto nunca deu exclusão a
 *     este papel.
 * Reportado em 04/09/2026 (testes 2.6 e 4.1 do checklist).
 *
 * Espelha `capacidadesNaAtividade` (passo 4: `canDelete: ehResponsavelDoRamo`
 * quando `equipe.canDelete` não veio `true`; passo 5: responsável do ramo).
 */
export function podeExcluirAtividade(
  atividade: AtividadeParaAcesso | null | undefined,
  projeto: ProjetoParaAcesso | null | undefined,
  usuario: UsuarioParaAcesso,
): boolean {
  if (!atividade) return false;
  if (usuario.isAdmin) return true;
  if (usuario.ehVisualizador) return false;

  // Equipe: só quem tem `canDelete` de verdade — `canEdit`/`canMove` sozinhos
  // NÃO bastam (é exatamente o que os distingue de "Editar tudo").
  if (usuario.canDelete) return true;

  const candidatos = buildUserCandidates([
    usuario.fullName, usuario.email, usuario.profileId, usuario.id,
  ]);

  // Líder ou gestor do projeto exclui qualquer atividade dele.
  if (projeto && (matchesIdentity(projeto.owner, candidatos) || matchesIdentity(projeto.manager, candidatos))) {
    return true;
  }

  // "Visualizar e comentar" (can_edit_own = false) não exclui nem as suas.
  if (usuario.canEditOwn === false) return false;

  // Responsável do ramo — direto (assigned_to/assigned_to_id) ou de um
  // ancestral (a subárvore). NUNCA participante simples, NUNCA criador sem
  // ser responsável — excluir é mais estreito que editar.
  if (ehResponsavelDaAtividade(atividade, usuario)) return true;
  return !!atividade.souResponsavelDeAncestral
    || matchesIdentity(atividade.responsavel_do_pai, candidatos)
    || (!!atividade.responsavel_do_pai_id && !!usuario.id
        && atividade.responsavel_do_pai_id === usuario.id);
}

/* ────────────────────────────────────────────────────────────────────────────
 * FASE 03 — CAPACIDADES NOMEADAS
 *
 * `podeMutarAtividade` responde um booleano só, e por isso as telas foram
 * inventando gates por fora dela (`canWrite &&`, `canDelete`, `!isChangeBlocked`).
 * Cada gate por fora é uma chance de a resposta divergir do banco.
 *
 * `capacidadesNaAtividade` responde o conjunto inteiro, mais o PASSO que
 * decidiu — o passo é o que torna o resultado auditável e é conferido pelos
 * 108 casos de `docs/atividade-v2/matriz-acesso.json`.
 *
 * A ordem espelha `can_update_activity_v2`:
 *   1 admin → 2 Visualizador (encerra) → 3 líder/gestor → 4 equipe → 5 ator → 6 nada
 * ──────────────────────────────────────────────────────────────────────────── */

/** O passo da ordem de decisão que produziu o resultado. */
export type PassoDeAcesso =
  | "1-admin"
  | "2-perfil-visualizador"
  | "3-dono-gestor-do-projeto"
  | "4-equipe-editar-e-excluir"
  | "4-equipe-editar-tudo"
  | "4-equipe-editar-apenas-as-minhas"
  | "4-equipe-visualizar-e-comentar"
  | "5-ator-da-atividade"
  | "6-sem-acesso";

/** Até onde a pessoa enxerga. */
export type EscopoDeLeitura = "projeto" | "atividade_e_trilha" | "nenhum";

export interface CapacidadesNaAtividade {
  canView: boolean;
  canComment: boolean;
  /** status, datas reais, horas apontadas, anexos. */
  canEditExecucao: boolean;
  /** previsto, GUT, custo, posição na EAP. */
  canEditPlanejamento: boolean;
  canAssign: boolean;
  canPromover: boolean;
  canAssumir: boolean;
  /** criar subatividade dentro do ramo (RLS: 20260904150000). */
  canCreate: boolean;
  canDelete: boolean;
  canManageTeam: boolean;
  passoQueDecidiu: PassoDeAcesso;
  escopoDeLeitura: EscopoDeLeitura;
}

const NADA: Omit<CapacidadesNaAtividade, "passoQueDecidiu" | "escopoDeLeitura"> = {
  canView: false, canComment: false, canEditExecucao: false, canEditPlanejamento: false,
  canAssign: false, canPromover: false, canAssumir: false, canCreate: false, canDelete: false, canManageTeam: false,
};
const TUDO: typeof NADA = {
  canView: true, canComment: true, canEditExecucao: true, canEditPlanejamento: true,
  canAssign: true, canPromover: true, canAssumir: true, canCreate: true, canDelete: true, canManageTeam: true,
};

/**
 * O que esta pessoa pode fazer NESTA atividade.
 *
 * `naEquipe` distingue "membro sem permissão de escrita" de "não é membro" —
 * as duas situações chegam com `canEdit/canMove/canCreate/canDelete` falsos, e
 * só a primeira é um papel de equipe.
 */
export function capacidadesNaAtividade(
  atividade: AtividadeParaAcesso | null | undefined,
  projeto: ProjetoParaAcesso | null | undefined,
  usuario: UsuarioParaAcesso & { naEquipe?: boolean },
): CapacidadesNaAtividade {
  const monta = (
    base: typeof NADA,
    passo: PassoDeAcesso,
    escopo: EscopoDeLeitura,
  ): CapacidadesNaAtividade => ({ ...base, passoQueDecidiu: passo, escopoDeLeitura: escopo });

  // 1 — admin do sistema
  if (usuario.isAdmin) return monta(TUDO, "1-admin", "projeto");

  const ator = ehAtividadeDaPessoa(atividade, usuario);
  const candidatos = buildUserCandidates([
    usuario.fullName, usuario.email, usuario.profileId, usuario.id,
  ]);
  const lideraProjeto = !!projeto
    && (matchesIdentity(projeto.owner, candidatos) || matchesIdentity(projeto.manager, candidatos));

  // RESPONSÁVEL DO RAMO — desta atividade OU de um ancestral (a subárvore).
  // Espelha `eh_descendente_de_atividade_do_responsavel` (RLS, 20260901120000):
  // quem responde por um ramo edita o plano e atribui em todo o ramo. O
  // ancestral vem pré-resolvido em `souResponsavelDeAncestral` (a página chama a
  // função SQL, que sobe a árvore inteira); `responsavel_do_pai` segue honrado
  // como atalho do pai direto quando o booleano não vier.
  const ehResponsavelDeAncestral =
    !!atividade?.souResponsavelDeAncestral
    || matchesIdentity(atividade?.responsavel_do_pai, candidatos)
    || (!!atividade?.responsavel_do_pai_id && !!usuario.id
        && atividade.responsavel_do_pai_id === usuario.id);
  const ehResponsavelDoRamo =
    ehResponsavelDaAtividade(atividade, usuario) || ehResponsavelDeAncestral;

  /**
   * 2 — Visualizador ENCERRA A ESCRITA — mas comenta.
   *
   * Decisão de produto revista em 04/09/2026: o perfil de sistema Visualizador
   * pode comentar. Antes (26/08/2026) nem isso valia — a leitura desta versão
   * é que "comentário é escrita" e por isso caía junto com o resto. A decisão
   * nova separa as duas coisas: quem só acompanha ainda pode opinar/perguntar
   * sobre o que vê, sem poder editar nada. O papel de projeto "Visualizar e
   * comentar" (passo 4) já tratava comentário como algo à parte da edição —
   * esta mudança alinha o perfil de SISTEMA ao mesmo raciocínio.
   *
   * O QUE O TETO NÃO FAZ É CEGAR. Ele anula EDIÇÃO, não leitura nem comentário:
   * um Visualizador que lidera o projeto continua enxergando o projeto
   * inteiro e pode comentar — só não mexe em nada. Confundir os dois faria o
   * teto esconder de alguém justamente o que ele foi posto ali para
   * acompanhar.
   *
   * `lideraProjeto` é calculado antes deste bloco por isso: ele decide o
   * ESCOPO mesmo quando o passo 3 não chega a ser alcançado.
   */
  if (usuario.ehVisualizador) {
    const alcanca = usuario.naEquipe || lideraProjeto || ator;
    if (!alcanca) return monta(NADA, "6-sem-acesso", "nenhum");
    return monta(
      { ...NADA, canView: true, canComment: true },
      "2-perfil-visualizador",
      usuario.naEquipe || lideraProjeto ? "projeto" : "atividade_e_trilha",
    );
  }

  // 3 — líder ou gestor DESTE projeto
  if (lideraProjeto) {
    return monta(TUDO, "3-dono-gestor-do-projeto", "projeto");
  }

  // 4 — o papel na equipe
  if (usuario.naEquipe) {
    const escreve = !!(usuario.canEdit || usuario.canMove || usuario.canCreate);

    if (usuario.canDelete) {
      return monta({ ...TUDO, canManageTeam: false }, "4-equipe-editar-e-excluir", "projeto");
    }
    if (escreve) {
      return monta(
        { ...TUDO, canDelete: false, canManageTeam: false },
        "4-equipe-editar-tudo",
        "projeto",
      );
    }
    /**
     * As quatro colunas falsas. `can_edit_own` é o que separa os dois papéis
     * de baixo — e era lido por ninguém antes de 20260825150000.
     */
    if (usuario.canEditOwn === false) {
      return monta(
        { ...NADA, canView: true, canComment: true },
        "4-equipe-visualizar-e-comentar",
        "projeto",
      );
    }
    return monta(
      {
        ...NADA,
        canView: true,
        canComment: true,
        canAssumir: true,
        // Edita a própria (ator) OU a subárvore de que responde (ramo).
        canEditExecucao: ator || ehResponsavelDoRamo,
        canEditPlanejamento: ator || ehResponsavelDoRamo,
        /**
         * ATRIBUIR: sendo responsável DESTA atividade OU de um ANCESTRAL.
         *
         * Em 31/08 esta regra alcançava só o pai DIRETO ("NÃO ALARGA PARA A
         * ÁRVORE INTEIRA"), de propósito. Em 01/09 o dono do produto pediu o
         * contrário: quem responde por um ramo distribui o trabalho de todo o
         * ramo. `ehResponsavelDoRamo` (responsável desta atividade ou de um
         * ancestral) espelha `eh_descendente_de_atividade_do_responsavel` da RLS.
         * Participante segue sem atribuir — só o responsável.
         */
        canAssign: ehResponsavelDoRamo,
        /**
         * CRIAR subatividade dentro do próprio ramo — decisão de produto de
         * 04/09/2026 (RLS: 20260904150000/can_create_activity_v2). Só o
         * responsável do ramo, não o simples participante: criar uma peça
         * nova é decisão de quem responde pelo trabalho, não de quem só
         * executa uma tarefa dentro dele.
         */
        canCreate: ehResponsavelDoRamo,
        /**
         * EXCLUIR (soft-delete) dentro do próprio ramo — decisão de produto
         * de 04/09/2026, revertendo a trava de 01/09 ("responsável edita,
         * não exclui"). Só o responsável do ramo — participante continua sem
         * excluir. A UI/RLS efetivas de exclusão usam `canMutateActivity`
         * (UPDATE is_trashed), que já libera o responsável; este campo é o
         * que a tela consulta para decidir se MOSTRA o botão.
         */
        canDelete: ehResponsavelDoRamo,
      },
      "4-equipe-editar-apenas-as-minhas",
      "projeto",
    );
  }

  /**
   * 5 — chega pela atribuição (ator desta atividade) OU por responder por um
   * ANCESTRAL (a subárvore).
   *
   * RESPONSÁVEL DO RAMO edita o plano, atribui e agora também cria/exclui em
   * toda a subárvore — espelha `eh_descendente_de_atividade_do_responsavel`
   * da RLS (01/09/2026 para editar/atribuir; 04/09/2026 estendeu para
   * criar/excluir). Quem é só PARTICIPANTE/criador (ator sem responder pelo
   * ramo): execução apenas, no próprio trabalho — nunca cria nem exclui.
   * Escopo de leitura: a atividade e a subárvore.
   */
  if (ator || ehResponsavelDoRamo) {
    const base = ehResponsavelDoRamo
      ? {
          ...NADA,
          canView: true, canComment: true,
          canEditExecucao: true, canEditPlanejamento: true,
          canAssign: true, canCreate: true, canDelete: true,
        }
      : { ...NADA, canView: true, canComment: true, canEditExecucao: true };
    return monta(base, "5-ator-da-atividade", "atividade_e_trilha");
  }

  return monta(NADA, "6-sem-acesso", "nenhum");
}
