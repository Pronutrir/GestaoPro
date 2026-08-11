/**
 * Modelo EAP/WBS do GestãoPro — FONTE ÚNICA DA VERDADE.
 *
 * ============================================================================
 * O QUE O PMI DEFINE (estudado em 11/08/2026)
 *
 * O PMBOK define pacote de trabalho como "o trabalho definido no NÍVEL MAIS
 * BAIXO da estrutura analítica, para o qual custo e duração podem ser
 * estimados e gerenciados". E a regra dos 100% diz que a soma do trabalho no
 * nível filho é 100% do trabalho do pai.
 *
 * A consequência prática: Fase, Entrega e Pacote são POSIÇÕES na árvore, não
 * tipos que alguém escolhe. O mesmo item vira "pacote de trabalho" ou deixa de
 * ser conforme se acrescentem subitens abaixo dele. Só o MARCO é decisão real
 * de quem planeja — é o único que a estrutura não revela sozinha.
 *
 * Por isso o diálogo de edição MOSTRA o papel em vez de perguntá-lo: pedir ao
 * usuário o que o sistema já sabe abria espaço para respostas que contradizem
 * a árvore, e era a origem da confusão entre os quatro nomes.
 *
 * NOMENCLATURA: chamamos de "Atividade" o que o PMI chama de "pacote de
 * trabalho". É o termo que a equipe lê há meses, e o PMBOK não exige o dele.
 * ============================================================================
 *
 * Alinhado ao PMBOK/WBS (decomposição orientada a entregas, profundidade livre)
 * e simplificado para o uso real da plataforma: a INTERFACE trabalha com apenas
 * 3 papéis, evitando a ambiguidade "Pacote × Atividade" que confundia.
 *
 *   • Fase/Entrega — ÚNICO agrupador; pode existir em QUALQUER nível (aninhável).
 *   • Atividade    — folha de trabalho (vai para o Kanban; tem horas/custo/resp.).
 *   • Marco        — folha de controle, sem duração; nunca agrupa.
 *
 * COMPATIBILIDADE COM O BANCO: o banco ainda tem item_type='pacote'
 * (agrupador aninhado) por trás de triggers/migrations. Aqui 'pacote' é tratado
 * como um SINÔNIMO INTERNO de agrupador e SEMPRE exibido como "Fase". Ou seja,
 * o usuário nunca vê nem escolhe "Pacote", mas dados legados com 'pacote'
 * continuam válidos e aparecem como Fase/Entrega.
 *
 * O PAPEL VEM DO NÍVEL DA EAP, quando ele existe:
 *
 *   nível 1 (1, 2, 3…)          → Fase/Entrega
 *   nível 2+ (1.1, 1.1.1, 2.4…) → Atividade
 *
 * É a leitura clássica da EAP — "1. Fase / 1.1 Entrega / 1.1.1 Atividade" — e
 * foi a regra escolhida para a plataforma. Uma Atividade PODE ter subitens: o
 * aninhamento continua livre, o que o nível define é o RÓTULO, não a estrutura.
 * Horas e custo de quem tem filhos seguem somados deles, seja Fase ou Atividade.
 *
 * FALLBACK PELA FUNÇÃO: item sem `wbs_code` (criado direto no Kanban ou no
 * Backlog) não tem nível nenhum — e são a maioria da base. Para esses, vale a
 * regra anterior: quem agrupa aparece como Fase. Sem isso, todo item criado à
 * mão seria tratado como "nível 1" e viraria Fase em massa, deixando de receber
 * horas próprias.
 *
 * Este helper substitui as cópias divergentes de resolveKind que existiam em
 * BacklogSection, ActivityKanban e ProjectCronogramaPanel.
 */

/**
 * Papéis visíveis ao usuário.
 *
 * `fase` e `entrega` são AMBOS agrupadores e gravam item_type='fase' — o que os
 * separa é a posição na EAP, não a função:
 *
 *   Fase    = nível 1 (1, 2, 3…). Etapa do ciclo de vida do projeto.
 *   Entrega = nível 2+ que agrupa (1.1, 1.2.3…). Está DENTRO de uma fase; é o
 *             que ela produz. No PMBOK seria "pacote de trabalho", termo que a
 *             interface não usa por ter confundido antes.
 *
 * Sem essa separação, "1" e "1.1" apareciam os dois como "Fase" e a EAP ficava
 * achatada — a entrega deixava de estar dentro da fase e virava outra fase ao
 * lado dela.
 */
export type EapKind = "fase" | "entrega" | "atividade" | "marco";

/** Entrada mínima para resolver o papel de um item. */
export interface EapItemLike {
  item_type?: string | null;
  is_milestone?: boolean | null;
  /** Código da EAP (1, 1.2, 1.2.3…). Ausente em item criado à mão. */
  wbs_code?: string | null;
}

/**
 * Nível na EAP a partir do código: "1" → 1, "1.2" → 2, "1.2.3" → 3.
 * Devolve null quando não há código válido — aí o papel cai no fallback.
 */
export function eapLevel(wbsCode?: string | null): number | null {
  const raw = (wbsCode ?? "").trim();
  if (!raw) return null;
  // Só numeração pontuada conta. "Anexo A" ou "" não definem nível.
  if (!/^\d+(\.\d+)*$/.test(raw)) return null;
  // "1.0", "2.0.0" são nível 1 com zero decorativo — formato comum em EAP
  // exportada de planilha. Sem descartar os zeros à direita, "1.0" seria lido
  // como nível 2 e a fase do topo viraria atividade.
  const parts = raw.split(".");
  while (parts.length > 1 && parts[parts.length - 1] === "0") parts.pop();
  return parts.length;
}

/* ────────────────────────────────────────────────────────────────────────────
 * QUAL NÍVEL É A FASE — o número que a convenção de numeração decide
 *
 * Hoje a EAP começa nas fases e o projeto fica FORA da numeração:
 *
 *   1        Fase
 *   1.1      Entrega
 *   1.1.1    Atividade
 *
 * A convenção alternativa (decidida em 11/08/2026, ainda não migrada) coloca o
 * projeto no nível 1 e empurra tudo um degrau:
 *
 *   1        Projeto
 *   1.1      Fase
 *   1.1.1    Entrega
 *   1.1.1.1  Atividade
 *
 * A auditoria de 11/08 achou esta regra escrita em QUATRO lugares independentes
 * — `resolveEapKind`, `eapRoleForImport`, o painel de edição e o importador.
 * Trocar o número exigia lembrar dos quatro, e esquecer um produziria uma tela
 * discordando das outras sobre o papel do mesmo item: exatamente o defeito que
 * já custou caro aqui.
 *
 * Agora é UM número. `eapIsFaseLevel` e `eapIsProjectLevel` são a única forma
 * de perguntar, e a migração de convenção passa a ser a troca desta constante
 * mais a renumeração dos dados.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Nível da EAP ocupado pela Fase. 1 enquanto o projeto está fora da numeração. */
export const EAP_FASE_LEVEL = 1;

/** O nível ocupado pelo projeto, quando ele está na numeração. Null se não está. */
export const EAP_PROJECT_LEVEL: number | null =
  EAP_FASE_LEVEL > 1 ? EAP_FASE_LEVEL - 1 : null;

/** Este nível é o da Fase? */
export function eapIsFaseLevel(level: number | null | undefined): boolean {
  return level === EAP_FASE_LEVEL;
}

/** Este nível é o do projeto (a raiz que não é trabalho)? */
export function eapIsProjectLevel(level: number | null | undefined): boolean {
  return EAP_PROJECT_LEVEL !== null && level === EAP_PROJECT_LEVEL;
}

/**
 * Resolve o papel EAP EXIBIDO de um item.
 *
 * Ordem:
 *  1. is_milestone                       → Marco (vence sempre)
 *  2. tem wbs_code → nível da Fase       → Fase
 *                    abaixo dela         → Entrega (agrupa) ou Atividade
 *  3. sem wbs_code → agrupa              → Entrega
 *                    não agrupa          → Atividade
 *
 * `hasChildren` só é consultado no caso 3, para não desfazer a regra de nível
 * em item importado que agrupa (ex.: "2.1" com subitens continua Atividade).
 */
export function resolveEapKind(item: EapItemLike, hasChildren = false): EapKind {
  if (item.is_milestone) return "marco";

  const t = (item.item_type || "").trim().toLowerCase();
  const agrupa = t === "fase" || t === "pacote" || hasChildren;

  // COM código EAP: a posição manda. Só o nível da Fase é Fase — abaixo dela o
  // item está DENTRO de uma fase, então é Entrega (se agrupa) ou Atividade.
  const level = eapLevel(item.wbs_code);
  if (level !== null) {
    if (eapIsFaseLevel(level)) return "fase";
    return agrupa ? "entrega" : "atividade";
  }

  // SEM código (criado no Kanban/Backlog): não há nível, só a função. Quem
  // agrupa é Entrega, não Fase — item criado à mão nasce dentro de algo, e
  // chamá-lo de Fase sugeriria um nível de EAP que ele não tem.
  return agrupa ? "entrega" : "atividade";
}

/** Só os agrupadores — Fase (nível 1) e Entrega (abaixo dela). */
export function eapCanGroup(kind: EapKind): boolean {
  return kind === "fase" || kind === "entrega";
}

/** Folhas (não agrupam). */
export function eapIsLeaf(kind: EapKind): boolean {
  return !eapCanGroup(kind);
}

/**
 * Marco pode ser escolhido? É a única restrição REAL de tipo, e a única que as
 * três telas precisam concordar: marco é folha de controle e não agrupa, então
 * um item com subitens não pode virar marco. O trigger do banco também recusa.
 *
 * Substitui `eapTypeOptions`, que devolvia a lista inteira de opções e não era
 * chamada por ninguém: prometia decidir Fase × Entrega pelo nível, enquanto a
 * criação (sem código ainda) decide pelo destino e a edição mostra os quatro
 * papéis de propósito, avisando em vez de bloquear. Uma função que nenhuma tela
 * podia obedecer não era fonte única — era uma quarta regra.
 */
export function eapMilestoneAllowed(hasChildren: boolean): boolean {
  return !hasChildren;
}

/** Motivo a exibir quando Marco está bloqueado. Null quando é permitido. */
export function eapMilestoneBlockedReason(hasChildren: boolean): string | null {
  return hasChildren ? "Este item tem subitens; Marco não agrupa." : null;
}

/** Rótulos canônicos para a UI. */
export const EAP_LABELS: Record<EapKind, string> = {
  fase: "Fase",
  entrega: "Entrega",
  atividade: "Atividade",
  marco: "Marco",
};

/**
 * Dica de UMA LINHA para cada papel. Fica aqui porque as três telas que
 * escolhem tipo (criação rápida, edição, importação) descreviam o mesmo papel
 * com palavras diferentes — e a divergência é o que confunde quem planeja.
 */
export const EAP_HINTS: Record<EapKind, string> = {
  fase: "Nível 1 da EAP (1, 2, 3…). Agrupa entregas.",
  entrega: "Agrupador abaixo da fase (1.1, 1.2…). Contém atividades.",
  atividade: "Trabalho executável: vai ao Kanban, tem horas e responsável.",
  marco: "Ponto único no tempo (uma data, sem intervalo). Não tem horas nem custo.",
};

/**
 * Marco declarado pelo TÍTULO, do jeito que se escreve numa EAP colada.
 *
 * "Marco: TAP aprovado" · "Milestone – kickoff" · "🏁 Go-live" · "[M] Aprovação"
 *
 * É a única forma de declarar marco na importação: a EAP colada tem código e
 * título, e não há coluna que carregue "é marco". A regra vivia dentro do
 * diálogo de importação e não era mencionada em lugar nenhum da tela — está
 * aqui para que a tela possa DOCUMENTÁ-LA a partir da mesma fonte que a aplica.
 */
export function eapTitleDeclaresMilestone(titulo: string): boolean {
  const t = (titulo || "").trim();
  if (!t) return false;
  return /(^|\s)(marco|milestone)(\s|:|-|–|—|$)/i.test(t) || /🏁|\[m\]/i.test(t);
}

/**
 * item_type + is_milestone a gravar para cada papel escolhido.
 *
 * O agrupador é gravado como item_type='fase'. Para PROMOVER uma folha que
 * ganhou subitens sem trocar o rótulo de topo, prefira `eapGroupPersisted`,
 * que respeita o 'pacote' legado quando o banco ainda exige/aceita.
 */
/**
 * Papel de um item IMPORTADO, a partir de nível + filhos + título.
 *
 * A ordem não é negociável, e as duas primeiras regras vencem a palavra-chave:
 *
 *   nível 1        → Fase      (topo da EAP é fase, sempre)
 *   tem filhos     → Entrega   (marco não agrupa)
 *   título declara → Marco
 *   senão          → Atividade
 *
 * "Quem tem filhos nunca é marco" é proposital: EAPs reais usam
 * "Milestone 1 - Lançamento" como nome da FASE, e tratar isso como marco
 * quebrava o agrupamento — os filhos ficavam sem pai visível no Backlog e no
 * Cronograma.
 */
export function eapRoleForImport(opts: {
  depth: number;
  hasChildren: boolean;
  title: string;
}): EapKind {
  // eapIsFaseLevel em vez de `depth === 1`: era a segunda cópia da regra de
  // nível, e uma cópia que discorda das outras faz a mesma EAP ter papéis
  // diferentes na importação e no Backlog.
  if (eapIsFaseLevel(opts.depth)) return "fase";
  if (opts.hasChildren) return "entrega";
  if (eapTitleDeclaresMilestone(opts.title)) return "marco";
  return "atividade";
}

export function eapToPersisted(kind: EapKind): { item_type: "fase" | "atividade"; is_milestone: boolean } {
  if (kind === "marco") return { item_type: "atividade", is_milestone: true };
  // Fase e Entrega gravam igual: os dois agrupam, e o trigger eap_nesting_rule
  // só aceita 'fase'/'pacote' como pai. O que os distingue é o nível, lido do
  // wbs_code na hora de exibir — não um valor diferente no banco.
  if (kind === "fase" || kind === "entrega") return { item_type: "fase", is_milestone: false };
  return { item_type: "atividade", is_milestone: false };
}

/* ────────────────────────────────────────────────────────────────────────────
 * MOVER ITEM NA EAP — validação compartilhada pelas três vias
 *
 * As três telas que reorganizam a EAP (campo "Dentro de" na edição, menu de
 * linha no Backlog, arraste no Kanban) validam AQUI, e não cada uma na sua.
 * Uma cópia divergente é o caminho para uma tela aceitar o que a outra recusa.
 *
 * O estrago que importa é o CICLO: se A vira filha de B e B já descende de A,
 * o par inteiro se desliga da raiz e some das três telas de uma vez. O banco
 * barra (trigger trg_validate_activity_hierarchy), mas só depois do clique —
 * validar antes evita o erro cru e permite explicar o motivo.
 *
 * Toda travessia usa Set de visitados: se o dado JÁ estiver com um ciclo
 * (gravado antes desta validação existir), percorrer sem isso trava a aba.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Entrada mínima para validar um movimento. */
export interface EapNodeLike extends EapItemLike {
  id: string;
  parent_id?: string | null;
}

/**
 * Profundidade a partir da qual a interface avisa (sem impedir).
 *
 * O PMBOK não fixa número: decomponha até poder estimar custo e duração e
 * designar um responsável. A literatura converge em 3 a 5 níveis de trabalho, e
 * a regra 8/80 (pacote entre 8 e 80 horas) é o teste prático.
 *
 * O número aqui conta NÍVEIS DA ÁRVORE, então acompanha a convenção: quando o
 * projeto entra na numeração, ele consome um nível que não é trabalho, e o
 * orçamento de decomposição real fica um degrau abaixo. Somar EAP_PROJECT_LEVEL
 * mantém o MESMO rigor nas duas convenções, em vez de apertar sozinho.
 *
 * Sem isso, uma EAP saudável — projeto → fase → entrega → atividade →
 * subatividade — dispararia alerta sem nenhum excesso, e um aviso que aparece
 * no caso normal é um aviso que as pessoas aprendem a ignorar.
 *
 * BLOQUEAR está fora de questão: a base já tem árvores de 6 níveis, e travar
 * impediria de mover justamente os itens que precisam ser consertados.
 */
const EAP_DEPTH_WARN_TRABALHO = 5;

export const EAP_DEPTH_WARN =
  EAP_DEPTH_WARN_TRABALHO + (EAP_PROJECT_LEVEL ?? 0);

export type EapMoveBlockReason = "self" | "cycle" | "milestone-parent" | "not-found" | "other-project";

export interface EapMoveCheck {
  /** false ⇒ o movimento não pode ser gravado (o banco também recusaria). */
  ok: boolean;
  reason?: EapMoveBlockReason;
  /** Mensagem pronta para o usuário — o motivo, não o código do erro. */
  message?: string;
  /** Profundidade que o item passaria a ter (1 = raiz). */
  depth?: number;
  /** Preenchido quando passa de EAP_DEPTH_WARN: avisa, mas `ok` continua true. */
  warning?: string;
}

/**
 * Um item promovido a agrupador deve voltar a ser folha agora que perdeu os filhos?
 *
 * Criar a primeira subatividade PROMOVE o pai a `item_type='fase'` — a regra de
 * aninhamento do banco exige agrupador para aceitar filho. Só que nada desfazia
 * isso quando o último filho saía: o item ficava com cara de agrupador (cubo
 * azul, rótulo Fase/Entrega) sem ter nada dentro, para sempre. A promoção era
 * definitiva por omissão, não por decisão.
 *
 * NÃO rebaixa quem é agrupador por vontade do usuário: um item com código EAP
 * de nível 1 ("1", "2") é uma Fase declarada e continua Fase mesmo vazia —
 * esvaziar uma fase é normal no meio do planejamento. O rebaixamento existe só
 * para desfazer a promoção automática.
 *
 * @param item         o PAI, depois da remoção
 * @param aindaTemFilhos se sobrou algum filho não arquivado
 */
export function eapShouldDemote(item: EapItemLike, aindaTemFilhos: boolean): boolean {
  if (aindaTemFilhos) return false;

  const t = (item.item_type || "").trim().toLowerCase();
  if (t !== "fase" && t !== "pacote") return false; // já é folha

  // Fase ou Entrega DECLARADA pelo usuário permanece como está.
  //
  // Antes a proteção era só para o nível 1. Estava errado, e o efeito era
  // grave: uma fase criada à mão (sem código EAP ainda) perdia o papel assim
  // que ficasse temporariamente sem filhos — granular a EAP movendo um item
  // fazia a fase inteira sumir do agrupamento. Relatado em 11/08.
  //
  // Agora QUALQUER item com código EAP válido é considerado declarado: quem
  // digitou "1", "1.2" ou "2.1.3" disse onde ele está na estrutura, e essa
  // afirmação não se desfaz porque o último filho saiu — a fase esvaziada é
  // estado normal no meio do planejamento.
  //
  // Sobra o caso que o rebaixamento existe para tratar: item SEM código, que
  // virou agrupador só porque alguém criou uma subatividade nele. Aí a
  // promoção foi mesmo automática, e desfazê-la ao esvaziar é correto.
  if (eapLevel(item.wbs_code) !== null) return false;

  return true;
}

/** Índice por id, para as travessias não varrerem a lista a cada salto. */
function indexById<T extends EapNodeLike>(nodes: T[]): Map<string, T> {
  const map = new Map<string, T>();
  nodes.forEach((n) => map.set(n.id, n));
  return map;
}

/**
 * Todos os descendentes de `rootIds` (sem incluir os próprios).
 *
 * É o conjunto que NÃO pode ser destino: mover um item para dentro da própria
 * subárvore é exatamente o ciclo que desliga os dois da raiz.
 */
export function eapDescendantIds(nodes: EapNodeLike[], rootIds: string[]): Set<string> {
  const childrenBy = new Map<string, string[]>();
  nodes.forEach((n) => {
    if (!n.parent_id) return;
    const arr = childrenBy.get(n.parent_id) || [];
    arr.push(n.id);
    childrenBy.set(n.parent_id, arr);
  });

  const found = new Set<string>();
  const stack = [...rootIds];
  const seen = new Set<string>(rootIds); // anti-ciclo: dado já corrompido não trava a UI
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const childId of childrenBy.get(current) || []) {
      if (seen.has(childId)) continue;
      seen.add(childId);
      found.add(childId);
      stack.push(childId);
    }
  }
  return found;
}

/**
 * Profundidade do item na árvore: 1 = raiz, 2 = filho de raiz, e assim por diante.
 * Conta pelo `parent_id` real, não pelo wbs_code (que pode faltar).
 */
export function eapDepthOf(nodes: EapNodeLike[], id: string): number {
  const byId = indexById(nodes);
  let depth = 1;
  let current = byId.get(id);
  const seen = new Set<string>([id]);
  while (current?.parent_id) {
    if (seen.has(current.parent_id)) break; // ciclo pré-existente: para em vez de girar
    seen.add(current.parent_id);
    const parent = byId.get(current.parent_id);
    if (!parent) break; // pai fora da lista carregada (filtro/paginação) — não conta a mais
    depth += 1;
    current = parent;
  }
  return depth;
}

/** Altura da subárvore: 1 quando o item é folha. */
function subtreeHeight(nodes: EapNodeLike[], rootId: string): number {
  const childrenBy = new Map<string, string[]>();
  nodes.forEach((n) => {
    if (!n.parent_id) return;
    const arr = childrenBy.get(n.parent_id) || [];
    arr.push(n.id);
    childrenBy.set(n.parent_id, arr);
  });

  let height = 1;
  let frontier = [rootId];
  const seen = new Set<string>([rootId]);
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const childId of childrenBy.get(id) || []) {
        if (seen.has(childId)) continue;
        seen.add(childId);
        next.push(childId);
      }
    }
    if (next.length > 0) height += 1;
    frontier = next;
  }
  return height;
}

/**
 * Pode `movingIds` virar filho de `targetParentId`?
 *
 * `targetParentId = null` significa "soltar na raiz" — sempre permitido.
 * O aviso de profundidade considera a subárvore INTEIRA que vai junto: mover um
 * ramo de 3 níveis para dentro do nível 4 chega ao 6, mesmo que o item movido
 * sozinho parecesse raso.
 */
export function eapCanMoveInto(
  nodes: EapNodeLike[],
  movingIds: string[],
  targetParentId: string | null,
): EapMoveCheck {
  if (movingIds.length === 0) return { ok: false, reason: "not-found", message: "Nenhum item selecionado." };
  if (targetParentId === null) return { ok: true, depth: 1 };

  if (movingIds.includes(targetParentId)) {
    return {
      ok: false,
      reason: "self",
      message: "Um item não pode ficar dentro de si mesmo.",
    };
  }

  const byId = indexById(nodes);
  const target = byId.get(targetParentId);
  if (!target) {
    return {
      ok: false,
      reason: "not-found",
      message: "O item de destino não foi encontrado neste projeto.",
    };
  }

  // Marco é folha de controle por definição — nunca agrupa. O trigger do banco
  // também recusa (eap_is_group exige não-milestone).
  if (target.is_milestone) {
    return {
      ok: false,
      reason: "milestone-parent",
      message: "Marco não agrupa: escolha uma fase, entrega ou atividade como destino.",
    };
  }

  const descendants = eapDescendantIds(nodes, movingIds);
  if (descendants.has(targetParentId)) {
    return {
      ok: false,
      reason: "cycle",
      message: "Esse destino está dentro do item que você está movendo — os dois sumiriam da EAP.",
    };
  }

  // Profundidade final = onde o pai está + o ramo mais alto que vai junto.
  const parentDepth = eapDepthOf(nodes, targetParentId);
  const tallest = Math.max(...movingIds.map((id) => subtreeHeight(nodes, id)));
  const depth = parentDepth + tallest;

  if (depth > EAP_DEPTH_WARN) {
    return {
      ok: true,
      depth,
      warning: `A EAP chegaria ao nível ${depth}. Acima de ${EAP_DEPTH_WARN} níveis ela fica difícil de ler — considere agrupar antes.`,
    };
  }

  return { ok: true, depth };
}
