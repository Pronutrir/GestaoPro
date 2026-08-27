/**
 * OS DADOS DA TELA DA ATIVIDADE — uma tela, três estados.
 *
 * ============================================================================
 * POR QUE ESTE MÓDULO EXISTE SEPARADO DA TELA
 *
 * A tela tem três estados (criar, editar, visualizar) e o desenho é explícito:
 * *"Não são três telas para manter."* Se as consultas morarem no componente,
 * o primeiro estado que precisar de um campo a mais vira um segundo componente,
 * e em três meses há três telas divergindo — que é exatamente o defeito que
 * esta revisão inteira vem fechando.
 *
 * Aqui ficam as leituras e o que cada uma significa. A tela decide o que
 * mostrar; ela não decide o que os números querem dizer.
 *
 * ============================================================================
 * O QUE ELE CONSOME, E QUE NINGUÉM CHAMAVA
 *
 *   activity_breadcrumb  a trilha até a fase — a view existe desde a P00 e
 *                        NENHUMA tela a usava. É o que dá contexto a quem só
 *                        enxerga esta atividade.
 *   activity_assignees   responsáveis no PLURAL (fase 02). O campo antigo
 *                        `assigned_to` é texto e singular.
 *   derived_*            horas, término e progresso vindos do SERVIDOR
 *                        (fase 09). O desenho diz: *"o total vem do servidor,
 *                        não da soma da tela"* — e há um motivo medido: a lista
 *                        passa pela RLS, então somar no cliente encolhe o pai
 *                        para quem enxerga menos.
 * ============================================================================
 */
import { supabase } from "@/integrations/supabase/client";

/**
 * OS TIPOS GERADOS NÃO CONHECEM AS VIEWS DESTE MÓDULO.
 *
 * `activity_breadcrumb` e `activity_assignees` nasceram nas migrations de
 * 26/08 e o `types.ts` do Supabase foi gerado antes — então `.from()` recusa os
 * dois nomes em tempo de compilação, embora existam no banco (conferido por
 * consulta real).
 *
 * `as never` é o padrão que o repositório já usa para esse descompasso (ver
 * ActivityKanban, em `user_stories` e `workflow_stages`). Não é atalho: é o
 * reconhecimento de que o esquema anda mais rápido que o arquivo gerado.
 *
 * O CUSTO, declarado: aqui o TypeScript deixa de conferir os nomes das colunas.
 * Por isso as colunas pedidas abaixo foram verificadas UMA A UMA contra o banco
 * antes de escrever — e três suposições minhas estavam erradas
 * (`ancestor_*`, `activity_id` na breadcrumb, `derived_completed_children`).
 * Quem mexer aqui: confira no banco, não no editor.
 */
const tabela = (nome: string) => supabase.from(nome as never);

/** Um degrau da trilha. Só código, nome e tipo — nunca contador, pessoa ou custo. */
export interface DegrauDaTrilha {
  id: string;
  wbs_code: string | null;
  title: string;
  item_type: string | null;
}

/** Uma pessoa ligada à atividade, já resolvida para exibição. */
export interface PessoaDaAtividade {
  id: string;
  nome: string;
  iniciais: string;
  papel: "responsavel" | "participante";
}

export interface TotaisDerivados {
  /** Filhas vivas. `null` = folha (o servidor não deriva). */
  filhas: number | null;
  horas: number | null;
  termino: string | null;
  progresso: number | null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * A TRILHA
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A trilha até a raiz, do topo para a atividade.
 *
 * ============================================================================
 * A VIEW É PLANA — a trilha se monta subindo por `parent_id`
 *
 * `activity_breadcrumb` não devolve a trilha pronta: ela é
 * `SELECT id, parent_id, wbs_code, title, item_type, is_milestone FROM
 * activities WHERE is_trashed = false`. Quem sobe é quem chama.
 *
 * O que ela faz de especial é ser `security_invoker = false`: ela atravessa a
 * RLS de propósito, para que quem chegou à atividade só por atribuição enxergue
 * os ancestrais como CONTEXTO. Sem isso, a pessoa veria uma atividade solta,
 * sem saber de que fase ela faz parte.
 *
 * E ela carrega código, nome e tipo — **nada mais**. O comentário da migration
 * é explícito: *"NUNCA acrescentar contador, soma, pessoa, data ou custo:
 * qualquer um deles entrega a existência das irmãs."* Há teste travando isso.
 * Se esta função pedir mais colunas, o teste cai — e deve cair.
 *
 * O TETO DE 20 NÍVEIS é freio de ciclo, não limite de profundidade: se o dado
 * tiver um pai que aponta para um descendente (gravado antes das validações),
 * subir sem teto trava a aba. O `visto` cobre o ciclo simples; o teto cobre o
 * resto.
 * ============================================================================
 */
export async function carregarTrilha(activityId: string): Promise<DegrauDaTrilha[]> {
  const { data, error } = await tabela("activity_breadcrumb")
    .select("id, parent_id, wbs_code, title, item_type");

  // SEM FALLBACK SILENCIOSO: o erro sobe. Devolver "[]" fingindo sucesso faria
  // a tela mostrar um item sem contexto como se ele fosse de raiz — e quem
  // chegou por atribuição não teria como saber que falta informação.
  if (error) throw new Error(`não foi possível ler a trilha: ${error.message}`);

  const porId = new Map<string, Record<string, unknown>>();
  for (const d of data ?? []) porId.set(String((d as Record<string, unknown>).id), d as Record<string, unknown>);

  const trilha: DegrauDaTrilha[] = [];
  const visto = new Set<string>([activityId]);
  let atual = porId.get(activityId);
  let saltos = 0;

  while (atual && saltos < 20) {
    const paiId = atual.parent_id ? String(atual.parent_id) : null;
    if (!paiId || visto.has(paiId)) break;
    visto.add(paiId);
    const pai = porId.get(paiId);
    if (!pai) break;
    trilha.push({
      id: String(pai.id),
      wbs_code: (pai.wbs_code as string) ?? null,
      title: String(pai.title ?? ""),
      item_type: (pai.item_type as string) ?? null,
    });
    atual = pai;
    saltos++;
  }

  // Do TOPO para a atividade: subimos de baixo para cima, o leitor lê ao
  // contrário — "1 › 1.3 › 1.3.2 › 1.3.2.3", como no desenho.
  return trilha.reverse();
}

/* ────────────────────────────────────────────────────────────────────────────
 * AS PESSOAS
 * ──────────────────────────────────────────────────────────────────────────── */

/** Iniciais para o avatar: duas letras, a primeira e a última palavra. */
export function iniciaisDe(nome: string): string {
  const p = String(nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

/**
 * Responsáveis e participantes, no plural.
 *
 * `activity_assignees` é a tabela da fase 02. O `assigned_to` texto continua
 * existindo e NÃO é lido aqui: ele é singular, é nome (não identificador) e
 * casa errado com homônimos — dois "Williame Correia de Lima" são a mesma
 * pessoa para uma comparação por texto.
 */
export async function carregarPessoas(activityId: string): Promise<PessoaDaAtividade[]> {
  const { data, error } = await tabela("activity_assignees")
    .select("user_id, papel, profiles(id, full_name)")
    .eq("activity_id", activityId);

  if (error) throw new Error(`não foi possível ler os responsáveis: ${error.message}`);

  return (data ?? []).map((d: Record<string, unknown>) => {
    const perfil = (d.profiles ?? {}) as { id?: string; full_name?: string };
    const nome = perfil.full_name || "(sem nome)";
    return {
      id: perfil.id || String(d.user_id),
      nome,
      iniciais: iniciaisDe(nome),
      papel: String(d.papel) === "participante" ? "participante" : "responsavel",
    };
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * OS TOTAIS — do servidor, nunca somados aqui
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Lê os agregados que o servidor derivou. **Não soma nada.**
 *
 * O desenho é explícito — *"o total vem do servidor, não da soma da tela"* — e
 * a razão está medida: a lista de filhas passa pela RLS. Quem enxerga 1 de 8
 * subatividades somaria 1 e gravaria isso como total do pai. Aconteceu, e a
 * gravação foi removida em 26/08.
 *
 * `filhas === null` significa FOLHA, não zero: o servidor só deriva para quem
 * tem filhas. A tela precisa distinguir "não tem subatividades" de "tem, mas o
 * número não chegou" — e por isso o tipo é `number | null`, não `number`.
 */
export function lerTotaisDerivados(a: {
  derived_children?: number | null;
  derived_hours?: number | null;
  derived_end?: string | null;
  derived_progress?: number | null;
}): TotaisDerivados {
  return {
    filhas: a.derived_children ?? null,
    horas: a.derived_hours ?? null,
    termino: a.derived_end ?? null,
    progresso: a.derived_progress ?? null,
  };
}

/**
 * "4 de 6 concluídas · 24h · término 19/09" — a linha do cabeçalho das
 * subatividades, montada só com o que o servidor mandou.
 *
 * Cada pedaço some quando não há dado, em vez de virar "0" ou "—": o desenho
 * manda o vazio dizer o que falta, e um "0h" ao lado de "4 de 6 concluídas"
 * afirmaria que ninguém estimou nada, quando o que houve foi ausência de
 * resposta do servidor.
 */
/**
 * `concluidas` vem de FORA: o servidor deriva `derived_children`, mas não um
 * "quantas concluíram" — conferido no esquema, `derived_completed_children`
 * não existe. Contar as filhas já carregadas é legítimo AQUI e não em outros
 * lugares, porque é contagem do que está à vista, não agregado que se persiste.
 * A distinção é a do incidente do agregado: contar para exibir é diferente de
 * somar para gravar.
 */
export function resumoDasSubatividades(
  t: TotaisDerivados,
  formatarData: (d: string) => string,
  concluidas?: number,
): string | null {
  const partes: string[] = [];
  if (t.filhas !== null && t.filhas > 0) {
    partes.push(`${concluidas ?? 0} de ${t.filhas} concluídas`);
  }
  if (t.horas !== null && t.horas > 0) partes.push(`${t.horas}h`);
  if (t.termino) partes.push(`término ${formatarData(t.termino)}`);
  return partes.length > 0 ? partes.join(" · ") : null;
}
