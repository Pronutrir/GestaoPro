/**
 * Leitura das COLUNAS de uma EAP colada de planilha.
 *
 * Um copy/paste de Excel/Project chega com os campos separados por TAB. O
 * parser antigo trocava TAB por espaço antes de ler a linha, então datas, horas
 * e responsável entravam dentro do TÍTULO — a informação não era só ignorada,
 * ela sujava o nome da tarefa.
 *
 * Aqui as colunas são reconhecidas pelo CONTEÚDO (e pelo cabeçalho, quando
 * existe), porque a ordem varia entre planilhas e ninguém quer configurar
 * mapeamento antes de colar.
 */

export type ColRole =
  | "codigo" | "titulo"
  | "inicio" | "fim"
  | "inicio_real" | "fim_real"
  | "horas" | "custo" | "responsavel"
  | "ignorar";

export const COL_LABEL: Record<ColRole, string> = {
  codigo: "Código EAP",
  titulo: "Título",
  inicio: "Início previsto",
  fim: "Fim previsto",
  inicio_real: "Início real",
  fim_real: "Fim real",
  horas: "Horas",
  custo: "Custo",
  responsavel: "Responsável",
  ignorar: "Ignorar",
};

/** Uma linha já quebrada em células. */
export type Row = string[];

/** Quebra o texto em linhas × células. Só vale quando há TAB de verdade. */
export function splitColumns(text: string): Row[] | null {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  // Exige TAB na maioria das linhas: uma única linha com TAB solto costuma ser
  // acidente de digitação, não planilha.
  const comTab = lines.filter((l) => l.includes("\t")).length;
  if (comTab < Math.max(2, Math.ceil(lines.length * 0.6))) return null;
  return lines.map((l) => l.split("\t").map((c) => c.trim()));
}

/* ------------------------------------------------------------------ */
/*  Reconhecimento de valores                                          */
/* ------------------------------------------------------------------ */

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/**
 * Converte para ISO (YYYY-MM-DD). Aceita o que sai de planilha em pt-BR:
 * 01/08/2026 · 01/08/26 · 01-08-2026 · 2026-08-01 · 01-ago-26 · 1/8/2026
 *
 * Devolve null quando não é data — é assim que a detecção de coluna decide.
 */
export function parseDateBR(raw: string, anoPadrao = new Date().getFullYear()): string | null {
  const s = (raw || "").trim();
  if (!s) return null;

  // ISO direto
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return montar(+iso[1], +iso[2], +iso[3]);

  // dd/mm/aaaa | dd-mm-aa
  const br = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (br) return montar(normalizaAno(+br[3]), +br[2], +br[1]);

  // dd/mm  (sem ano — planilha de projeto costuma omitir)
  const curto = s.match(/^(\d{1,2})[/\-.](\d{1,2})$/);
  if (curto) return montar(anoPadrao, +curto[2], +curto[1]);

  // 01-ago-26 | 1 ago 2026
  const ext = s.match(/^(\d{1,2})[\s\-/]*([a-zç]{3,})[\s\-/]*(\d{2,4})?$/i);
  if (ext) {
    const mes = MESES[ext[2].slice(0, 3).toLowerCase()];
    if (mes) return montar(ext[3] ? normalizaAno(+ext[3]) : anoPadrao, mes, +ext[1]);
  }
  return null;
}

const normalizaAno = (a: number) => (a < 100 ? 2000 + a : a);

function montar(ano: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  // Rejeita 31/02 e afins: o Date normalizaria em silêncio para 03/03.
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Horas: 16 · 16h · 16,5 · 1.5h · 2d (dia = 8h) · 3 dias */
export function parseHoras(raw: string): number | null {
  const s = (raw || "").trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(h|hs|hora|horas|d|dia|dias)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  const unidade = m[2] || "";
  return /^d/.test(unidade) ? n * 8 : n;
}

/** Custo: R$ 1.200,50 · 1200.5 · 1.200,50 */
export function parseCusto(raw: string): number | null {
  const s = (raw || "").trim();
  if (!s || !/[\d]/.test(s)) return null;
  if (!/^(r\$|\$)?\s*[\d.,\s]+$/i.test(s)) return null;
  // pt-BR: ponto é milhar, vírgula é decimal.
  const limpo = s.replace(/[r$\s]/gi, "");
  const n = parseFloat(
    limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo,
  );
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Código EAP, aceitando o PONTO FINAL de numeração.
 *
 * "1." é como Word, Excel e PDF numeram o nível 1 — e era rejeitado pelo
 * `/^\d+(\.\d+)*$/` anterior, que exige dígito depois de cada ponto. No modo
 * planilha isso descartava a linha INTEIRA em silêncio (o item ficava sem
 * código e caía no `continue` do parser): colar uma EAP começando em
 * "1. INICIAÇÃO E PLANEJAMENTO" mostrava "0 fases", com a fase visível no
 * campo e ausente da prévia. Relatado em 11/08.
 *
 * O ponto final é decoração de numeração, não parte do código — por isso
 * `normalizarCodigo` o remove antes de usar.
 */
const CODIGO_RE = /^\d+(\.\d+)*\.?$/;

/** Tira o ponto final decorativo: "1." → "1", "1.2." → "1.2". */
export const normalizarCodigo = (s: string) => s.trim().replace(/\.$/, "");

/**
 * Célula que carrega CÓDIGO E TÍTULO juntos: "1. INICIAÇÃO" → { "1", "INICIAÇÃO" }.
 *
 * Uma EAP colada raramente é uniforme. A lista relatada em 11/08 tinha 18 linhas
 * com TAB entre código e título e 7 só com espaços — as 7 eram justamente a fase,
 * as duas entregas e 4 atividades. O modo planilha vence a votação (18 de 25),
 * passa a ler TODA linha como colunas, e nas 7 sem TAB a célula 0 é a linha
 * inteira: não casa com CODIGO_RE, a linha é descartada e o resultado é
 * "0 fases · 18 atividades" — some exatamente a estrutura.
 *
 * O modo TEXTO já lidava com isso; o modo planilha assumia que o TAB sempre
 * separa os dois. Aceita os separadores que Word e Excel produzem: "1.1 Título",
 * "1.1. Título", "1.1) Título", "1.1 - Título".
 *
 * Devolve null quando não há título junto — aí a célula é só código, e quem
 * chama segue pelo caminho normal.
 */
const CODIGO_COM_TITULO_RE = /^(\d+(?:\.\d+)*)\s*[.)]?\s*[-–—]?\s+(\S.*)$/;

export function separarCodigoTitulo(s: string): { codigo: string; titulo: string } | null {
  const m = (s || "").trim().match(CODIGO_COM_TITULO_RE);
  if (!m) return null;
  // Um título que começa com número ("2024 revisão do plano") não deve virar
  // código: exige que o resto tenha alguma letra.
  if (!/[a-zA-ZÀ-ÿ]/.test(m[2])) return null;
  return { codigo: normalizarCodigo(m[1]), titulo: m[2].trim() };
}

/* ------------------------------------------------------------------ */
/*  Detecção do papel de cada coluna                                   */
/* ------------------------------------------------------------------ */

/** Cabeçalho → papel. Só entra quando a primeira linha não tem dado. */
function porCabecalho(h: string): ColRole | null {
  const s = h.toLowerCase().trim();
  if (!s) return null;
  const real = /(real|realizad|efetiv|execu[çc])/.test(s);
  if (/(in[íi]cio|start|come[çc])/.test(s)) return real ? "inicio_real" : "inicio";
  if (/(fim|t[ée]rmino|final|end|conclus)/.test(s)) return real ? "fim_real" : "fim";
  if (/(hora|esfor[çc]o|dura[çc]|effort|work)/.test(s)) return "horas";
  if (/(custo|valor|cost|or[çc]amento)/.test(s)) return "custo";
  if (/(respons|assign|owner|executor|quem)/.test(s)) return "responsavel";
  if (/(eap|wbs|c[óo]digo|item|n[ºo°]|edt)/.test(s)) return "codigo";
  if (/(tarefa|atividade|nome|t[íi]tulo|descri)/.test(s)) return "titulo";
  return null;
}

/**
 * Uma linha é cabeçalho se nenhuma célula parece dado.
 *
 * `separarCodigoTitulo` entra na conta porque a primeira linha da EAP é
 * "1. INICIAÇÃO E PLANEJAMENTO" — uma célula só, sem TAB. Sem reconhecê-la como
 * dado ela era tratada como cabeçalho e DESCARTADA: a fase de nível 1 sumia e
 * sobravam as entregas órfãs, que era o segundo defeito por trás de "0 fases".
 */
export function pareceCabecalho(row: Row): boolean {
  const comDado = row.filter(
    (c) =>
      CODIGO_RE.test(c) ||
      separarCodigoTitulo(c) !== null ||
      parseDateBR(c) !== null ||
      parseHoras(c) !== null,
  ).length;
  return comDado === 0 && row.some((c) => c.length > 0);
}

/**
 * Descobre o papel de cada coluna.
 *
 * Estratégia: o cabeçalho manda quando existe; senão vale o conteúdo. Datas são
 * atribuídas na ORDEM em que aparecem (previsto antes de real), que é como toda
 * planilha de cronograma é montada — e o usuário pode corrigir na tela.
 */
export function detectarColunas(rows: Row[], temCabecalho: boolean): ColRole[] {
  const largura = Math.max(...rows.map((r) => r.length));
  const corpo = temCabecalho ? rows.slice(1) : rows;
  const roles: ColRole[] = new Array(largura).fill("ignorar");

  // 1) cabeçalho explícito
  if (temCabecalho) {
    rows[0].forEach((h, i) => {
      const r = porCabecalho(h);
      if (r) roles[i] = r;
    });
  }

  // 2) conteúdo, para o que sobrou
  const amostra = (i: number) => corpo.map((r) => r[i] ?? "").filter((c) => c.length > 0);
  const taxa = (i: number, f: (s: string) => boolean) => {
    const a = amostra(i);
    return a.length === 0 ? 0 : a.filter(f).length / a.length;
  };

  const datasLivres: number[] = [];
  for (let i = 0; i < largura; i++) {
    if (roles[i] !== "ignorar") {
      if (roles[i] === "inicio" || roles[i] === "fim" ||
          roles[i] === "inicio_real" || roles[i] === "fim_real") datasLivres.push(-1);
      continue;
    }
    // Código ANTES de horas só quando é inequívoco: "40" casa com os dois
    // (é número puro), e classificar a coluna de horas como código deixaria a
    // EAP sem esforço e com um segundo "código" concorrendo. Exige ponto na
    // maioria (1.1, 2.3.4) ou ser a primeira coluna, que é onde o código vive.
    // `separarCodigoTitulo` entra aqui porque numa colagem mista a coluna 0 tem
    // células "1.1.2" (com TAB) e "1.2 Levantamento" (sem TAB). Contando só as
    // primeiras, a taxa podia ficar abaixo de 0.7 e a coluna nem virava código —
    // aí a EAP inteira era descartada, não só as linhas sem TAB.
    const ehCodigo = (s: string) => CODIGO_RE.test(s) || separarCodigoTitulo(s) !== null;
    const temPonto = (s: string) => {
      const par = separarCodigoTitulo(s);
      return par ? par.codigo.includes(".") : CODIGO_RE.test(s) && s.includes(".");
    };
    const pontuado = taxa(i, temPonto);
    const codigoish = taxa(i, ehCodigo);
    if (!roles.includes("codigo") && codigoish > 0.7 && (pontuado > 0.3 || i === 0)) {
      roles[i] = "codigo"; continue;
    }
    if (taxa(i, (s) => parseDateBR(s) !== null) > 0.5) { datasLivres.push(i); continue; }
    if (taxa(i, (s) => parseHoras(s) !== null) > 0.6) { roles[i] = "horas"; continue; }
  }

  // Datas sem cabeçalho: ordem = previsto, previsto, real, real.
  const ordem: ColRole[] = ["inicio", "fim", "inicio_real", "fim_real"];
  const jaUsados = new Set(roles.filter((r) => ordem.includes(r)));
  let k = 0;
  for (const i of datasLivres.filter((x) => x >= 0)) {
    while (k < ordem.length && jaUsados.has(ordem[k])) k++;
    if (k < ordem.length) { roles[i] = ordem[k]; jaUsados.add(ordem[k]); k++; }
  }

  // Título: a primeira coluna textual que sobrou (ou a maior, se nenhuma).
  if (!roles.includes("titulo")) {
    let melhor = -1, maior = -1;
    for (let i = 0; i < largura; i++) {
      if (roles[i] !== "ignorar") continue;
      const a = amostra(i);
      const media = a.length ? a.reduce((s, c) => s + c.length, 0) / a.length : 0;
      if (media > maior) { maior = media; melhor = i; }
    }
    if (melhor >= 0) roles[melhor] = "titulo";
  }

  return roles;
}

/** O que uma linha carrega, já convertido. */
export interface ColValues {
  codigo?: string;
  titulo?: string;
  start_date?: string;
  end_date?: string;
  actual_start_date?: string;
  actual_end_date?: string;
  hours?: number;
  cost?: number;
  responsavel?: string;
}

export function lerLinha(row: Row, roles: ColRole[], anoPadrao?: number): ColValues {
  const out: ColValues = {};
  // Título extraído da célula de CÓDIGO. Fica separado de out.titulo porque a
  // coluna dedicada de título tem precedência, e a ordem das colunas não é
  // garantida — o código costuma vir antes, mas depender disso seria frágil.
  let tituloDoCodigo: string | undefined;
  roles.forEach((role, i) => {
    const v = (row[i] ?? "").trim();
    if (!v) return;
    switch (role) {
      // normalizarCodigo: "1." vira "1". O ponto final é decoração de
      // numeração (Word/Excel/PDF), não parte do código — e sem tirá-lo o
      // split(".") produziria um segmento vazio no fim.
      //
      // A célula também pode trazer código E título juntos, quando a linha veio
      // sem TAB no meio de uma colagem que tem TAB nas outras.
      case "codigo": {
        if (CODIGO_RE.test(v)) { out.codigo = normalizarCodigo(v); break; }
        const par = separarCodigoTitulo(v);
        if (par) { out.codigo = par.codigo; tituloDoCodigo = par.titulo; }
        break;
      }
      case "titulo": out.titulo = v; break;
      case "inicio": { const d = parseDateBR(v, anoPadrao); if (d) out.start_date = d; break; }
      case "fim": { const d = parseDateBR(v, anoPadrao); if (d) out.end_date = d; break; }
      case "inicio_real": { const d = parseDateBR(v, anoPadrao); if (d) out.actual_start_date = d; break; }
      case "fim_real": { const d = parseDateBR(v, anoPadrao); if (d) out.actual_end_date = d; break; }
      case "horas": { const h = parseHoras(v); if (h !== null) out.hours = h; break; }
      case "custo": { const c = parseCusto(v); if (c !== null) out.cost = c; break; }
      case "responsavel": out.responsavel = v; break;
    }
  });
  if (!out.titulo && tituloDoCodigo) out.titulo = tituloDoCodigo;
  return out;
}

/**
 * Status derivado das datas reais — decisão do usuário: importar histórico e
 * ver tudo como "pendente" obrigaria a refazer o trabalho à mão.
 *
 *   fim real            → concluída
 *   início real sem fim → em andamento
 *   nenhum              → pendente (como antes)
 */
export function statusPorDatas(v: ColValues): "completed" | "in_progress" | "pending" {
  if (v.actual_end_date) return "completed";
  if (v.actual_start_date) return "in_progress";
  return "pending";
}
