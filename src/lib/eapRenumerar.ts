/**
 * RENUMERAR A EAP DE UM PROJETO — colocar o projeto no nível 1.
 *
 * Convenção antiga (projeto FORA da numeração):
 *
 *   1        Fase
 *   1.1      Entrega
 *   1.1.1    Atividade
 *
 * Convenção nova (projeto no nível 1):
 *
 *   1        Projeto      ← virtual, não é linha no banco
 *   1.1      Fase
 *   1.1.1    Entrega
 *   1.1.1.1  Atividade
 *
 * A transformação é um PREFIXO: todo código ganha "1." na frente. O projeto em
 * si não vira linha — ele já existe na tabela `projects`, e duplicá-lo criaria
 * um item sem responsável, sem horas e que nunca conclui.
 *
 * ---------------------------------------------------------------------------
 * POR QUE EM DUAS PASSADAS
 *
 * Há um UNIQUE em `activities.wbs_code` cuja existência é ambígua — duas
 * migrations se contradizem (20260512210000 cria, 20260722130000 afirma que há
 * duplicatas legadas). Se estiver ativo, o UPDATE direto colide:
 *
 *   1   → 1.1   mas "1.1" JÁ EXISTE (é filho do 1)  ✗ aborta
 *
 * A saída é passar por um prefixo temporário que não colide com nada, e só
 * depois aterrissar no código final. Custa duas passadas e funciona com ou sem
 * a restrição — não é preciso descobrir qual dos dois casos é o real.
 * ---------------------------------------------------------------------------
 */

/** Prefixo que nenhum código EAP válido pode ter (só dígitos e pontos são válidos). */
const PREFIXO_TEMP = "tmp~";

export interface ItemRenumerar {
  id: string;
  wbs_code?: string | null;
}

export interface PassoRenumeracao {
  id: string;
  de: string;
  para: string;
}

export interface PlanoRenumeracao {
  /** 1ª passada: código atual → temporário. Vazio quando não há o que fazer. */
  paraTemp: PassoRenumeracao[];
  /** 2ª passada: temporário → código final. */
  paraFinal: PassoRenumeracao[];
  /** Itens já no formato novo, ignorados. */
  jaMigrados: number;
  /** Itens sem código válido, intocados — não dá para renumerar o que não tem número. */
  semCodigo: number;
  /** O código mais fundo DEPOIS da renumeração. */
  profundidadeFinal: number;
  /** Nada a fazer, mas a origem é ambígua (EAP antiga que não começa em 1). */
  precisaConferir?: boolean;
}

/** Código EAP válido: só dígitos separados por ponto. */
const CODIGO_VALIDO = /^\d+(\.\d+)*$/;

const normalizar = (c: string) => {
  const partes = c.trim().split(".");
  // "1.0" é nível 1 com zero decorativo — some antes de contar o nível.
  while (partes.length > 1 && partes[partes.length - 1] === "0") partes.pop();
  return partes.join(".");
};

/**
 * Monta o plano SEM tocar no banco.
 *
 * `jaMigrado` evita o pior erro possível aqui: rodar duas vezes e empurrar a
 * EAP um nível a cada clique, produzindo "1.1.1.1.1" sem que nada avise.
 *
 * O TESTE É A AUSÊNCIA DO CÓDIGO "1".
 *
 * Na convenção nova o "1" pertence ao PROJETO, que é virtual — nenhuma linha do
 * banco carrega esse código. Na antiga, "1" é a primeira fase e quase sempre
 * existe. Então: existe um item com código exatamente "1"? Não migrado.
 *
 * A primeira versão testava "raiz única = 1", e o teste reprovou: a EAP do
 * ultrassom tem uma fase só, então sua raiz já era única e ela seria dada como
 * migrada sem nunca ter sido renumerada. Raiz única é ambíguo — descreve tanto
 * a EAP nova quanto a antiga com uma fase apenas.
 *
 * Resta um caso ambíguo honesto: EAP antiga que começa em "2" (sem fase 1). Aí
 * não há "1" e ela pareceria migrada. É raro e o resultado é não fazer nada —
 * o lado seguro do erro. `precisaConferir` sinaliza para a tela avisar.
 */
export function planejarRenumeracao(itens: ItemRenumerar[]): PlanoRenumeracao {
  const comCodigo: { id: string; code: string }[] = [];
  let semCodigo = 0;

  for (const it of itens) {
    const bruto = (it.wbs_code ?? "").trim();
    if (!bruto || !CODIGO_VALIDO.test(bruto)) { semCodigo++; continue; }
    comCodigo.push({ id: it.id, code: normalizar(bruto) });
  }

  if (comCodigo.length === 0) {
    return { paraTemp: [], paraFinal: [], jaMigrados: 0, semCodigo, profundidadeFinal: 0 };
  }

  // O código "1" é do projeto (virtual): se nenhum item o tem, já está migrado.
  const temCodigoUm = comCodigo.some((c) => c.code === "1");
  const raizes = new Set(comCodigo.map((c) => c.code.split(".")[0]));

  if (!temCodigoUm) {
    const prof = Math.max(...comCodigo.map((c) => c.code.split(".").length));
    return {
      paraTemp: [], paraFinal: [],
      jaMigrados: comCodigo.length, semCodigo, profundidadeFinal: prof,
      // Tudo sob "1." é migração de verdade. Raiz diferente de 1 é o caso
      // ambíguo: EAP antiga começando em "2" não tem como ser distinguida.
      precisaConferir: !(raizes.size === 1 && raizes.has("1")),
    };
  }

  const paraTemp: PassoRenumeracao[] = [];
  const paraFinal: PassoRenumeracao[] = [];

  for (const { id, code } of comCodigo) {
    const novo = `1.${code}`;
    const temp = `${PREFIXO_TEMP}${novo}`;
    paraTemp.push({ id, de: code, para: temp });
    paraFinal.push({ id, de: temp, para: novo });
  }

  const profundidadeFinal = Math.max(...paraFinal.map((p) => p.para.split(".").length));
  return { paraTemp, paraFinal, jaMigrados: 0, semCodigo, profundidadeFinal };
}

/**
 * Desfaz: tira o "1." da frente. Serve para o rollback e para provar, em teste,
 * que a renumeração não perde informação.
 */
export function reverterCodigo(code: string): string | null {
  const c = (code ?? "").trim();
  if (!CODIGO_VALIDO.test(c)) return null;
  if (c === "1") return null; // o projeto não tinha código antes
  if (!c.startsWith("1.")) return null;
  return c.slice(2);
}
