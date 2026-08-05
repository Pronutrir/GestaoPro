/**
 * Pendências — o que está em aberto e já passou do prazo.
 *
 * Não existe tabela `pendencias`. A medição que motivou esta tela mostrou por
 * quê: das fontes que uma tabela unificadora reuniria, só uma tem volume real —
 * atividades (827 ativas) — contra 1 ação de reunião, 3 lições, 4 bloqueios e
 * 0 riscos. Criar tabela seria um quinto lugar para registrar o que já mora em
 * `activities`, e nasceria vazia esperando cadastro manual.
 *
 * O recorte que importa é `end_date` no passado E a atividade ainda aberta. Sem
 * a segunda condição o número mente: das 297 vencidas na base, 205 já estavam
 * concluídas — venceram o prazo, mas foram feitas. Pendência real eram 92.
 */

export type FaixaAtraso = "critico" | "atencao" | "recente";

export interface PendenciaLike {
  id: string;
  title: string;
  project_id: string;
  end_date: string | null;
  assigned_to: string | null;
  workflow_stage_id: string | null;
  status: string | null;
  is_blocked?: boolean | null;
  blocked_reason?: string | null;
  parent_id?: string | null;
  item_type?: string | null;
}

export interface StageLike {
  id: string;
  is_final?: boolean | null;
  categoria?: string | null;
}

/** Colunas que significam "terminou". Espelha a regra usada no Kanban e no CPM. */
export function buildStagesFinais(stages: StageLike[]): Set<string> {
  return new Set(
    stages
      .filter((s) => s.is_final === true || /conclu/i.test(s.categoria ?? ""))
      .map((s) => s.id),
  );
}

/** Uma atividade encerrada não é pendência, mesmo com o prazo estourado. */
export function estaConcluida(a: PendenciaLike, finais: Set<string>): boolean {
  if (a.status === "completed" || a.status === "done") return true;
  return !!a.workflow_stage_id && finais.has(a.workflow_stage_id);
}

/** Dias corridos desde o vencimento. Negativo (ainda no prazo) vira 0. */
export function diasDeAtraso(endDate: string | null, hojeISO?: string): number {
  if (!endDate) return 0;
  const hoje = hojeISO ? new Date(`${hojeISO}T00:00:00`) : new Date();
  const fim = new Date(`${endDate.slice(0, 10)}T00:00:00`);
  const d = Math.floor((hoje.getTime() - fim.getTime()) / 86_400_000);
  return d > 0 ? d : 0;
}

/**
 * Três faixas, não um gradiente. A mediana de atraso na base é 64 dias e a pior
 * tem 785 — uma escala contínua deixaria quase tudo no mesmo tom. O corte em 30
 * e 90 dias separa "escapou" de "parou" de "foi esquecido".
 */
export function faixaDeAtraso(dias: number): FaixaAtraso {
  if (dias > 90) return "critico";
  if (dias > 30) return "atencao";
  return "recente";
}

export function ehPendencia(
  a: PendenciaLike,
  finais: Set<string>,
  hojeISO?: string,
): boolean {
  if (estaConcluida(a, finais)) return false;
  // Bloqueada conta mesmo dentro do prazo: parou de andar e alguém precisa agir.
  if (a.is_blocked === true) return true;
  return diasDeAtraso(a.end_date, hojeISO) > 0;
}

/**
 * Origem — o que a linha É, não de onde veio.
 *
 * Não existe campo de procedência em `activities`. O rótulo é derivado do que
 * já está gravado: tipo do item e vínculo com reunião. Isso separa fase de
 * atividade solta, que é útil, mas não é rastreamento de origem — quem criou,
 * se veio de importação ou de cópia, o banco não guarda.
 */
export type OrigemPendencia = "reuniao" | "fase" | "subatividade" | "atividade";

export const ORIGEM_LABEL: Record<OrigemPendencia, string> = {
  reuniao: "Reunião",
  fase: "Fase / Entrega",
  subatividade: "Subatividade",
  atividade: "Atividade",
};

/**
 * O vínculo com reunião mora do outro lado — `meeting_actions.activity_id` —,
 * por isso vem como conjunto pronto em vez de campo da própria atividade.
 *
 * Ordem importa: reunião antes de tudo porque é a única procedência de verdade
 * (veio de outro lugar); subatividade antes de fase porque uma subatividade
 * pode carregar item_type de fase, e o vínculo com a mãe é mais específico.
 */
export function origemDe(a: PendenciaLike, vindasDeReuniao?: Set<string>): OrigemPendencia {
  if (vindasDeReuniao?.has(a.id)) return "reuniao";
  if (a.parent_id) return "subatividade";
  if (a.item_type === "fase" || a.item_type === "pacote") return "fase";
  return "atividade";
}

export interface ResumoPendencias {
  total: number;
  criticas: number;
  atencao: number;
  recentes: number;
  semDono: number;
  bloqueadas: number;
}

export function resumirPendencias(
  pendencias: PendenciaLike[],
  hojeISO?: string,
): ResumoPendencias {
  const r: ResumoPendencias = {
    total: pendencias.length, criticas: 0, atencao: 0,
    recentes: 0, semDono: 0, bloqueadas: 0,
  };
  pendencias.forEach((p) => {
    const faixa = faixaDeAtraso(diasDeAtraso(p.end_date, hojeISO));
    if (faixa === "critico") r.criticas++;
    else if (faixa === "atencao") r.atencao++;
    else r.recentes++;
    if (!p.assigned_to) r.semDono++;
    if (p.is_blocked === true) r.bloqueadas++;
  });
  return r;
}

/**
 * Mais atrasada primeiro. Empate desfeito pelo título para a ordem não variar
 * entre carregamentos — duas pendências do mesmo dia trocando de lugar a cada
 * refresh dão a impressão de que a lista mudou quando nada mudou.
 */
export function ordenarPorAtraso<T extends PendenciaLike>(lista: T[], hojeISO?: string): T[] {
  return [...lista].sort((a, b) => {
    const d = diasDeAtraso(b.end_date, hojeISO) - diasDeAtraso(a.end_date, hojeISO);
    if (d !== 0) return d;
    return (a.title || "").localeCompare(b.title || "", "pt-BR");
  });
}
