/**
 * AS SETE DECISÕES DA MESA DE PLANEJAMENTO — a lógica, separada da pintura.
 *
 * ============================================================================
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * A fase 06 é a maior reescrita de interface do plano, e interface eu não
 * consigo verificar: "compila" não é "a barra de seleção aparece".
 *
 * O que dá para verificar é a REGRA por trás de cada decisão — quando o GUT
 * colore, o que uma célula vazia diz, o que entra no subtotal. Extraí-las para
 * cá torna a parte decidível testável, e deixa para o componente só o que é
 * genuinamente visual.
 *
 * Se a tela for reescrita depois, estas regras não são reescritas junto — e é
 * assim que a decisão sobrevive à próxima refatoração.
 * ============================================================================
 */
import { agregadoDoPai, somarIrmaos, janelaDeDatas, type ItemComAgregado } from "@/lib/agregadoDoPai";

/* ── Decisão 3 — GUT só ganha cor a partir de 60 ───────────────────────────
 *
 * "Se todo GUT é colorido, nenhum chama atenção." Abaixo de 60 o número fica
 * cinza; 60–99 âmbar; 100+ vermelho.
 *
 * `--gut-medio` e `--gut-baixo` existem em tokens.css para gráfico e legenda —
 * NÃO para a coluna GUT da tabela.
 */
export type FaixaGut = "critico" | "alto" | "neutro" | "nao-avaliado";

export function faixaDoGut(score: number | null | undefined): FaixaGut {
  if (score === null || score === undefined || !Number.isFinite(score) || score <= 0) {
    return "nao-avaliado";
  }
  if (score >= 100) return "critico";
  if (score >= 60) return "alto";
  return "neutro";
}

/** A classe de cor da faixa. `neutro` não colore — é o ponto da decisão 3. */
export function corDoGut(faixa: FaixaGut): string {
  switch (faixa) {
    case "critico": return "text-[hsl(var(--gut-critico))] font-semibold";
    case "alto":    return "text-[hsl(var(--gut-alto))] font-semibold";
    default:        return "text-muted-foreground";
  }
}

/**
 * O rótulo de quem não tem GUT.
 *
 * "Sem avaliação GUT" descrevia o campo; "Prioridade não avaliada" descreve a
 * situação — e é o que a pessoa precisa resolver.
 */
export const ROTULO_GUT_VAZIO = "Prioridade não avaliada";

/* ── Decisão 5 — vazio diz o que falta ─────────────────────────────────────
 *
 * `—` não distingue *não preenchi* de *não se aplica*. São coisas diferentes:
 * a primeira é pendência, a segunda é a natureza do item.
 */
export type Vazio =
  | { tipo: "a-definir"; texto: string }
  | { tipo: "nao-se-aplica" }
  | { tipo: "preenchido" };

/**
 * Como uma célula vazia se apresenta.
 *
 * No MARCO, responsável/esforço/custo/GUT ficam **literalmente vazios** — não
 * com traço. Não é lacuna: marco não tem esses campos.
 */
export function comoMostrarVazio(
  valor: unknown,
  campo: "responsavel" | "esforco" | "custo" | "gut" | "data",
  ehMarco: boolean,
): Vazio {
  const vazio = valor === null || valor === undefined || valor === ""
    || (typeof valor === "number" && valor === 0);

  if (!vazio) return { tipo: "preenchido" };

  // Marco não tem esforço nem responsável. Data ele tem — e é o campo dele.
  if (ehMarco && campo !== "data") return { tipo: "nao-se-aplica" };

  return {
    tipo: "a-definir",
    texto: campo === "responsavel" ? "a definir"
         : campo === "data" ? "sem data"
         : "—",
  };
}

/* ── Decisão 6/7 — a faixa de grupo carrega o resumo ───────────────────────
 *
 * A faixa separa (o que a zebra faria) E informa (o que a zebra não faz):
 * contagem, horas somadas e janela.
 */
export interface ResumoDoGrupo {
  itens: number;
  horas: number;
  custo: number;
  inicio: string | null;
  fim: string | null;
}

/**
 * O resumo de um grupo, para a faixa e para o subtotal.
 *
 * **Consome o agregado do servidor** (`lib/agregadoDoPai`), não recalcula.
 * Somar aqui seria a quarta fórmula viva — e, para quem enxerga uma fatia, o
 * subtotal mostraria menos do que a fase realmente tem.
 */
export function resumoDoGrupo(filhos: ItemComAgregado[]): ResumoDoGrupo {
  const { horas, custo } = somarIrmaos(filhos);
  const { inicio, fim } = janelaDeDatas(filhos);
  return { itens: filhos.length, horas, custo, inicio, fim };
}

/** O total do projeto — a mesma regra, sobre as raízes. */
export function totalDoProjeto(raizes: ItemComAgregado[]): ResumoDoGrupo {
  return resumoDoGrupo(raizes);
}

/* ── Decisão 4 — número alinha à direita, com tabular-nums ─────────────────
 *
 * Esforço e custo existem para serem comparados de relance. À esquerda, e com
 * dígito de largura variável, não comparam nada.
 */
export const CLASSE_NUMERO = "text-right tabular-nums";

/** Horas como "24h" / "7,5h". Zero vira vazio: 0h é ruído numa coluna. */
export function formatarHoras(h: number): string {
  if (!h || h <= 0) return "";
  const s = Number.isInteger(h) ? String(h) : h.toFixed(1).replace(".", ",");
  return `${s}h`;
}

/**
 * Custo sem "R$" em cada linha — o cabeçalho já diz.
 *
 * Decisão em aberto registrada na fase 06: quem confere orçamento pode
 * precisar de centavos. Se for o caso, um modo exato entra no menu Colunas,
 * sem sujar o padrão.
 */
export function formatarCusto(c: number): string {
  if (!c || c <= 0) return "";
  return c.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/* ── Atraso ────────────────────────────────────────────────────────────────
 *
 * Compara TEXTO `YYYY-MM-DD`. Coluna `date` não pode passar por `new Date()`:
 * o fuso desloca o dia, e o bug só aparece para quem está a oeste de UTC.
 */
export function diasDeAtraso(fim: string | null | undefined, hoje: string): number {
  if (!fim || !hoje) return 0;
  const f = fim.slice(0, 10);
  const h = hoje.slice(0, 10);
  if (f >= h) return 0;
  // Só aqui vira Date, e com os dois já normalizados para o mesmo formato.
  const ms = new Date(`${h}T00:00:00Z`).getTime() - new Date(`${f}T00:00:00Z`).getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

/* ── Decisão 1 — sem badge de tipo em atividade ────────────────────────────
 *
 * Fase e Entrega viram faixa de grupo; Marco tem tratamento próprio. Tudo que
 * sobra numa linha *é* atividade — o badge repetia o que a indentação e o
 * código EAP já diziam, e era 90% dos badges da tela.
 */
export function mostrarBadgeDeTipo(item: { is_milestone?: boolean | null }, ehAgrupador: boolean): boolean {
  if (ehAgrupador) return false;      // vira faixa
  if (item.is_milestone) return true; // marco se identifica
  return false;                        // atividade não precisa
}

/* ── Presets de coluna por papel (fase 06) ─────────────────────────────────
 *
 * Ninguém precisa configurar para começar. "Colunas" continua disponível.
 */
export type ColunaBacklog = "eap" | "nome" | "responsavel" | "previsto" | "esforco" | "custo" | "gut";

export function colunasPorPapel(papel: "planeja" | "executa" | "externo"): ColunaBacklog[] {
  switch (papel) {
    case "planeja": return ["eap", "nome", "responsavel", "previsto", "esforco", "custo", "gut"];
    case "executa": return ["eap", "nome", "responsavel", "previsto", "esforco", "gut"];
    // Externo não vê custo nem esforço — nem as irmãs, mas isso é a RLS.
    case "externo": return ["eap", "nome", "previsto"];
  }
}

/** Marco não tem `wbs_code`: mostra a âncora do pai, nunca um código inventado. */
export function codigoParaExibir(
  item: { wbs_code?: string | null; is_milestone?: boolean | null },
  codigoDoPai?: string | null,
): string {
  if (item.wbs_code) return item.wbs_code;
  if (item.is_milestone && codigoDoPai) return `${codigoDoPai} ·`;
  return "";
}

export { agregadoDoPai };
