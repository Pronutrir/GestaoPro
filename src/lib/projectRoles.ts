/**
 * PAPEL NO PROJETO — fonte única (o que a pessoa faz nas atividades DESTE
 * projeto).
 *
 * É o terceiro eixo do modelo de acesso, e o mais local dos três:
 *
 *   1. CARGO           `profiles.role_title`  — quem a pessoa É na organização.
 *                      Descritivo, não concede nada. Ver lib/orgLevels.ts.
 *   2. ACESSO AO SISTEMA `user_roles.role`    — a que TELAS ela chega. Vale no
 *                      sistema inteiro. Ver lib/accessLevels.ts.
 *   3. PAPEL NO PROJETO  `project_members.can_*` — o que ela FAZ nas atividades
 *                      deste projeto. Muda de projeto para projeto. É este.
 *
 * O eixo 2 é um TETO sobre o eixo 3, nunca um piso: quem é Visualizador no
 * sistema (`canWrite = false`) não edita nada, por mais permissivo que seja o
 * papel no projeto. A regra do mais restritivo vale sempre.
 *
 * ── POR QUE OS NOMES SÃO VERBOS ────────────────────────────────────────────
 *
 * Os rótulos anteriores eram "Acompanhar / Executar / Coordenar", e
 * "Coordenar" colidia de frente: "Coordenador" já é um CARGO (eixo 1) e um
 * NÍVEL DE ACESSO (eixo 2). A mesma raiz significava três coisas diferentes, e
 * era possível ler numa tela "Coordenadora de Vendas, acesso de Colaborador,
 * Coordenar no projeto".
 *
 * Pesquisa em 10 produtos (18/08/2026), priorizando os brasileiros: TODOS os
 * que nomeiam permissão com SUBSTANTIVO caem em Administrador / Gestor /
 * Membro / Colaborador / Visualizador / Externo — Runrun.it usa "Gestor" e
 * "Colaborador", Artia usa "Externo", monday Enterprise usa "Visualizador".
 * São exatamente as palavras que os eixos 1 e 2 já ocupam, e não por acaso:
 * substantivo nomeia UM TIPO DE PESSOA, que é o trabalho daqueles eixos.
 *
 * Verbo descreve a AÇÃO e vive noutro eixo gramatical, então não compete.
 * "Coordenadora de Vendas (cargo), acesso de Colaborador (sistema), pode
 * editar tudo (neste projeto)" não repete nenhuma palavra.
 *
 * Os rótulos daqui seguem o monday em português, que é o único produto com
 * string real para o nível "só as minhas" ("Editar apenas elementos
 * atribuídos"). NUNCA reintroduzir: Coordenar, Editor, Contribuidor, Membro,
 * Administrador, Responsável, Líder, Proprietário, Gestor, Colaborador,
 * Externo, Visualizador.
 */

export type PapelId = "visualizar" | "editar_minhas" | "editar_tudo" | "editar_excluir";

export interface PapelProjeto {
  id: PapelId;
  /** rótulo exibido no seletor */
  nome: string;
  /** descrição visível sob o seletor (não é tooltip: fica sempre na tela) */
  hint: string;
  /** ordem hierárquica (0 = mais permissivo) */
  rank: number;
  /** o que grava nas colunas de permissão de project_members */
  perms: {
    can_create: boolean;
    can_edit: boolean;
    can_delete: boolean;
    can_move: boolean;
    /**
     * Edita as atividades em que a pessoa atua (responsável, participante ou
     * criador). É o que separa "Editar apenas as minhas" de "Visualizar e
     * comentar" — sem esta coluna os dois níveis gravavam exatamente as mesmas
     * quatro colunas, e a escolha do gestor se perdia ao reabrir a tela.
     *
     * Note o que ela NÃO faz: quem tem `can_edit` edita tudo de qualquer jeito,
     * e o vínculo com a atividade continua concedendo edição pela RLS
     * (`is_activity_actor_v2`). O que a coluna adiciona é a possibilidade de
     * dizer "não edita nem as dela", que antes era inexprimível.
     */
    can_edit_own: boolean;
  };
}

/**
 * Os quatro níveis, do mais permissivo ao mais restrito.
 *
 * O que separa `editar_minhas` de `visualizar` é `can_edit_own` — sem essa
 * coluna os dois gravavam as mesmas quatro colunas, e escolher "Visualizar e
 * comentar" era indistinguível de escolher o nível acima: o gestor salvava,
 * reabria a tela e lia outra coisa.
 *
 * Mesmo com a coluna, o vínculo com a atividade continua valendo por fora:
 * quem é responsável/participante/criador edita AQUELA atividade pela RLS
 * (`is_activity_actor_v2`), que é a arquitetura do Jira — não existe uma
 * permissão "Edit Own Issues"; existe `Edit Issues` concedida ao destinatário
 * dinâmico "Current Assignee". O eixo "só o meu" vive em QUEM recebe, não no
 * NOME da permissão.
 *
 * `can_edit_own = false` é o que faltava poder dizer: "não edita nem as dela".
 */
export const PAPEIS_PROJETO: PapelProjeto[] = [
  {
    id: "editar_excluir",
    nome: "Editar e excluir",
    hint: "cria, edita, move e exclui qualquer atividade do projeto",
    rank: 0,
    perms: { can_create: true, can_edit: true, can_delete: true, can_move: true, can_edit_own: true },
  },
  {
    id: "editar_tudo",
    nome: "Editar tudo",
    hint: "cria, edita e move qualquer atividade. Não exclui",
    rank: 1,
    perms: { can_create: true, can_edit: true, can_delete: false, can_move: true, can_edit_own: true },
  },
  {
    id: "editar_minhas",
    nome: "Editar apenas as minhas",
    hint: "vê todas as atividades. Edita só onde é responsável ou participante",
    rank: 2,
    perms: { can_create: false, can_edit: false, can_delete: false, can_move: false, can_edit_own: true },
  },
  {
    id: "visualizar",
    nome: "Visualizar e comentar",
    hint: "lê e comenta. Não cria, não edita, não move",
    rank: 3,
    perms: { can_create: false, can_edit: false, can_delete: false, can_move: false, can_edit_own: false },
  },
];

/**
 * Padrão de quem entra na equipe.
 *
 * "Editar tudo" (e não o nível mais alto): adicionar alguém à equipe significa
 * que a pessoa vai trabalhar no projeto, mas excluir atividade dos outros é
 * outra conversa — 39 dos 72 membros podiam excluir em 18/08/2026, e isso veio
 * de uma migration de backward-compat de maio, não de escolha de ninguém.
 *
 * Usado pelas DUAS telas (AddProjectDialog e EditProjectDialog). Elas
 * divergiam: uma gravava `can_create` sozinho, a outra o preset completo.
 */
export const PAPEL_PADRAO: PapelId = "editar_tudo";

/** O papel pelo id, com fallback no padrão. */
export function papelPorId(id: string | null | undefined): PapelProjeto {
  return (
    PAPEIS_PROJETO.find((p) => p.id === id) ??
    PAPEIS_PROJETO.find((p) => p.id === PAPEL_PADRAO)!
  );
}

/** As quatro colunas para gravar, a partir do id do papel. */
export function permissoesDoPapel(id: string | null | undefined) {
  return { ...papelPorId(id).perms };
}

/**
 * Das colunas de volta para o papel — para a tela abrir mostrando o que de
 * fato vale.
 *
 * ATENÇÃO: esta função é LOSSY por natureza — há 2^5 combinações de colunas e
 * só 4 presets. Combinações que não casam com nenhum preset são aproximadas
 * para o mais próximo, e por isso o resultado dela NUNCA deve ser gravado de
 * volta sem o usuário ter escolhido: seria promover ou rebaixar alguém em
 * silêncio. Quem chama precisa comparar com o papel original antes de gravar
 * (ver `papelOriginal` no EditProjectDialog) — corrigir dado torto é papel de
 * migration, onde fica registrado.
 *
 * A ordem dos testes é do mais forte para o mais fraco, então uma linha com
 * qualquer permissão ampla cai no preset correspondente, e só as linhas sem
 * nenhuma delas chegam à distinção por `can_edit_own`.
 */
export function papelDePermissoes(p: {
  can_create?: boolean | null;
  can_edit?: boolean | null;
  can_delete?: boolean | null;
  can_move?: boolean | null;
  can_edit_own?: boolean | null;
}): PapelId {
  if (p.can_delete) return "editar_excluir";
  if (p.can_edit || p.can_move || p.can_create) return "editar_tudo";
  // Sem permissão ampla: a coluna decide se edita as próprias ou nada.
  // `undefined` (linha antiga, antes da migration 20260818170000) conta como
  // `true` — é o comportamento que o sistema sempre teve, e assumir `false`
  // faria a tela mostrar todo mundo como só-leitura no dia da migration.
  return p.can_edit_own === false ? "visualizar" : "editar_minhas";
}
