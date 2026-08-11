/**
 * DATAS SEM HORA (colunas `date` do banco: end_date, due_date, start_date…).
 *
 * O PROBLEMA
 *
 * `new Date("2026-08-14")` é interpretado pelo JS como MEIA-NOITE EM UTC. Ao
 * exibir com `toLocaleDateString`, o horário volta para o fuso local — e em
 * São Paulo (UTC−3) isso cai em 13/08 às 21h. O usuário digitava 14/08 no
 * prazo e o Backlog mostrava 13/08.
 *
 * Uma data sem hora não é um INSTANTE: "14 de agosto" é o mesmo dia em
 * qualquer fuso. Convertê-la para instante é o erro. Aqui ela é montada com o
 * construtor de componentes (`new Date(ano, mês, dia)`), que trabalha em
 * horário LOCAL e não desloca nada.
 *
 * Vale para colunas `date`. Para `timestamptz` (created_at, sla_deadline,
 * decision_date…) o valor É um instante e `new Date()` está certo — não use
 * estas funções lá.
 *
 * Relatado em 11/08/2026: prazo 14/08 aparecia como 13/08 no Backlog.
 */

/** "2026-08-14" → Date local em 14/08 00:00. Aceita timestamp (corta em 10). */
export function parseDataLocal(valor: string): Date {
  const base = valor.slice(0, 10);
  const [ano, mes, dia] = base.split("-").map(Number);
  return new Date(ano, (mes || 1) - 1, dia || 1);
}

/**
 * Campo MISTO: ora data pura ("2026-08-14"), ora timestamp
 * ("2026-08-14T23:30:00Z"). Acontece em `meeting_date || created_at`, onde a
 * reunião tem data e o documento tem carimbo de criação.
 *
 * Os dois casos precisam de tratamento OPOSTO: a data pura não pode virar
 * instante (senão volta um dia), e o timestamp PRECISA ser convertido ao fuso
 * local (senão um registro criado às 21h em São Paulo aparece como sendo de
 * amanhã, porque em UTC já é). Fatiar os dois igual erraria metade.
 *
 * O comprimento distingue: data pura tem exatamente 10 caracteres.
 */
export function parseDataOuInstante(valor: string): Date {
  const s = (valor || "").trim();
  if (s.length <= 10) return parseDataLocal(s);
  const d = new Date(s);
  // Reduz o instante ao DIA local, para agrupar e exibir sem a hora interferir.
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Dia/mês de um campo misto (data pura ou timestamp). */
export function formatarDiaMesMisto(valor?: string | null): string {
  if (!valor) return "";
  return parseDataOuInstante(valor).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

/** Hoje às 00:00 local — o marco para comparar "está atrasado?". */
export function hojeLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** "2026-08-14" → "14/08/2026". Null/vazio devolve string vazia. */
export function formatarDataBR(valor?: string | null): string {
  if (!valor) return "";
  return parseDataLocal(valor).toLocaleDateString("pt-BR");
}

/** "2026-08-14" → "14/08". Para linhas estreitas, onde o ano polui. */
export function formatarDiaMes(valor?: string | null): string {
  if (!valor) return "";
  return parseDataLocal(valor).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

/**
 * Atrasado? Compara DIA com DIA.
 *
 * O prazo vence no FIM do dia: uma tarefa para hoje não está atrasada às 9h da
 * manhã. Comparar contra `new Date()` (com hora) marcava como atrasado tudo que
 * vencia hoje, a partir de 00:01.
 */
export function estaAtrasado(valor?: string | null): boolean {
  if (!valor) return false;
  return parseDataLocal(valor).getTime() < hojeLocal().getTime();
}

/**
 * Dias entre hoje e a data: negativo = atrasado, 0 = vence hoje.
 *
 * Ambos os lados às 00:00 local, então a conta dá inteiro exato e não sofre com
 * horário de verão no meio do intervalo.
 */
export function diasAte(valor?: string | null): number | null {
  if (!valor) return null;
  const MS_DIA = 24 * 60 * 60 * 1000;
  return Math.round((parseDataLocal(valor).getTime() - hojeLocal().getTime()) / MS_DIA);
}

/** Ordenação de datas sem hora. Nulos vão para o fim. */
export function compararData(a?: string | null, b?: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  // String "YYYY-MM-DD" já ordena corretamente por comparação lexicográfica —
  // sem Date no meio não há fuso para errar.
  return a.slice(0, 10).localeCompare(b.slice(0, 10));
}
