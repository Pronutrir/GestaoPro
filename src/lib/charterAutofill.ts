/**
 * AUTOPREENCHIMENTO DO TAP — de onde cada campo pode vir.
 *
 * O diagnóstico está medido no próprio TAP (02/08/2026): 13 de 20 campos com
 * 0% de preenchimento em 52 projetos, e nenhum dos 25 projetos com patrocinador
 * informado. Não é desleixo — é que na hora de abrir o projeto ninguém sabe a
 * resposta, e o sistema já sabe metade delas.
 *
 * Esconder campo atrás de "Detalhar o TAP" tratou o sintoma: o campo continua
 * vazio, só que fechado. Aqui a causa é atacada — o TAP OFERECE o valor que já
 * existe no banco e diz DE ONDE veio.
 *
 * Regras que valem para todas as sugestões:
 *
 *   • Sugerir, nunca gravar sozinho. O usuário aceita; o TAP não decide por ele.
 *   • Campo já preenchido não recebe sugestão — sobrescrever trabalho humano
 *     com palpite do sistema é pior que deixar vazio.
 *   • A origem é sempre visível. "Patrocinador: Raphael" sem dizer que veio da
 *     solicitação do roadmap é dado sem procedência, e num documento formal a
 *     procedência é metade do valor.
 */

export type OrigemSugestao =
  | "roadmap"
  | "projeto"
  | "equipe"
  | "financeiro"
  | "eap"
  | "premissas"
  | "cronograma";

/** Rótulo curto, para o selo ao lado do campo. */
export const ORIGEM_LABEL: Record<OrigemSugestao, string> = {
  roadmap: "da solicitação",
  projeto: "do projeto",
  equipe: "da equipe",
  financeiro: "do financeiro",
  eap: "da EAP",
  premissas: "das premissas",
  cronograma: "do cronograma",
};

/** Frase completa, para o tooltip: explica a procedência sem abreviar. */
export const ORIGEM_DETALHE: Record<OrigemSugestao, string> = {
  roadmap: "Veio da solicitação que originou este projeto, no Roadmap.",
  projeto: "Veio do cadastro do projeto.",
  equipe: "Veio da equipe do projeto (matriz RACI).",
  financeiro: "Veio da linha de base do orçamento aprovada.",
  eap: "Veio das fases cadastradas na EAP.",
  premissas: "Veio das premissas cadastradas no módulo próprio.",
  cronograma: "Veio das datas do projeto.",
};

export interface Sugestao {
  /** Campo do TAP a preencher. */
  campo: string;
  /** Valor pronto para gravar. */
  valor: string;
  origem: OrigemSugestao;
  /** Detalhe da fonte, quando ajuda a decidir: "linha de base v3". */
  nota?: string;
}

/* ------------------------------------------------------------------ */

export interface FonteProjeto {
  manager?: string | null;
  owner?: string | null;
  sponsor?: string | null;
  restrictions?: string | null;
  objective?: string | null;
  due_date?: string | null;
  baseline_end_date?: string | null;
  budget_planned?: number | null;
}

export interface FonteMembro {
  user_name?: string | null;
  raci?: string | null;
}

export interface FonteFase {
  title: string;
  wbs_code?: string | null;
}

export interface FontePremissa {
  description: string;
}

export interface FonteBaseline {
  baseline_total?: number | null;
  version?: number | null;
}

export interface Fontes {
  projeto?: FonteProjeto | null;
  membros?: FonteMembro[];
  fases?: FonteFase[];
  premissas?: FontePremissa[];
  baseline?: FonteBaseline | null;
}

/** Já tem conteúdo? Espaço em branco não conta como preenchido. */
const vazio = (v: unknown) => !(v && String(v).trim());

const dataBR = (iso?: string | null) => {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : "";
};

const moedaBR = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * Monta as sugestões para os campos AINDA VAZIOS do TAP.
 *
 * `atual` é o charter como está: um campo com valor nunca gera sugestão.
 */
export function sugerirCampos(
  atual: Record<string, unknown>,
  fontes: Fontes,
): Sugestao[] {
  const out: Sugestao[] = [];
  const { projeto, membros = [], fases = [], premissas = [], baseline } = fontes;

  // Gestor: o cadastro do projeto já tem, e o TAP pede de novo.
  if (vazio(atual.manager) && !vazio(projeto?.manager)) {
    out.push({ campo: "manager", valor: String(projeto!.manager), origem: "projeto" });
  }

  // Patrocinador: mesma coisa. O roadmap grava aqui ao projetizar.
  if (vazio(atual.sponsor) && !vazio(projeto?.sponsor)) {
    out.push({ campo: "sponsor", valor: String(projeto!.sponsor), origem: "roadmap" });
  }

  // Autoridade do gerente: quem responde pelo projeto é o líder cadastrado.
  if (vazio(atual.authority) && !vazio(projeto?.owner)) {
    out.push({
      campo: "authority",
      valor: `${projeto!.owner} responde pelo projeto e pode acionar os recursos previstos.`,
      origem: "projeto",
    });
  }

  // Restrições: existe coluna própria no projeto, e o TAP a duplicava em texto.
  if (vazio(atual.constraints) && !vazio(projeto?.restrictions)) {
    out.push({ campo: "constraints", valor: String(projeto!.restrictions), origem: "projeto" });
  }

  // PREMISSAS: há uma TABELA para isso, e o TAP pedia texto livre. Duplicação
  // que fazia o mesmo dado viver em dois lugares sem se falarem.
  if (vazio(atual.assumptions) && premissas.length > 0) {
    out.push({
      campo: "assumptions",
      valor: premissas.map((p) => `• ${p.description}`).join("\n"),
      origem: "premissas",
      nota: `${premissas.length} cadastrada${premissas.length > 1 ? "s" : ""}`,
    });
  }

  // SMART temporal: a data da linha de base vale mais que a prevista — é a que
  // foi congelada como compromisso.
  const prazo = projeto?.baseline_end_date || projeto?.due_date;
  if (vazio(atual.smart_temporal) && prazo) {
    out.push({
      campo: "smart_temporal",
      valor: `Concluir até ${dataBR(prazo)}.`,
      origem: projeto?.baseline_end_date ? "financeiro" : "cronograma",
      nota: projeto?.baseline_end_date ? "linha de base" : "prazo previsto",
    });
  }

  // SMART específico: o objetivo do projeto é exatamente isto.
  if (vazio(atual.smart_specific) && !vazio(projeto?.objective)) {
    out.push({ campo: "smart_specific", valor: String(projeto!.objective), origem: "projeto" });
  }

  return out;
}

/**
 * Aprovadores sugeridos: quem é "A" na matriz RACI.
 *
 * RACI-A é, por definição, quem responde pela entrega — a mesma pessoa que
 * assina o TAP. O TAP já mostrava um botão "incluir nas aprovações" para UM
 * membro; aqui vale para todos, e diz por quê.
 */
export function sugerirAprovadores(
  aprovacoesAtuais: Array<{ name?: string | null }>,
  membros: FonteMembro[],
): Array<{ name: string; role: string }> {
  const jaTem = new Set(
    aprovacoesAtuais.map((a) => (a.name || "").trim().toLowerCase()).filter(Boolean),
  );
  return membros
    .filter((m) => (m.raci || "").toUpperCase() === "A")
    .map((m) => (m.user_name || "").trim())
    .filter((nome) => nome && !jaTem.has(nome.toLowerCase()))
    .map((nome) => ({ name: nome, role: "Responsável (RACI-A)" }));
}

/**
 * Entregas a partir da EAP, com o código quando existe.
 *
 * O TAP numerava as fases como "1.1, 1.2…" por posição na lista, ignorando o
 * `wbs_code` — então o documento formal mostrava uma numeração que não batia
 * com a do Backlog e a do Cronograma. Três telas, três números para a mesma
 * entrega.
 */
export function entregasDaEap(fases: FonteFase[]): string[] {
  return fases.map((f) => {
    const code = (f.wbs_code || "").trim();
    return code ? `${code} ${f.title}` : f.title;
  });
}

/**
 * Orçamento autorizado: a linha de base vence o campo solto.
 *
 * `budget_planned` é um número digitado à mão; a linha de base foi aprovada,
 * versionada e é a referência do valor agregado. Num documento que AUTORIZA
 * gasto, citar o número informal seria autorizar o valor errado.
 */
export function orcamentoAutorizado(
  projeto?: FonteProjeto | null,
  baseline?: FonteBaseline | null,
): { texto: string; origem: OrigemSugestao; nota?: string } | null {
  const bl = baseline?.baseline_total;
  if (bl != null && bl > 0) {
    return {
      texto: moedaBR(bl),
      origem: "financeiro",
      nota: baseline?.version ? `linha de base v${baseline.version}` : "linha de base",
    };
  }
  const bp = projeto?.budget_planned;
  if (bp != null && bp > 0) {
    return { texto: moedaBR(bp), origem: "projeto", nota: "orçamento previsto" };
  }
  return null;
}

/**
 * Completude do TAP: quantos campos que IMPORTAM estão preenchidos.
 *
 * Não conta os 20 campos: conta os que fazem o documento cumprir sua função de
 * autorizar. Um TAP com objetivo, escopo, justificativa, prazo e responsável
 * definidos está pronto para assinar — os demais enriquecem, não habilitam.
 */
export const CAMPOS_ESSENCIAIS = [
  "objective",
  "scope",
  "justification",
  "manager",
  "sponsor",
  "smart_temporal",
] as const;

export function completude(
  charter: Record<string, unknown>,
  projeto?: FonteProjeto | null,
): { preenchidos: number; total: number; pct: number; faltando: string[] } {
  const ROTULOS: Record<string, string> = {
    objective: "objetivo",
    scope: "escopo",
    justification: "justificativa",
    manager: "gestor",
    sponsor: "patrocinador",
    smart_temporal: "prazo",
  };
  const faltando: string[] = [];
  let preenchidos = 0;
  for (const c of CAMPOS_ESSENCIAIS) {
    // O valor pode estar no charter OU na coluna nativa do projeto — as duas
    // fontes são espelhadas, e olhar só uma acusaria falta do que existe.
    const v = charter[c] ?? (projeto as Record<string, unknown> | null | undefined)?.[c];
    if (vazio(v)) faltando.push(ROTULOS[c] || c);
    else preenchidos++;
  }
  const total = CAMPOS_ESSENCIAIS.length;
  return { preenchidos, total, pct: Math.round((preenchidos / total) * 100), faltando };
}
