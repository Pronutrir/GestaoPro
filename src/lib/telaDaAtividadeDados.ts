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

/* ────────────────────────────────────────────────────────────────────────────
 * O FEED — o que ACONTECEU, agrupado por dia
 *
 * ============================================================================
 * OS EVENTOS JÁ EXISTIAM, E EU IA DUPLICÁ-LOS
 *
 * A primeira versão deste bloco criava uma tabela de eventos com trigger para
 * subir o que acontece na filha para o feed do pai. Ao conferir o banco antes
 * de aplicar, apareceu que a fase 08 já tinha entregue exatamente isso:
 *
 *   activity_feed_events  view que une CONVERSA + HISTÓRICO, com autor
 *                         resolvido e resumo
 *   feed_da_subarvore()   junta a subárvore inteira, ordenada, com o código
 *                         EAP da filha — `ehraiz: false` marca o que subiu
 *
 * Conferido com dado real: a função devolve eventos de filhas. O que faltava
 * era só o NÃO-LIDO, que precisa de um sujeito e por isso é tabela à parte.
 * ============================================================================ */

export interface EventoDoBanco {
  activity_id: string;
  wbs_code: string | null;
  titulo: string;
  ehraiz: boolean;
  tipo: string;
  evento_id: string;
  ocorrido_em: string;
  autor: string | null;
  autor_id: string | null;
  campo: string | null;
  resumo: string | null;
}

/**
 * O feed de uma atividade, já com o que aconteceu nas filhas.
 *
 * `feed_da_subarvore` faz a junção no banco. Fazer aqui exigiria carregar a
 * subárvore inteira — e a subárvore passa pela RLS, o que devolveria um feed
 * diferente para cada pessoa pelo motivo errado.
 */
export async function carregarFeed(
  activityId: string,
  limite = 60,
): Promise<EventoDoBanco[]> {
  const { data, error } = await supabase.rpc("feed_da_subarvore" as never, {
    _raiz: activityId,
    _limit: limite,
  } as never);
  if (error) throw new Error(`não foi possível ler o feed: ${error.message}`);
  return (data ?? []) as unknown as EventoDoBanco[];
}

/**
 * Quantos eventos entraram desde a última visita desta pessoa.
 *
 * Sem visita registrada, o não-lido é ZERO — não "tudo". Quem abre uma
 * atividade pela primeira vez não tem 40 pendências para ler; tem um histórico
 * para consultar. Marcar tudo como novo faria o sino gritar em toda atividade
 * que a pessoa nunca abriu.
 */
export async function contarNaoLidos(
  activityId: string,
  userId: string,
): Promise<number> {
  const { data: visita } = await tabela("activity_feed_visitas")
    .select("visto_em")
    .eq("user_id", userId)
    .eq("activity_id", activityId)
    .maybeSingle();

  const desde = (visita as { visto_em?: string } | null)?.visto_em;
  if (!desde) return 0;

  const eventos = await carregarFeed(activityId, 200).catch(() => [] as EventoDoBanco[]);
  return eventos.filter((e) => e.ocorrido_em > desde).length;
}

/** Marca o feed como visto agora. */
export async function marcarFeedVisto(activityId: string, userId: string): Promise<void> {
  const { error } = await tabela("activity_feed_visitas")
    .upsert(
      { user_id: userId, activity_id: activityId, visto_em: new Date().toISOString() } as never,
      { onConflict: "user_id,activity_id" } as never,
    );
  if (error) throw new Error(`não foi possível marcar como lido: ${error.message}`);
}

/**
 * Agrupa por dia, com os rótulos que uma pessoa usa: "Hoje", "Ontem", data.
 *
 * `hojeISO` entra por parâmetro para o agrupamento ser testável — e porque
 * `new Date()` dentro de uma função de formatação torna impossível provar o que
 * ela faz na virada do dia.
 */
export function agruparPorDia(
  eventos: EventoDoBanco[],
  hojeISO: string,
): { rotulo: string; eventos: EventoDoBanco[] }[] {
  const dia = (iso: string) => iso.slice(0, 10);
  const hoje = dia(hojeISO);
  const ontem = (() => {
    const d = new Date(`${hoje}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const porDia = new Map<string, EventoDoBanco[]>();
  for (const e of eventos) {
    const k = dia(e.ocorrido_em);
    if (!porDia.has(k)) porDia.set(k, []);
    porDia.get(k)!.push(e);
  }

  return [...porDia.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([k, evs]) => ({
      rotulo: k === hoje ? "Hoje" : k === ontem ? "Ontem" : k.split("-").reverse().join("/"),
      eventos: evs,
    }));
}

/**
 * A FRASE de um evento, em português.
 *
 * O de-para mora AQUI, num lugar só, e não em cada componente — é a regra do
 * CLAUDE.md: *"Resolver o rótulo na origem, não com um de-para no componente."*
 * O tipo desconhecido cai no próprio texto do banco em vez de virar enum na
 * tela; se nem isso houver, diz "registrou uma alteração", que é verdade.
 */
export function fraseDoEvento(e: EventoDoBanco): string {
  const quem = e.autor || "alguém";
  const onde = e.ehraiz ? "" : ` em ${e.wbs_code || e.titulo}`;
  if (e.tipo === "comentario") return e.resumo || "(comentário vazio)";
  if (e.tipo === "alteracao") {
    const campos = (e.campo || "").split(",").map((c) => c.trim()).filter(Boolean);
    const rotulos: Record<string, string> = {
      title: "o nome", description: "a descrição", hours: "as horas",
      status: "o status", workflow_stage_id: "a coluna", estagio: "o estágio",
      end_date: "o prazo", start_date: "o início", assigned_to: "o responsável",
    };
    const nomes = campos.map((c) => rotulos[c] ?? c);
    const lista = nomes.length > 2
      ? `${nomes.slice(0, 2).join(", ")} e mais ${nomes.length - 2}`
      : nomes.join(" e ");
    return `${quem} alterou ${lista || "um campo"}${onde}`;
  }
  return `${quem} registrou uma alteração${onde}`;
}
