/**
 * Modelo EAP/WBS do GestãoPro — FONTE ÚNICA DA VERDADE.
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
 * MUDANÇA-CHAVE frente ao modelo antigo: o papel vem da FUNÇÃO (agrupa? é marco?),
 * não de uma amarração profundidade↔tipo. Fase deixa de ser "só no topo".
 *
 * Este helper substitui as cópias divergentes de resolveKind que existiam em
 * BacklogSection, ActivityKanban e ProjectCronogramaPanel.
 */

/** Papéis visíveis ao usuário. */
export type EapKind = "fase" | "atividade" | "marco";

/** Entrada mínima para resolver o papel de um item. */
export interface EapItemLike {
  item_type?: string | null;
  is_milestone?: boolean | null;
}

/**
 * Resolve o papel EAP EXIBIDO de um item.
 *
 * Regra (função, não profundidade):
 *  1. is_milestone            → Marco
 *  2. agrupa (tem filhos OU   → Fase/Entrega
 *     item_type fase/pacote)
 *  3. caso contrário          → Atividade
 *
 * `hasChildren` cobre o item que agrupa por ter subitens mesmo sem item_type
 * explícito de agrupador (ex.: dados legados ou migration ainda pendente).
 */
export function resolveEapKind(item: EapItemLike, hasChildren = false): EapKind {
  if (item.is_milestone) return "marco";
  const t = (item.item_type || "").trim().toLowerCase();
  if (t === "fase" || t === "pacote" || hasChildren) return "fase";
  return "atividade";
}

/** Só Fase/Entrega agrupa. */
export function eapCanGroup(kind: EapKind): boolean {
  return kind === "fase";
}

/** Folhas (não agrupam). */
export function eapIsLeaf(kind: EapKind): boolean {
  return !eapCanGroup(kind);
}

/**
 * Tipos oferecidos no seletor, dado o contexto.
 * - Fase disponível em QUALQUER nível (regra unificada entre telas).
 * - Se o item já tem filhos, só pode ser Fase (o único agrupador).
 */
export function eapTypeOptions(opts: { hasChildren?: boolean } = {}): EapKind[] {
  if (opts.hasChildren) return ["fase"];
  return ["fase", "atividade", "marco"];
}

/** Rótulos canônicos para a UI. */
export const EAP_LABELS: Record<EapKind, string> = {
  fase: "Fase",
  atividade: "Atividade",
  marco: "Marco",
};

/**
 * item_type + is_milestone a gravar para cada papel escolhido.
 *
 * O agrupador é gravado como item_type='fase'. Para PROMOVER uma folha que
 * ganhou subitens sem trocar o rótulo de topo, prefira `eapGroupPersisted`,
 * que respeita o 'pacote' legado quando o banco ainda exige/aceita.
 */
export function eapToPersisted(kind: EapKind): { item_type: "fase" | "atividade"; is_milestone: boolean } {
  if (kind === "marco") return { item_type: "atividade", is_milestone: true };
  if (kind === "fase") return { item_type: "fase", is_milestone: false };
  return { item_type: "atividade", is_milestone: false };
}
