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

/** Papéis visíveis ao usuário. */
export type EapKind = "fase" | "atividade" | "marco";

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

/**
 * Resolve o papel EAP EXIBIDO de um item.
 *
 * Ordem:
 *  1. is_milestone                    → Marco (vence sempre)
 *  2. tem wbs_code → nível 1          → Fase/Entrega
 *                    nível 2+         → Atividade
 *  3. sem wbs_code → agrupa           → Fase/Entrega
 *                    não agrupa       → Atividade
 *
 * `hasChildren` só é consultado no caso 3, para não desfazer a regra de nível
 * em item importado que agrupa (ex.: "2.1" com subitens continua Atividade).
 */
export function resolveEapKind(item: EapItemLike, hasChildren = false): EapKind {
  if (item.is_milestone) return "marco";

  const level = eapLevel(item.wbs_code);
  if (level !== null) return level === 1 ? "fase" : "atividade";

  // Sem código: mantém a regra por função, que é o que já valia para estes.
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
 *
 * Item com filhos deixa de ser forçado a "só Fase": Atividade agora pode
 * agrupar (o nível é que define o rótulo). O que segue barrado é Marco, que é
 * folha de controle por definição — um marco com subitens não faz sentido.
 */
export function eapTypeOptions(opts: { hasChildren?: boolean } = {}): EapKind[] {
  if (opts.hasChildren) return ["fase", "atividade"];
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
