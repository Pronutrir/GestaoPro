'use client';
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Layers, Circle, Diamond, Package, AlertTriangle, FolderTree, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAppConfirm } from "@/components/AppConfirmProvider";
import { cn } from "@/lib/utils";
import {
  splitColumns, pareceCabecalho, detectarColunas, lerLinha, statusPorDatas,
  type ColValues,
} from "@/lib/wbsColumns";
import { eapRoleForImport, eapToPersisted, eapIsFaseLevel, eapCodeToPersist, eapRootCode, type EapKind } from "@/lib/eapModel";

/* ------------------------------------------------------------------ */
/*  Modelo interno: cada nó da árvore importada com seu papel EAP.      */
/* ------------------------------------------------------------------ */
// Papel vem de eapModel: os quatro papéis são um vocabulário só, e um alias
// local já havia deixado esta tela divergir das outras.
type EapRole = EapKind;
interface TreeNode {
  code: string;          // 1, 1.1, 1.1.2...
  title: string;
  depth: number;         // 1 = topo
  role: EapRole;         // resolvido por posição + palavra-chave
  parentCode: string | null;
  /** O código veio ESCRITO no texto, ou foi inventado pelo recuo? Decide se a
   *  posição pode vencer a palavra "Marco" no título — ver eapRoleForImport. */
  codigoExplicito?: boolean;
  /** Datas, horas, custo e responsável lidos das colunas da planilha. */
  vals?: ColValues;
  /**
   * Número da linha no texto colado — só para item SEM código (marco solto).
   *
   * A árvore é ordenada por `code`, e quem não tem código não teria lugar: iria
   * parar no começo ou no fim, longe de onde foi escrito. Este número devolve a
   * posição original na hora de ordenar.
   */
  ordemNoTexto?: number;
}

interface ImportWBSDialogProps {
  projectId: string;
  onDataChanged: () => void;
}

const ROLE_META: Record<EapRole, { label: string; short: string; icon: JSX.Element; cls: string }> = {
  // Projeto é a raiz. Aparece na prévia para a estrutura se ler inteira, mas
  // não vira linha — o projeto já existe na tabela `projects`.
  projeto:   { label: "Projeto",      short: "Proj.", icon: <FolderTree className="w-3 h-3" />, cls: "bg-foreground/10 text-foreground border-foreground/25" },
  fase:      { label: "Fase",         short: "Fase",  icon: <Layers className="w-3 h-3" />,  cls: "bg-primary/10 text-primary border-primary/30" },
  // Entrega agrupa como a Fase, mas está dentro dela — tom mais discreto para
  // a hierarquia se ler de relance na pré-visualização.
  entrega:   { label: "Entrega",      short: "Entr.", icon: <Package className="w-3 h-3" />, cls: "bg-primary/5 text-primary/80 border-primary/20" },
  atividade: { label: "Atividade",    short: "Ativ.", icon: <Circle className="w-3 h-3" />,  cls: "bg-muted text-muted-foreground border-border" },
  marco:     { label: "Marco",        short: "Marco", icon: <Diamond className="w-3 h-3" />,  cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
};

/** "2026-08-01" → "01/08". Só o dia importa na prévia; o ano polui. */
const fmtDia = (iso?: string) => {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

/**
 * Papel de cada nó. Duas perguntas independentes, que antes estavam coladas:
 *
 *   NÍVEL   diz o que o item É na EAP. Só o nível da Fase (EAP_FASE_LEVEL) é
 *           Fase — "1.1" não é outra fase, é uma ENTREGA dentro da fase 1.
 *   FUNÇÃO  diz se pode ter filhos. O trigger `eap_nesting_rule` (migration
 *           20260722160000, aplicada na VM) recusa folha com subitens.
 *
 * Antes daqui só `depth === 1` virava Fase e todo o resto virava Atividade —
 * então um "11.1 Go Live" com três filhos saía como folha e derrubava a
 * importação INTEIRA, mesmo aparecendo válido na pré-visualização. A primeira
 * tentativa de conserto marcou todo agrupador como Fase, o que destravou o
 * trigger mas achatou a EAP: "1" e "1.1" viravam ambos Fase, e a entrega
 * deixava de estar dentro da fase.
 *
 * A decisão em si mora em `eapRoleForImport` (lib/eapModel): a palavra-chave de
 * marco era declarada aqui dentro e a tela não conseguia explicar ao usuário
 * uma regra que só o parser conhecia.
 */
const aplicarPapeis = (nodes: TreeNode[]) => {
  const temFilhos = new Set(nodes.map((n) => n.parentCode).filter(Boolean) as string[]);
  for (const n of nodes) {
    n.role = eapRoleForImport({
      depth: n.depth,
      hasChildren: temFilhos.has(n.code),
      title: n.title,
      codigoExplicito: n.codigoExplicito !== false,
    });
  }
};

/**
 * Uma linha colada que NÃO virou item — com o porquê.
 *
 * Antes o parser descartava com um `continue` mudo, e a prévia reconstruía a
 * contagem por SUBTRAÇÃO (coladas − reconhecidas). Por isso o aviso dizia "1
 * linha" e nunca "a linha 7": não existia lista nenhuma para mostrar.
 *
 * `anexada` não é perda — é o título que quebrou em duas ao colar e foi juntado
 * ao item anterior. Aparecia no mesmo contador e assustava à toa: o texto FOI
 * importado.
 */
type LinhaDescartada = {
  /** Número da linha no texto colado, contando a partir de 1. */
  numero: number;
  texto: string;
  motivo: "sem-codigo" | "codigo-invalido" | "sem-titulo" | "anexada" | "numerada";
  /** Para `anexada`: em qual item o texto entrou. Para `numerada`: o código dado. */
  anexadaEm?: string;
};

const MOTIVO_LABEL: Record<LinhaDescartada["motivo"], string> = {
  "sem-codigo": "sem código EAP",
  "codigo-invalido": "código fora do padrão",
  "sem-titulo": "sem título",
  "anexada": "juntada à linha anterior",
  // `numerada` NÃO é perda: a linha ENTROU na EAP, sem código, no lugar em que
  // foi colada. Fica na lista para a decisão ser visível e conferível.
  "numerada": "entrou sem código, na posição do texto",
};

/**
 * Motivos que NÃO representam perda — a linha foi aproveitada de algum jeito.
 *
 * Fora do componente porque é constante: dentro, o Set seria recriado a cada
 * render e as memoizações que dependem dele nunca segurariam nada.
 */
const MOTIVOS_SEM_PERDA = new Set<LinhaDescartada["motivo"]>(["anexada", "numerada"]);

type ResultadoParse = { nodes: TreeNode[]; descartadas: LinhaDescartada[] };

/**
 * A linha sem código é CONTINUAÇÃO da anterior, ou um item por conta própria?
 *
 * O parser anexava qualquer linha sem código ao título de cima, sem perguntar.
 * O resultado apareceu na tela: "Marco M1 — TAP aprovado", numa linha própria,
 * virou parte de "1.1.1.11 Aprovar TAP" — e a palavra "Marco" no título assim
 * formado ainda fez o item ser classificado como Marco. Dois erros de uma vez:
 * o texto foi para o lugar errado E mudou o papel do item que o recebeu.
 *
 * Continuação de verdade é o RESTO de uma frase cortada ao colar: começa em
 * minúscula, ou por conectivo/pontuação. Uma linha que abre em maiúscula, tem
 * verbo próprio e faz sentido sozinha não é sobra — é um item que veio sem
 * numeração.
 *
 * Na dúvida, NÃO anexa: deixar o item de fora é visível na contagem e na lista
 * de descarte; misturá-lo no título alheio é silencioso e ainda contamina o
 * papel.
 */
const pareceContinuacao = (linha: string): boolean => {
  const t = (linha || "").trim();
  if (!t) return false;
  // Fragmento curto ("de stakeholders", "do projeto") é o caso clássico.
  if (t.length <= 3) return true;
  // Começa em minúscula: ninguém escreve item de EAP assim.
  const primeira = t[0];
  if (primeira === primeira.toLowerCase() && primeira !== primeira.toUpperCase()) return true;
  // Abre por conectivo ou pontuação de continuação.
  if (/^(e|ou|de|da|do|das|dos|para|com|em|no|na|nos|nas|por|a|à|ao|aos|às)\s/i.test(t)) return true;
  if (/^[,;:)\]\-–—]/.test(t)) return true;
  return false;
};

/* ------------------------------------------------------------------ */
/*  Parser FLEXÍVEL: aceita código numérico (1.2.3), bullets (• - – *)  */
/*  e indentação por espaços/tabs. Sempre produz uma hierarquia com     */
/*  códigos normalizados (1, 1.1, 1.1.2...).                            */
/*                                                                      */
/*  Devolve TAMBÉM o que descartou: a prévia precisa dizer QUAL linha    */
/*  ficou de fora, e o motivo é diferente em cada caso.                 */
/* ------------------------------------------------------------------ */
const parseFlexible = (text: string): ResultadoParse => {
  const descartadas: LinhaDescartada[] = [];
  // MODO PLANILHA: quando vem com TAB, as colunas são lidas antes de tudo.
  // Sem isto o TAB virava espaço e datas/horas entravam no TÍTULO — a
  // informação não era só perdida, sujava o nome da tarefa.
  const grid = splitColumns(text);
  if (grid) {
    const temCab = pareceCabecalho(grid[0]);
    const roles = detectarColunas(grid, temCab);
    const corpo = temCab ? grid.slice(1) : grid;
    // O ÍNDICE ORIGINAL viaja junto: sem ele o aviso não teria número de linha
    // para citar, e clicar não teria para onde levar. O +1 do cabeçalho e o +1
    // da contagem humana (linha 1, não linha 0) entram aqui.
    const deslocamento = (temCab ? 1 : 0) + 1;
    const linhas = corpo
      .map((row, i) => ({ vals: lerLinha(row, roles), row, numero: i + deslocamento }))
      .filter((x) => {
        if ((x.vals.titulo || "").trim().length > 0) return true;
        descartadas.push({ numero: x.numero, texto: x.row.join(" ").trim(), motivo: "sem-titulo" });
        return false;
      });

    const nodes: TreeNode[] = [];
    for (const { vals, numero, row } of linhas) {
      // Sem código não há como posicionar na árvore. Este descarte já custou
      // caro: um código com ponto final ("1.") era rejeitado pelo CODIGO_RE e
      // a fase sumia da prévia SEM AVISO — a linha estava visível no campo e
      // ausente do resultado. Agora ele é REGISTRADO em vez de silencioso.
      if (!vals.codigo) {
        descartadas.push({
          numero,
          texto: (vals.titulo || row.join(" ")).trim(),
          motivo: "sem-codigo",
        });
        continue;
      }
      const parts = vals.codigo.split(".");
      while (parts.length > 1 && parts[parts.length - 1] === "0") parts.pop();
      const code = parts.join(".");
      const depth = parts.length;
      nodes.push({
        code,
        title: (vals.titulo || "").trim(),
        depth,
        role: "atividade",
        parentCode: depth > 1 ? parts.slice(0, -1).join(".") : null,
        vals,
      });
    }
    aplicarPapeis(nodes);
    nodes.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    return { nodes, descartadas };
  }

  // O NÚMERO DA LINHA vem do texto ORIGINAL, antes de descartar as vazias —
  // é o número que a pessoa vê no campo e para onde o clique vai rolar. Contar
  // depois do filtro daria um número que não existe na tela.
  const rawLines = text.split("\n")
    .map((l, i) => ({ linha: l.replace(/\t/g, "  "), numero: i + 1 }))
    .filter((x) => x.linha.trim().length > 0);
  if (rawLines.length === 0) return { nodes: [], descartadas };

  // Aceita "1.1 Título", "1.1. Título", "1.1) Título" e "1.1 - Título".
  // O separador opcional depois do código evita que uma EAP colada do Word,
  // que costuma usar ")" ou "-", deixe de ser reconhecida como numerada.
  const numRe = /^\s*(\d+(?:\.\d+)*)\s*[.)]?\s*[-–—]?\s+(.+)$/;

  type Raw = { indent: number; title: string; explicitCode: string | null; numero: number; original: string };
  const raws: Raw[] = rawLines.map(({ linha, numero }) => {
    const indent = linha.length - linha.trimStart().length;
    let body = linha.trim();
    let explicitCode: string | null = null;
    const m = body.match(numRe);
    if (m) { explicitCode = m[1]; body = m[2].trim(); }
    // remove marcadores de bullet no início
    body = body.replace(/^[•\-–—*•]+\s*/, "").trim();
    return { indent, title: body, explicitCode, numero, original: linha.trim() };
  }).filter((r) => {
    if (r.title.length > 0) return true;
    // Sobrou só o código, ou só um bullet: não há o que nomear.
    descartadas.push({ numero: r.numero, texto: r.original, motivo: "sem-titulo" });
    return false;
  });

  // Decide o modo pelo que REALMENTE foi extraído, não por um segundo teste
  // sobre o texto cru. E o critério é "existe hierarquia numérica de verdade"
  // (algum código com ponto), não uma maioria de 60%: uma EAP numerada colada
  // junto com linhas de observação caía no modo indentação e, sem recuo no
  // texto, virava uma lista plana — todos os itens irmãos na raiz, com a
  // numeração original descartada e recriada como 1,2,3… Era o defeito que
  // achatava a estrutura inteira na importação.
  const withCode = raws.filter((r) => r.explicitCode);
  const useNumbered =
    withCode.length > 0 &&
    withCode.some((r) => r.explicitCode!.includes(".")) &&
    withCode.length >= Math.ceil(raws.length * 0.3);

  const nodes: TreeNode[] = [];

  if (useNumbered) {
    // Modo código: a profundidade vem do número de segmentos do código.
    // Linha sem código é continuação do título anterior (título que quebrou em
    // duas linhas ao ser colado). Antes ela era simplesmente descartada e o
    // texto sumia da importação sem aviso.
    for (const r of raws) {
      if (!r.explicitCode) {
        const prev = nodes[nodes.length - 1];
        // SÓ ANEXA O QUE PARECE SOBRA. Antes juntava qualquer linha sem código
        // ao título de cima: "Marco M1 — TAP aprovado" virou parte de
        // "1.1.1.11 Aprovar TAP", e a palavra "Marco" no título resultante
        // ainda transformou a atividade em Marco. Ver `pareceContinuacao`.
        if (prev && pareceContinuacao(r.title)) {
          prev.title = `${prev.title} ${r.title}`.trim();
          // ANEXADA não é perda: o texto entrou no item de cima. Registrada
          // como informação, não como alerta — antes ela inflava o contador de
          // "não reconhecidas" e assustava sem ter havido perda nenhuma.
          descartadas.push({
            numero: r.numero, texto: r.title, motivo: "anexada",
            anexadaEm: `${prev.code} ${prev.title}`.trim(),
          });
        } else if (prev) {
          /**
           * O vizinho de cima AGRUPA? Decide a âncora, logo abaixo.
           *
           * Agrupa quem tem alguma linha posterior cujo código começa com o
           * dele mais um ponto — "1.1" agrupa porque existe "1.1.1". É a mesma
           * leitura que o resto do parser faz da numeração, sem depender de
           * flag nenhuma no texto colado.
           */
          const prevAgrupa = !!prev.code && raws.some(
            (o) => o.explicitCode && o.explicitCode.startsWith(`${prev.code}.`),
          );
          // LINHA COMPLETA SEM NUMERAÇÃO: entra ONDE FOI COLADA, sem código.
          //
          // Marco se escreve assim — "Marco M1 — TAP aprovado" solto entre as
          // atividades, sem numeração própria. É o formato de EAP real, não um
          // descuido: o marco não é uma etapa do trabalho, é um ponto de
          // controle, e por isso não recebe posição na numeração.
          //
          // `wbs_code` não é obrigatório no banco, então ele pode existir sem
          // código. O que importa é o PAI — ele pende de onde estava no texto,
          // que é o mesmo pai do item logo acima.
          //
          // `codigoExplicito: false` faz a palavra "Marco" no título vencer a
          // posição em eapRoleForImport — é assim que ele vira Marco de fato.
          nodes.push({
            code: "",              // sem código: o marco não entra na numeração
            title: r.title,
            depth: prev.depth,     // mesmo nível do irmão de cima
            role: "atividade",     // aplicarPapeis decide; o título declara marco
            /**
             * A ÂNCORA É O VIZINHO DE CIMA, não o pai dele.
             *
             * Herdar `prev.parentCode` funciona quando o vizinho é uma folha
             * ("1.1.3 Tasy Native" → âncora "1.1", a fase certa). Mas quando o
             * vizinho é um AGRUPADOR — o "1 PROJETO" no topo do texto, ou uma
             * fase —, o `parentCode` dele é o nível de cima ou `null`, e a
             * fase se perde: `findPhaseId` recebe string vazia e devolve null.
             *
             * Foi o que aconteceu na Revitalização Tasy: dos 4 marcos colados,
             * só o Milestone 6 ficou com fase. Os outros três, colados logo
             * abaixo de agrupadores, nasceram em "Sem fase".
             *
             * Quando o vizinho tem código próprio E agrupa, é DENTRO dele que
             * o marco foi colado — então o código dele é a âncora. Senão,
             * mantém o `parentCode`, que é o comportamento que já funcionava.
             */
            /**
             * A ÂNCORA DEPENDE DO QUE É O VIZINHO DE CIMA.
             *
             * Se ele AGRUPA — uma fase, uma entrega, o "1 PROJETO" —, a linha
             * foi colada DENTRO dele, e a âncora é o código DELE. Herdar o
             * `parentCode` mandaria o marco para o nível de cima: colado sob a
             * fase "1.1", ele procuraria a fase "1", que não existe, e nascia
             * sem fase nenhuma.
             *
             * Se o vizinho é uma FOLHA ("1.1.3 Tasy Native"), o marco é irmão
             * dele, e a âncora é o pai — `parentCode`, como antes.
             *
             * Medido na Revitalização Tasy: dos 4 marcos, só o Milestone 6
             * ficou com fase; os outros três estavam colados logo abaixo de uma
             * fase e caíram em "Sem fase".
             *
             * `prev.code` sem `parentCode` cobre o vizinho sem código (marco
             * abaixo de marco): aí a âncora do primeiro já foi resolvida e vale
             * para o segundo.
             */
            parentCode: prevAgrupa
              ? (prev.code || prev.parentCode || null)
              : (prev.parentCode ?? prev.code ?? null),
            codigoExplicito: false,
            ordemNoTexto: r.numero, // preserva o lugar na ordenação por código
          });
          // Registrada como INFORMAÇÃO: entrou na EAP, só não tem código.
          descartadas.push({
            numero: r.numero, texto: r.title, motivo: "numerada",
            anexadaEm: prev.parentCode || "raiz",
          });
        } else {
          // Sem item anterior não há posição de onde deduzir — aí fica de fora
          // mesmo, registrada com o número da linha para achar e corrigir.
          descartadas.push({ numero: r.numero, texto: r.title, motivo: "sem-codigo" });
        }
        continue;
      }
      // Zeros à direita são decorativos: "1.0" é nível 1, não 2. Formato comum
      // em EAP exportada de planilha — sem isso a fase do topo virava atividade
      // e os filhos ficavam sem pai.
      const parts = r.explicitCode.split(".");
      while (parts.length > 1 && parts[parts.length - 1] === "0") parts.pop();
      const code = parts.join(".");
      const depth = parts.length;
      const parentCode = depth > 1 ? parts.slice(0, depth - 1).join(".") : null;
      nodes.push({ code, title: r.title, depth, role: "atividade", parentCode });
    }

    // Pai ausente (colaram só um ramo, ex.: começa em 2.3.1 sem 2.3): cria o
    // ancestral que falta para segurar os filhos, senão o item nasce solto na
    // raiz e a hierarquia se perde. Título provisório, para renomear depois.
    const existing = new Set(nodes.map((n) => n.code));
    const missing: TreeNode[] = [];
    for (const n of nodes) {
      let code = n.parentCode;
      while (code && !existing.has(code) && !missing.some((m) => m.code === code)) {
        const parts = code.split(".");
        missing.push({
          code,
          title: `(sem título) ${code}`,
          depth: parts.length,
          role: "fase",
          parentCode: parts.length > 1 ? parts.slice(0, -1).join(".") : null,
        });
        code = parts.length > 1 ? parts.slice(0, -1).join(".") : null;
      }
    }
    nodes.push(...missing);
    // Reordena por código para a árvore sair na ordem natural da EAP.
    //
    // ITEM SEM CÓDIGO (marco solto) usa a chave do IRMÃO DE CIMA com um sufixo:
    // ordenar "" pelo `localeCompare` o jogaria para o começo da lista, longe
    // de onde foi escrito. Com a chave do vizinho + "~" (que vem depois de
    // qualquer dígito), ele fica exatamente na linha em que foi colado.
    const chaveDeOrdem = new Map<TreeNode, string>();
    let ultimaChave = "";
    for (const n of nodes) {
      if (n.code) { ultimaChave = n.code; chaveDeOrdem.set(n, n.code); }
      else chaveDeOrdem.set(n, `${ultimaChave}~${n.ordemNoTexto ?? 0}`);
    }
    nodes.sort((a, b) =>
      (chaveDeOrdem.get(a) ?? "").localeCompare(chaveDeOrdem.get(b) ?? "", undefined, { numeric: true }));
  } else {
    // Modo indentação/bullets: a profundidade vem do recuo. Gera códigos.
    // Pilha de ancestrais: cada nível guarda { indent, count, code }.
    // count = quantos filhos diretos já saíram naquele ancestral.
    type Level = { indent: number; count: number; code: string };
    const stack: Level[] = [];

    for (const r of raws) {
      // Sobe (dedent) enquanto a indentação atual for MENOR OU IGUAL à do topo,
      // exceto quando a pilha está vazia. Assim itens no mesmo recuo são irmãos.
      while (stack.length > 0 && r.indent <= stack[stack.length - 1].indent) {
        stack.pop();
      }
      const parent = stack[stack.length - 1] || null;
      const parentCode = parent ? parent.code : null;
      // incrementa o contador de filhos do pai (ou raiz)
      if (parent) parent.count += 1;
      else {
        // nível raiz: usa um contador virtual na base da pilha
        // (representado por um Level "sentinela" com indent -1)
      }
      // contador do próprio nível: precisamos de um contador por PAI.
      // Reusa o count do pai como índice; para a raiz, conta itens de topo.
      const siblingIndex = parent ? parent.count : (nodes.filter((n) => n.parentCode === null).length + 1);
      // ITEM DE TOPO PENDE DA RAIZ, não É a raiz.
      //
      // Sem código explícito o parser inventa a numeração, e antes o primeiro
      // item virava "1" — que é o nível do PROJETO. Digitar uma linha solta
      // ("Marco M2 — Kick-off realizado") produzia um item rotulado Projeto na
      // prévia: absurdo, porque o projeto é a raiz virtual e não é algo que se
      // cria colando uma linha.
      //
      // `eapRootCode()` devolve "1" na convenção atual, então o topo nasce em
      // 1.1, 1.2, 1.3 — Fases, que é o que uma lista sem numeração descreve.
      const raiz = eapRootCode();
      const code = parentCode
        ? `${parentCode}.${siblingIndex}`
        : raiz ? `${raiz}.${siblingIndex}` : String(siblingIndex);
      const level = code.split(".").length;
      nodes.push({ code, title: r.title, depth: level, role: "atividade", parentCode, codigoExplicito: false });
      // empilha este item como possível ancestral dos próximos mais indentados
      stack.push({ indent: r.indent, count: 0, code });
    }
  }

  // 2) Resolve o PAPEL EAP pelo NÍVEL (mesma regra de lib/eapModel):
  //    nível 1 (1, 2, 3…)  = Fase/Entrega
  //    nível 2+ (1.1, …)   = Atividade — mesmo que agrupe
  //    marco vence quando o título indica
  //
  // Antes o papel vinha da função ("tem filho → Fase"), o que fazia
  // "1 / 1.1 / 1.1.1" virar Fase, Fase, Atividade. A leitura da EAP é
  // "1. Fase / 1.1 Entrega / 1.1.1 Atividade": o nível é que decide.
  aplicarPapeis(nodes);

  return { nodes, descartadas };
};

export const ImportWBSDialog = ({ projectId, onDataChanged }: ImportWBSDialogProps) => {
  const { toast } = useToast();
  const appConfirm = useAppConfirm();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  /** Para o clique numa linha descartada rolar o campo até ela. */
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [importing, setImporting] = useState(false);
  /** Selo clicado no rodapé: recorta a prévia por papel. Null = mostra tudo.
   *  Só afeta o que se VÊ — a importação leva a árvore inteira. */
  const [filtroPapel, setFiltroPapel] = useState<EapRole | null>(null);

  /**
   * Fases que JÁ EXISTEM no projeto, indexadas pelo código EAP.
   *
   * A prévia mostrava "(sem título) 1" quando o texto colado começava em "1.2":
   * o parser inventa o ancestral que falta para a árvore não ficar quebrada.
   * Só que se a fase 1 já existe no projeto, ela NÃO será criada — a
   * importação a reaproveita. A prévia prometia uma fase nova que não vem.
   *
   * Mesma leitura que a importação faz na gravação, aqui só para a prévia
   * dizer a verdade.
   */
  const [fasesExistentes, setFasesExistentes] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!open || !projectId) return;
    let cancelado = false;
    void supabase
      .from("phases")
      .select("id, title")
      .eq("project_id", projectId)
      .eq("is_trashed", false)
      .then(({ data, error }) => {
        if (cancelado || error) return;
        const m = new Map<string, string>();
        for (const f of ((data as any[]) || [])) {
          // Código do prefixo do título ("1 Iniciação" → "1"). `wbs_code` não
          // é lido aqui de propósito: a coluna não existe em toda base, e um
          // select que falha derrubaria a prévia inteira por um enfeite.
          const cod = String(f.title || "").match(/^\s*(\d+(?:\.\d+)*)\b/)?.[1];
          if (!cod) continue;
          const partes = cod.split(".");
          while (partes.length > 1 && partes[partes.length - 1] === "0") partes.pop();
          const chave = partes.join(".");
          if (!m.has(chave)) m.set(chave, String(f.title || ""));
        }
        setFasesExistentes(m);
      });
    return () => { cancelado = true; };
  }, [open, projectId]);

  /** Título da fase existente para este código, se houver. */
  const faseExistente = (code: string): string | null => {
    const partes = code.split(".");
    while (partes.length > 1 && partes[partes.length - 1] === "0") partes.pop();
    return fasesExistentes.get(partes.join(".")) ?? null;
  };

  /**
   * ATIVIDADES que já ocupam um código EAP no projeto.
   *
   * As FASES já eram reaproveitadas (`phaseIdMap`, na gravação), mas as
   * atividades não: colar a mesma EAP duas vezes criava um jogo novo inteiro,
   * em silêncio. Foi assim que um projeto chegou a 653 atividades com 243
   * cópias — seis "Revisar TAP" com o mesmo 1.1.10, e mover uma não mexia nas
   * outras cinco.
   *
   * O código EAP é um endereço: duas coisas não moram no mesmo número. Quando
   * ele já está ocupado, a importação avisa e a pessoa decide — não inventa
   * uma segunda linha com o mesmo endereço.
   */
  const [codigosOcupados, setCodigosOcupados] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!open || !projectId) return;
    let cancelado = false;
    void supabase
      .from("activities")
      .select("title, wbs_code")
      .eq("project_id", projectId)
      .eq("is_trashed", false)
      .not("wbs_code", "is", null)
      .then(({ data, error }) => {
        if (cancelado || error) return;
        const m = new Map<string, string>();
        for (const a of ((data as { title?: string; wbs_code?: string }[]) || [])) {
          const cod = (a.wbs_code || "").trim();
          if (!cod) continue;
          const partes = cod.split(".");
          while (partes.length > 1 && partes[partes.length - 1] === "0") partes.pop();
          const chave = partes.join(".");
          if (!m.has(chave)) m.set(chave, String(a.title || ""));
        }
        setCodigosOcupados(m);
      });
    return () => { cancelado = true; };
  }, [open, projectId]);

  /** Título da atividade que já ocupa este código, se houver. */
  const codigoOcupado = (code: string): string | null => {
    if (!code) return null;
    const partes = code.split(".");
    while (partes.length > 1 && partes[partes.length - 1] === "0") partes.pop();
    return codigosOcupados.get(partes.join(".")) ?? null;
  };

  const parsed = useMemo(() => parseFlexible(text), [text]);
  const tree = parsed.nodes;
  const counts = useMemo(() => {
    const c = { fase: 0, entrega: 0, atividade: 0, marco: 0 };
    tree.forEach((n) => { c[n.role]++; });
    return c;
  }, [tree]);

  /**
   * Ancestrais inventados pelo parser que NÃO serão criados, porque a fase já
   * existe no projeto. Contados à parte para o rodapé não prometer itens novos
   * que a importação vai apenas reaproveitar.
   */
  const reaproveitados = useMemo(
    () => tree.filter((n) => n.title.startsWith("(sem título)") && faseExistente(n.code)).length,
    [tree, fasesExistentes],
  );

  /**
   * Linhas coladas que NÃO viraram item, com número e motivo.
   *
   * Antes isto era uma SUBTRAÇÃO (coladas − reconhecidas) e por isso o aviso
   * dizia "1 linha" sem poder dizer QUAL: não havia lista, só um número. Agora
   * o parser registra cada descarte e a prévia mostra a linha, o texto e o
   * porquê — cada motivo pede uma correção diferente.
   *
   * DOIS motivos ficam FORA do alerta porque não houve perda:
   *   `anexada`  — o texto entrou no item anterior (título quebrado ao colar)
   *   `numerada` — a linha virou item, com código deduzido da posição
   *
   * Os dois entravam no contador antigo e assustavam à toa. Continuam na lista,
   * em tom neutro: são informação de "o que o parser decidiu por você", não
   * aviso de perda.
   */
  const linhasPerdidas = useMemo(
    () => parsed.descartadas.filter((d) => !MOTIVOS_SEM_PERDA.has(d.motivo)),
    [parsed.descartadas],
  );
  const linhasAnexadas = useMemo(
    () => parsed.descartadas.filter((d) => MOTIVOS_SEM_PERDA.has(d.motivo)),
    [parsed.descartadas],
  );
  const [detalheAberto, setDetalheAberto] = useState(false);

  /**
   * Quantas linhas foram coladas — descontando as vazias, que ninguém conta
   * como conteúdo. É o número que a pessoa confere contra a origem ("a planilha
   * tinha 20 tarefas").
   */
  const totalLinhasColadas = useMemo(
    () => text.split("\n").filter((l) => l.trim().length > 0).length,
    [text],
  );

  /**
   * Itens que o parser INVENTOU para segurar a hierarquia — o "1" criado quando
   * o texto começa em "1.2". Eles não vieram de linha nenhuma, então sem
   * separá-los a conta "20 linhas → 23 itens" pareceria defeito.
   */
  const totalInventados = useMemo(
    () => tree.filter((n) => n.title.startsWith("(sem título)")).length,
    [tree],
  );

  /**
   * Os códigos deste texto que JÁ EXISTEM no projeto.
   *
   * Marco fica de fora (não tem código, nunca colide) e ancestral inventado
   * também: o "1" criado para segurar a árvore é justamente o caso em que
   * reaproveitar a fase existente é o comportamento certo — e já é o que a
   * gravação faz.
   */
  const codigosEmConflito = useMemo(
    () =>
      tree
        .filter((n) => n.code && !n.title.startsWith("(sem título)"))
        .map((n) => ({ code: n.code, novo: n.title, existente: codigoOcupado(n.code) }))
        .filter((x): x is { code: string; novo: string; existente: string } => x.existente !== null),
    // `codigosOcupados` entra pela função; sem ele na lista o aviso ficaria
    // congelado no primeiro render, antes de a consulta responder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree, codigosOcupados],
  );

  /**
   * Rola o campo de texto até a linha e a seleciona.
   *
   * Corrigir acontece onde o texto está — mandar a pessoa procurar a linha 7 à
   * mão, num campo com 80 linhas, seria devolver o mesmo trabalho que o aviso
   * deveria poupar.
   */
  const irParaLinha = (numero: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const linhas = ta.value.split("\n");
    const inicio = linhas.slice(0, numero - 1).reduce((n, l) => n + l.length + 1, 0);
    const fim = inicio + (linhas[numero - 1]?.length ?? 0);
    ta.focus();
    ta.setSelectionRange(inicio, fim);
    // Aproxima a linha do meio do campo: `scrollTop` direto colocaria ela na
    // primeira posição visível, sem contexto em volta.
    const alturaLinha = ta.scrollHeight / Math.max(1, linhas.length);
    ta.scrollTop = Math.max(0, (numero - 1) * alturaLinha - ta.clientHeight / 2);
  };

  const resetAndClose = () => { setText(""); setFiltroPapel(null); setOpen(false); };


  const handleImport = async () => {
    if (tree.length === 0) return;

    /**
     * CÓDIGO JÁ OCUPADO: bloqueia antes de duplicar.
     *
     * Sem isto, colar a mesma EAP de novo criava um jogo inteiro de cópias em
     * silêncio — mesmo código, mesmo título, linhas diferentes. Um projeto
     * chegou a 653 atividades com 243 cópias assim, e o efeito na tela era
     * "movi a tarefa e ela continua no Backlog": havia seis dela.
     *
     * Não é uma trava absoluta. Reimportar de propósito (para corrigir títulos,
     * por exemplo) é legítimo, e "Importar mesmo assim" continua ali — mas
     * agora é uma escolha, com o número na frente.
     */
    if (codigosEmConflito.length > 0) {
      const n = codigosEmConflito.length;
      const amostra = codigosEmConflito
        .slice(0, 3)
        .map((c) => `${c.code} ("${c.existente}")`)
        .join(", ");
      const resto = n > 3 ? ` e mais ${n - 3}` : "";
      const ok = await appConfirm({
        title: n === 1
          ? "Este código EAP já existe no projeto"
          : `${n} códigos EAP já existem no projeto`,
        description:
          `${amostra}${resto}. ` +
          "O código é o endereço do item na EAP — importar de novo cria uma " +
          "segunda linha no mesmo endereço, e depois não há como saber qual é " +
          "a boa. Se quer corrigir o que já existe, edite no Backlog; se é " +
          "conteúdo novo, renumere antes de colar.",
        confirmText: "Importar mesmo assim (duplica)",
        cancelText: "Voltar",
        destructive: true,
      });
      if (!ok) return;
    }

    // PERDA SILENCIOSA, NÃO. O aviso dizia "1 linha não reconhecida", mas nada
    // impedia clicar em Importar e a linha sumir sem que ninguém percebesse —
    // era o caso do "Marco M1 — TAP aprovado", que ficava de fora da EAP e só
    // se descobria depois, conferindo o Backlog contra o texto original.
    //
    // Só as PERDAS confirmam: linha juntada ao item anterior não entra aqui,
    // porque o texto dela foi importado.
    if (linhasPerdidas.length > 0) {
      const n = linhasPerdidas.length;
      // O diálogo de confirmação renderiza a descrição num parágrafo só (sem
      // preservar quebras), então a amostra vai em linha corrida.
      const amostra = linhasPerdidas
        .slice(0, 3)
        .map((d) => `linha ${d.numero} ("${d.texto}")`)
        .join(", ");
      const resto = n > 3 ? ` e mais ${n - 3}` : "";
      const ok = await appConfirm({
        title: n === 1 ? "Uma linha vai ficar de fora" : `${n} linhas vão ficar de fora`,
        description:
          `${amostra}${resto}. ` +
          (n === 1 ? "Ela não tem" : "Elas não têm") +
          " código EAP, então não há como saber onde entra" + (n === 1 ? "" : "m") +
          " na estrutura. Para incluir, volte e dê um código a cada uma (ex.: 1.2.3).",
        confirmText: "Importar assim mesmo",
        cancelText: "Voltar e corrigir",
      });
      if (!ok) {
        // Abre a lista: quem escolheu corrigir precisa VER quais são, sem ter
        // de procurar o selo depois de fechar o aviso.
        setDetalheAberto(true);
        return;
      }
    }

    setImporting(true);
    try {
      // A LINHA DO PROJETO NÃO É IMPORTADA. O nível 1 é o projeto, que já
      // existe na tabela `projects` — criar uma atividade para ele produziria um
      // item sem responsável, sem horas e que nunca conclui, duplicando o que o
      // projeto já é. Colar uma EAP que começa em "1. NOME DO PROJETO" agora
      // ignora essa linha em vez de virá-la uma fase.
      const importaveis = tree.filter((n) => n.role !== "projeto");

      // O agrupador no nível da Fase vai para a tabela `phases`; todo o resto
      // vira linha em `activities`.
      /**
       * FASE PRECISA DE CÓDIGO PRÓPRIO.
       *
       * `eapIsFaseLevel(n.depth)` sozinho não basta: uma linha SEM numeração
       * herda o `depth` do vizinho de cima, e se esse vizinho é uma fase (ou um
       * marco colado sob ela), a linha herda depth 2 — o nível da fase — e ia
       * parar na tabela `phases`.
       *
       * Foi o que aconteceu com "Inicio do teste Piloto", uma linha solta entre
       * a fase 1.4 e o item 1.4.1: virou uma quinta fase, com o espaço do
       * título e tudo. Fase é estrutura da EAP e tem numeração; o que não tem
       * número é conteúdo, e conteúdo vive em `activities`.
       */
      const ehFase = (n: TreeNode) =>
        n.role === "fase" && eapIsFaseLevel(n.depth) && !!n.code;
      const phases = importaveis.filter(ehFase);
      const nonPhase = importaveis.filter((n) => !ehFase(n));

      const { data: existingPhases } = await supabase
        .from("phases").select("display_order")
        .eq("project_id", projectId).order("display_order", { ascending: false }).limit(1);
      let phaseOrder = (existingPhases?.[0]?.display_order ?? 0) + 1;

      const { data: stagesData } = await supabase
        .from("workflow_stages").select("id, display_order, is_visible, categoria, is_entry_point")
        .eq("project_id", projectId).order("display_order", { ascending: true });
      /**
       * O ITEM IMPORTADO NASCE NO BACKLOG.
       *
       * Eu havia mudado isto para a primeira coluna VISÍVEL, lendo o sintoma
       * ("o Kanban abre vazio") como se o destino estivesse errado. Estava
       * invertido: o Backlog é EXATAMENTE onde a EAP recém-importada deve
       * ficar. Ela é planejamento — 134 itens que ninguém começou —, e despejar
       * isso no quadro entope as colunas com trabalho que não está em curso.
       *
       * "Backlog é backlog, onde ficam as atividades para depois trazer para o
       * kanban. A entrada seria determinada pelo usuário quando trouxer do
       * backlog para o kanban." É a regra, e ela é do produto, não do código:
       * o Kanban mede fluxo, a fila mede intenção.
       *
       * A coluna de backlog é a de `categoria = 'backlog'`; `display_order = 0`
       * é o fallback para as bases onde a categoria ainda não foi preenchida.
       * Se o projeto não tiver backlog nenhum, cai na primeira coluna — nascer
       * em algum lugar é melhor que nascer em lugar nenhum.
       */
      const backlogStageId =
        stagesData.find((s) => String(s.categoria) === "backlog")?.id
        ?? stagesData.find((s) => s.display_order === 0)?.id
        ?? stagesData[0]?.id
        ?? null;
      // Item com data real vai direto para a coluna certa: quem já terminou não
      // deve nascer no Backlog. `is_final` marca a coluna de conclusão; a de
      // andamento é a do meio (display_order 2 no fluxo padrão).
      const finalStageId = (stagesData as any[])?.find((s) => s.is_final)?.id
        ?? (stagesData as any[])?.slice(-1)[0]?.id ?? null;
      const emAndamentoStageId = (stagesData as any[])?.find((s) => s.display_order === 2)?.id ?? null;

      // Responsável: casa por nome ou e-mail, tolerante a acento e caixa — os
      // campos de pessoa no sistema são texto livre, não FK.
      const normPessoa = (s: string) =>
        s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
      const { data: perfis } = await supabase
        .from("profiles").select("full_name, email").eq("is_active", true);
      const pessoaPorNome = new Map<string, string>();
      for (const p of (perfis as any[]) || []) {
        if (p.full_name) pessoaPorNome.set(normPessoa(p.full_name), p.full_name);
        if (p.email) pessoaPorNome.set(normPessoa(p.email), p.full_name || p.email);
      }
      // Nomes da planilha sem conta no sistema: importa sem responsável e avisa
      // no fim, em vez de travar a importação inteira por causa de um nome.
      const naoEncontrados = new Set<string>();

      // `phases` NÃO tem wbs_code em todos os ambientes — só `activities` tem.
      // Gravar a coluna direto quebrava a importação inteira na primeira fase
      // ("Could not find the 'wbs_code' column of 'phases'"), sem criar nada.
      // Detecta uma vez e reusa: se a coluna não existe, o código volta para o
      // título, que é onde ele aparece hoje nessas bases.
      let phasesHasWbs = true;
      // Idem para as datas: a migration que as cria pode não ter rodado ainda.
      let phasesHasDates = true;
      // Colunas que o banco não tinha e foram descartadas para a importação
      // seguir. Avisadas no fim: silenciar faria o item nascer sem o campo sem
      // ninguém saber (ex.: sem código EAP, que define o papel Fase/Atividade).
      const droppedCols = new Set<string>();

      /**
       * FASES QUE JÁ EXISTEM no projeto, indexadas pelo código EAP.
       *
       * O mapa era montado só com as fases criadas NESTA importação. Importar
       * a fase 1 com os itens 1.1 e 1.2 e depois importar só o 1.3 deixava o
       * mapa vazio: o 1.3 não achava a fase 1 e nascia SEM FASE, solto no topo.
       * Medido em 11/08: 14 itens já estão assim no banco.
       *
       * O código vem de `wbs_code` quando a coluna existe; senão, do prefixo do
       * título ("1 Iniciação" → "1"), que é onde ele aparece nas bases sem a
       * migration. Sem esse fallback, a correção não valeria justamente nos
       * ambientes onde o problema é mais provável.
       */
      const phaseIdMap: Record<string, string> = {};
      {
        /**
         * O SELECT PEDIA UMA COLUNA QUE `phases` NÃO TEM.
         *
         * `wbs_code` existe em `activities`, não em `phases` — o próprio
         * arquivo já registra isso algumas linhas acima ("phases NÃO tem
         * wbs_code em todos os ambientes"), e mesmo assim o select o pedia.
         * O PostgREST recusa a consulta INTEIRA nesse caso
         * ("column phases.wbs_code does not exist"), e o erro era descartado:
         * `jaExistem` ficava vazio, o mapa nunca se populava e NENHUMA fase
         * era reaproveitada.
         *
         * Efeito: toda importação recriava as fases do projeto. A Revitalização
         * Tasy tem 17 fases cadastradas, 13 delas vazias — duplicatas de
         * importações sucessivas, inclusive quatro criadas e abandonadas na
         * mesma execução de hoje.
         *
         * O código sempre veio do prefixo do título ("1.1 Fase de…" → "1.1"),
         * que é como ele aparece nessas bases. Pedir a coluna não acrescentava
         * nada e derrubava o resto.
         */
        const { data: jaExistem, error: erroFases } = await supabase
          .from("phases")
          .select("id, title")
          .eq("project_id", projectId)
          .eq("is_trashed", false);

        if (erroFases) {
          // Sem o mapa, a importação duplicaria as fases em silêncio. Melhor
          // dizer que vai acontecer do que descobrir depois no Backlog.
          droppedCols.add("reaproveitamento de fases existentes");
        }

        for (const f of ((jaExistem as any[]) || [])) {
          const codigo =
            // Prefixo numérico do título: "1 Iniciação", "1. Iniciação",
            // "1.0 — Fundação". Sem match, a fase fica fora do mapa e o
            // comportamento é o de antes — nunca pior.
            (String(f.title || "").match(/^\s*(\d+(?:\.\d+)*)\b/)?.[1] ?? "");
          if (!codigo) continue;
          // Normaliza zeros decorativos: "1.0" e "1" são a mesma fase, e a
          // planilha varia entre os dois formatos.
          const partes = codigo.split(".");
          while (partes.length > 1 && partes[partes.length - 1] === "0") partes.pop();
          const chave = partes.join(".");
          // Primeira vence: se houver duas fases com o mesmo código (dado
          // antigo), reaproveitar sempre a mesma é melhor que alternar.
          if (!phaseIdMap[chave]) phaseIdMap[chave] = f.id;
        }
      }

      for (const phase of phases) {
        // A planilha trouxe uma fase que JÁ EXISTE: reaproveita em vez de criar
        // uma segunda com o mesmo código. Sem isto, reimportar a fase 1 para
        // acrescentar um item duplicava a fase e dividia a EAP em duas.
        const chaveExistente = (() => {
          const partes = phase.code.split(".");
          while (partes.length > 1 && partes[partes.length - 1] === "0") partes.pop();
          return partes.join(".");
        })();
        if (phaseIdMap[chaveExistente]) {
          phaseIdMap[phase.code] = phaseIdMap[chaveExistente];
          continue;
        }

        const base: Record<string, any> = {
          project_id: projectId,
          // Título limpo quando há wbs_code: o código vive na coluna própria.
          // Concatenar os dois gravava a numeração dentro do texto, e renumerar
          // a EAP exigiria reescrever o título de cada item à mão.
          title: phasesHasWbs ? phase.title : `${phase.code} ${phase.title}`,
          display_order: phaseOrder++,
        };
        if (phasesHasWbs) base.wbs_code = phase.code;
        // Datas da linha da fase, quando a planilha as traz. É dado diferente
        // da soma dos filhos: esta é a data PLANEJADA para a fase, e a
        // divergência entre as duas é justamente o que interessa ver.
        if (phasesHasDates && phase.vals) {
          const v = phase.vals;
          if (v.start_date) base.start_date = v.start_date;
          if (v.end_date) base.end_date = v.end_date;
          if (v.actual_start_date) base.actual_start_date = v.actual_start_date;
          if (v.actual_end_date) base.actual_end_date = v.actual_end_date;
        }

        let res = await supabase.from("phases").insert(base as any).select("id").single();
        if (res.error && /wbs_code/i.test(res.error.message)) {
          phasesHasWbs = false;
          delete base.wbs_code;
          base.title = `${phase.code} ${phase.title}`;
          res = await supabase.from("phases").insert(base as any).select("id").single();
        }
        // Datas ausentes em phases: descarta as quatro de uma vez (vêm da mesma
        // migration) e segue — a fase sem data ainda é melhor que nenhuma fase.
        if (res.error && /(start_date|end_date)/i.test(res.error.message)) {
          phasesHasDates = false;
          for (const c of ["start_date", "end_date", "actual_start_date", "actual_end_date"]) delete base[c];
          droppedCols.add("datas da fase");
          res = await supabase.from("phases").insert(base as any).select("id").single();
        }
        if (res.error) throw res.error;
        phaseIdMap[phase.code] = res.data.id;
      }

      const codeIdMap: Record<string, string> = {};
      const phaseOrderCounter: Record<string, number> = {};
      /**
       * A fase de um item é a do ancestral mais próximo que exista no mapa.
       *
       * O mapa agora inclui as fases JÁ EXISTENTES no projeto (ver acima), não
       * só as criadas nesta importação — é o que faz "1.3" achar a fase 1
       * quando ela veio de uma importação anterior.
       *
       * Testa o próprio código também (`len = parts.length`): uma fase pode ser
       * importada junto com seus filhos, e o item "1" precisa achar a fase "1".
       */
      const findPhaseId = (node: TreeNode): string | null => {
        // MARCO NÃO TEM CÓDIGO (`code: ""`), e `"".split(".")` devolve [""] —
        // que não casa com fase nenhuma. O marco nascia SEM FASE, solto no
        // Backlog, embora tivesse sido colado dentro de uma.
        //
        // A fase dele é a do PAI: é de lá que ele pende, e `parentCode` já
        // guarda essa posição (ver a montagem do nó, onde ele herda o
        // `parentCode` do irmão de cima). O código não entra na EAP; a
        // ancoragem, sim.
        const referencia = node.code || node.parentCode || "";
        if (!referencia) return null;
        const parts = referencia.split(".");
        for (let len = parts.length; len >= 1; len--) {
          const ancestor = parts.slice(0, len).join(".");
          if (phaseIdMap[ancestor]) return phaseIdMap[ancestor];
          // Zeros decorativos: "1.0" no mapa é a mesma fase que "1".
          const semZeros = [...parts.slice(0, len)];
          while (semZeros.length > 1 && semZeros[semZeros.length - 1] === "0") semZeros.pop();
          const chave = semZeros.join(".");
          if (chave !== ancestor && phaseIdMap[chave]) return phaseIdMap[chave];
        }
        return null;
      };

      let pacoteUnsupported = false;
      // Ordena por código para inserir pais antes dos filhos.
      const ordered = [...nonPhase].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
      for (const node of ordered) {
        const phaseId = findPhaseId(node);
        const parentId = node.parentCode ? codeIdMap[node.parentCode] || null : null;
        const phaseKey = phaseId || "__none__";
        if (!(phaseKey in phaseOrderCounter)) phaseOrderCounter[phaseKey] = 0;

        // eapToPersisted é a fonte do que vai ao banco. Fase e Entrega gravam
        // igual — os dois agrupam, e o trigger só aceita 'fase'/'pacote' como
        // pai; a diferença entre elas é o NÍVEL, lido do wbs_code na exibição.
        // A conversão era duplicada aqui, então uma mudança na regra canônica
        // não alcançava a importação.
        const persisted = eapToPersisted(node.role);
        const basePayload: any = {
          project_id: projectId,
          // Idem às fases: título limpo, código em wbs_code.
          title: node.title,
          phase_id: phaseId,
          parent_id: parentId,
          display_order: phaseOrderCounter[phaseKey]++,
          // O código colado POSICIONA o marco (é o que diz de quem ele pende),
          // mas não é gravado: marco é ponto no cronograma, não trabalho na
          // EAP. Sem isso ele consumiria um número e as atividades seguintes
          // ficariam com um vão na numeração.
          wbs_code: eapCodeToPersist(persisted, node.code),
          item_type: persisted.item_type,
          is_milestone: persisted.is_milestone,
          // Nasce no BACKLOG: EAP importada é planejamento, não trabalho em
          // curso. Quem decide o que entra no quadro é o usuário.
          workflow_stage_id: backlogStageId,
          status: "pending",
        };

        // Colunas da planilha. O status reflete as datas REAIS: importar um
        // histórico e ver tudo como "pendente" obrigaria a refazer o trabalho
        // à mão, item por item.
        const v = node.vals;
        if (v) {
          if (v.start_date) basePayload.start_date = v.start_date;
          if (v.end_date) basePayload.end_date = v.end_date;
          if (v.actual_start_date) basePayload.actual_start_date = v.actual_start_date;
          if (v.actual_end_date) basePayload.actual_end_date = v.actual_end_date;
          if (v.hours != null) basePayload.hours = v.hours;
          if (v.cost != null) basePayload.cost = v.cost;

          const st = statusPorDatas(v);
          basePayload.status = st;
          if (st === "completed") {
            basePayload.completed_at = `${v.actual_end_date}T12:00:00.000Z`;
            if (finalStageId) basePayload.workflow_stage_id = finalStageId;
          } else if (st === "in_progress" && emAndamentoStageId) {
            basePayload.workflow_stage_id = emAndamentoStageId;
          }

          // Responsável só entra se casar com alguém do sistema. Nome solto
          // viraria texto que nenhuma tela consegue resolver em pessoa.
          if (v.responsavel) {
            const achado = pessoaPorNome.get(normPessoa(v.responsavel));
            if (achado) basePayload.assigned_to = achado;
            else naoEncontrados.add(v.responsavel);
          }
        }

        let res = await supabase.from("activities").insert(basePayload).select("id").single();
        if (res.error && /item_type/i.test(res.error.message) && persisted.item_type === "fase") {
          pacoteUnsupported = true;
          res = await supabase.from("activities").insert({ ...basePayload, item_type: "atividade" }).select("id").single();
        }
        // Degrada por coluna ausente, como o AddProjectDialog já faz: melhor
        // criar o item sem um campo do que abortar no meio e deixar metade da
        // EAP no banco. A falha em `phases` acima mostrou que ambientes
        // divergem — aqui a proteção vale para qualquer coluna, não só uma.
        for (let i = 0; i < 6 && res.error; i++) {
          const miss = /Could not find the '([^']+)' column/.exec(res.error.message)?.[1];
          if (!miss || !(miss in basePayload)) break;
          delete basePayload[miss];
          droppedCols.add(miss);
          res = await supabase.from("activities").insert(basePayload).select("id").single();
        }
        if (res.error) throw res.error;
        codeIdMap[node.code] = res.data.id;
      }

      if (pacoteUnsupported) {
        toast({
          title: "Tipo 'Fase/Entrega' pendente no banco",
          description: "Os agrupadores aninhados viraram atividade (ainda agrupam por terem subitens). Aplique a migration de item_type na VM.",
        });
      }
      if (droppedCols.size > 0) {
        toast({
          title: "Importado sem alguns campos",
          description: `Este banco não tem: ${Array.from(droppedCols).join(", ")}. Os itens foram criados sem esses campos — aplique as migrations pendentes na VM e reimporte se precisar deles.`,
        });
      }
      if (naoEncontrados.size > 0) {
        toast({
          title: "Responsáveis não encontrados",
          description: `Sem conta no sistema: ${Array.from(naoEncontrados).slice(0, 6).join(", ")}${naoEncontrados.size > 6 ? ` e mais ${naoEncontrados.size - 6}` : ""}. Os itens foram criados sem responsável.`,
        });
      }
      if (!phasesHasWbs) {
        toast({
          title: "Código da EAP no título das fases",
          description: "A coluna wbs_code ainda não existe em 'phases' neste banco, então o código foi mantido no título (ex.: \"1 Planejamento\").",
        });
      }
      toast({
        title: "EAP importada!",
        description: `${counts.fase} fase(s), ${counts.entrega} entrega(s), ${counts.atividade} atividade(s) e ${counts.marco} marco(s) criados.`,
      });
      resetAndClose();
      onDataChanged();
    } catch (error: any) {
      console.error("Erro ao importar EAP:", error);
      // A inserção não é transacional: se falhar no meio, o que já entrou está
      // gravado. Atualizar mesmo no erro evita a tela mostrar um backlog vazio
      // enquanto o banco tem itens — antes o refetch só rodava no sucesso.
      onDataChanged();
      toast({
        title: "Erro ao importar EAP",
        description: `${error?.message || "Falha desconhecida."} Parte dos itens pode ter sido criada — confira o backlog antes de tentar de novo.`,
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  /**
   * Selo de contagem que FILTRA a prévia.
   *
   * Antes era texto: mostrava "4 entregas" e não havia como ver QUAIS. Numa EAP
   * de 38 itens, saber que existem 2 marcos sem poder achá-los na lista é
   * informação que não ajuda a conferir nada — e conferir é o que se faz nesta
   * tela antes de importar.
   */
  const CountBadge = ({ role, n }: { role: EapRole; n: number }) => {
    const ativo = filtroPapel === role;
    return (
      <button
        type="button"
        onClick={() => setFiltroPapel(ativo ? null : role)}
        title={ativo ? "Mostrar todos" : `Ver só ${ROLE_META[role].label.toLowerCase()}s`}
        className={cn(
          "inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full border transition-all",
          ROLE_META[role].cls,
          ativo ? "ring-2 ring-offset-1 ring-current" : "hover:brightness-95 opacity-90 hover:opacity-100",
        )}
      >
        {ROLE_META[role].icon} {n} {ROLE_META[role].label.toLowerCase()}{n === 1 ? "" : "s"}
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : resetAndClose())}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2 h-9">
          <Upload className="w-4 h-4" /> Importar EAP
        </Button>
      </DialogTrigger>
      {/* 6xl/90vh, não 4xl/82vh: são DUAS colunas de texto lado a lado, e uma
          EAP tem código longo ("1.1.2.4") junto de título comprido. No tamanho
          anterior sobravam ~170px por painel — cerca de 8 linhas, para uma EAP
          de 20 itens. Importadores são largos por natureza (Jira CSV, Asana):
          comparar "o que colei" com "o que vai entrar" exige os dois legíveis
          ao mesmo tempo. */}
      <DialogContent className="max-w-6xl w-[96vw] h-[90vh] overflow-hidden p-0 gap-0 flex flex-col">
        {/* Cabeçalho enxuto */}
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="text-base font-semibold">Importar EAP</DialogTitle>
          {/* UMA FRASE. Antes eram três blocos mais um aviso de Marco com três
              linhas, falando em "profundidade", "nível da Fase" e "a posição
              vence" — vocabulário de quem escreveu o parser, não de quem cola
              uma EAP. A regra saiu do texto e virou o de/para ao lado do campo,
              onde se lê comparando com o exemplo em vez de decorando. */}
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Cole a estrutura do seu projeto. De planilha, as colunas de data,
            horas e responsável são reconhecidas.
          </p>
        </DialogHeader>

        {/* SEM ABAS. Eram duas — "Colar texto" e "Usar modelo" — e a segunda
            saiu junto com os modelos: três EAPs genéricas que ocupavam metade
            do diálogo. Quem tem uma EAP cola a sua; quem não tem não adota a
            estrutura de um projeto alheio. Sobrou uma coisa a fazer, e uma
            coisa só não precisa de aba para ser escolhida. */}

        {/* Corpo: cresce e rola internamente; footer fica ancorado */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-t flex-1 min-h-0">
          {/* Entrada */}
          <div className="p-6 md:border-r flex flex-col min-h-0">
            {/* textarea nativa: o wrapper de UI força whiteSpace/overflowWrap
                inline e reajusta altura no onChange, o que atrapalhava a
                digitação e a colagem neste campo (monoespaçado, de muitas
                linhas, dentro de um flex com min-h-0).
                `h-full` explícito: com `flex-1 min-h-0` a altura colapsava a
                zero e o campo ficava sem área clicável. */}
            {/* A CONTAGEM FECHA A CONTA. O rodapé dizia quantos itens entram
                (1 fase, 15 atividades), mas nada ligava isso ao que foi colado:
                não dava para responder "colei 20 linhas, entraram 20?" sem
                contar à mão. Agora cada painel diz o seu número, e a diferença
                entre os dois é exatamente o que a lista de descarte explica. */}
            <div className="flex items-baseline justify-between gap-2 mb-3 shrink-0">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Cole aqui
              </span>
              {totalLinhasColadas > 0 && (
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {totalLinhasColadas} {totalLinhasColadas === 1 ? "linha" : "linhas"}
                </span>
              )}
            </div>
            <textarea
                ref={textareaRef}
                value={text}
                /* Limpa o recorte ao editar: o papel filtrado pode deixar de
                   existir no texto novo, e a prévia ficaria vazia sem dizer
                   por quê. */
                onChange={(e) => { setText(e.target.value); setFiltroPapel(null); }}
                spellCheck={false}
                autoFocus
                className="h-full w-full min-h-[240px] resize-none rolagem-visivel rounded-md border border-input bg-muted/50 px-3 py-2 font-mono text-[13px] leading-relaxed ring-offset-background placeholder:text-muted-foreground focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                // O exemplo mostra os TRÊS papéis que a importação produz, cada
                // um numa situação em que ele de fato aparece: 1 é Fase (nível
                // 1); 1.1 é Entrega porque tem subitens; 1.1.1 e 1.2 são
                // Atividade porque são folhas. Antes dizia "1.1 em diante viram
                // Atividade", o que só vale para as folhas — quem agrupa vira
                // Entrega, e o texto escondia metade da regra.
                //
                // As setas ficam ALINHADAS numa coluna: antes cada uma começava
                // no fim do próprio texto, deixando um degrau irregular no meio
                // do bloco.
                /* Só a estrutura, sem as setas explicativas. Elas dobravam o
                   comprimento de cada linha e quebravam no campo estreito,
                   virando um bloco confuso — e a regra que elas repetiam já
                   está escrita logo acima, no cabeçalho. */
                /* Espelha o de/para ao lado, LINHA A LINHA: a 1ª daqui é a 1ª
                   de lá. É o que permite ler comparando em vez de decorar uma
                   regra escrita em texto. */
                placeholder={[
                  "1. Implantação do Serviço",
                  "1.1 Iniciação",
                  "1.1.1 Formalização",
                  "1.1.1.1 Elaborar TAP",
                  "1.1.1.2 Marco: TAP aprovado",
                ].join("\n")}
              />
          </div>

          {/* Pré-visualização em árvore */}
          <div className="p-6 flex flex-col min-h-0">
            <div className="flex items-baseline justify-between gap-2 mb-3 shrink-0">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {tree.length === 0 ? "O que vai acontecer" : "Pré-visualização"}
              </span>
              {tree.length > 0 && (
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {tree.length} {tree.length === 1 ? "item" : "itens"}
                  {/* Os ancestrais que o parser INVENTA (o "1" criado quando o
                      texto começa em "1.2") não vieram de linha nenhuma — sem
                      dizer isso, a conta "20 linhas → 23 itens" pareceria erro. */}
                  {totalInventados > 0 && (
                    <span className="text-muted-foreground/70">
                      {" "}({totalInventados} {totalInventados === 1 ? "criado" : "criados"})
                    </span>
                  )}
                  {/* O número de conflitos AQUI, não só no selo de cada linha:
                      numa EAP de 80 itens ninguém percorre a lista para
                      descobrir que 40 já existem. */}
                  {codigosEmConflito.length > 0 && (
                    <span className="text-destructive font-medium">
                      {" "}· {codigosEmConflito.length} já {codigosEmConflito.length === 1 ? "existe" : "existem"}
                    </span>
                  )}
                </span>
              )}
            </div>
            {tree.length === 0 ? (
              /* A ÁREA VAZIA ENSINA. Antes dizia "a árvore aparece aqui
                 conforme você cola" — descrevia o óbvio e não explicava a
                 regra, que estava num parágrafo lá em cima.
                 Agora cada linha aqui corresponde à mesma linha do exemplo no
                 campo ao lado, então lê-se comparando em vez de decorando. E
                 some assim que há o que mostrar, dando lugar à árvore real. */
              <div className="flex-1 border border-dashed rounded-lg p-4 flex flex-col justify-center gap-2.5">
                {[
                  { code: "1.", papel: "o projeto", nota: "não é importado", cls: "text-muted-foreground" },
                  { code: "1.1", papel: "Fase" },
                  { code: "1.1.1", papel: "Entrega" },
                  { code: "1.1.1.1", papel: "Atividade" },
                ].map((l) => (
                  <div key={l.code} className="flex items-baseline gap-2.5 text-[12.5px]">
                    <span className="font-mono text-muted-foreground w-[58px] shrink-0 tabular-nums">{l.code}</span>
                    <span className={l.cls || "font-medium text-foreground"}>{l.papel}</span>
                    {l.nota && <span className="text-muted-foreground/70 text-[11.5px]">— {l.nota}</span>}
                  </div>
                ))}
                <div className="flex items-baseline gap-2.5 text-[12.5px] pt-2 mt-1 border-t border-dashed">
                  <Diamond className="w-3 h-3 shrink-0 self-center text-amber-600 dark:text-amber-400 fill-current" />
                  <span className="text-muted-foreground">
                    Escreva{" "}
                    <code className="px-1 py-0.5 rounded bg-muted font-mono text-[11.5px] text-foreground">Marco:</code>
                    {" "}no título para virar um marco
                  </span>
                </div>
              </div>
            ) : (
              /* `rolagem-visivel`: a área já rolava, mas com a barra fina do
                 sistema — nada dizia que havia mais itens abaixo, e a lista
                 parecia acabar onde a área terminava. */
              <div className="flex-1 min-h-0 overflow-y-auto rolagem-visivel space-y-1 -mx-1 px-1">
                {(filtroPapel ? tree.filter((n) => n.role === filtroPapel) : tree).map((n) => {
                  // Ancestral inventado pelo parser (o texto começou em "1.2",
                  // então o "1" foi criado para a árvore não ficar quebrada).
                  const inventado = n.title.startsWith("(sem título)");
                  const jaExiste = inventado ? faseExistente(n.code) : null;
                  // Só para item de verdade: inventado reaproveita a fase (selo
                  // verde acima), e marco não tem código para colidir.
                  const ocupado = !inventado && n.code ? codigoOcupado(n.code) : null;
                  return (
                  // `key` cai na linha do texto quando não há código: marco
                  // solto tem code vazio, e keys vazias colidem entre si.
                  // `items-start`, não `items-center`: com o título quebrando em
                  // duas linhas, centralizar faria o selo e o código flutuarem no
                  // meio do bloco — a coluna deles deixaria de se ler de cima a
                  // baixo. Pelo topo, cada linha começa alinhada com a anterior.
                  <div key={n.code || `linha:${n.ordemNoTexto}`} className="flex items-start gap-2.5 py-1" style={{ paddingLeft: (n.depth - 1) * 20 }}>
                    <span className={cn("inline-flex items-center text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 mt-px", ROLE_META[n.role].cls)}>
                      {ROLE_META[n.role].short}
                    </span>
                    {/* Sem código, mostra um traço em vez de espaço vazio: o
                        marco não entra na numeração da EAP de propósito, e um
                        branco ali pareceria informação faltando. */}
                    <span className="text-[11px] font-mono text-muted-foreground shrink-0 mt-0.5" title={n.code ? undefined : "Marco não entra na numeração da EAP"}>
                      {n.code || "—"}
                    </span>
                    {/* A fase JÁ EXISTE: mostra o título real e avisa que será
                        reaproveitada. Antes dizia "(sem título) 1" e prometia
                        uma fase nova que a importação não cria — ela reaproveita
                        a existente. */}
                    {/* TÍTULO QUEBRA, não corta. `truncate` cortava numa linha
                        só E sem `title`: o texto perdido não voltava nem no
                        hover. Some mais do que parece — cada nível recua 20px,
                        então "1.1.1.1" começa 60px à direita e ainda divide a
                        linha com o selo e o código.
                        Esta é a tela de CONFERIR antes de gravar; o que não se
                        lê não se verifica. Jira e Asana quebram o texto na
                        prévia pelo mesmo motivo.
                        `line-clamp-3` é o teto: título colado por engano (200+
                        caracteres) não pode ocupar meia tela — aí o tooltip
                        mostra o resto. */}
                    {jaExiste ? (
                      <>
                        <span className="text-[13px] break-words line-clamp-3 min-w-0 flex-1" title={jaExiste}>{jaExiste}</span>
                        <span className="text-[10px] shrink-0 px-1.5 py-0.5 rounded border border-success/40 bg-success/5 text-success">
                          já existe · será reaproveitada
                        </span>
                      </>
                    ) : inventado ? (
                      <>
                        <span className="text-[13px] text-muted-foreground italic min-w-0">sem título</span>
                        <span className="text-[10px] shrink-0 px-1.5 py-0.5 rounded border border-warning/40 bg-warning/5 text-warning"
                              title={`O código ${n.code} não estava no texto colado, mas "${tree.find((x) => x.parentCode === n.code)?.code ?? ""}" precisa dele. Será criada sem título.`}>
                          criada automaticamente
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-[13px] break-words line-clamp-3 min-w-0 flex-1" title={n.title}>{n.title}</span>
                        {/* CÓDIGO JÁ OCUPADO. Diferente do selo verde acima —
                            fase existente é reaproveitada, atividade existente
                            vira CÓPIA. O selo diz qual item já mora nesse
                            endereço, para a conferência acontecer aqui e não
                            depois, no Backlog, com duas linhas iguais. */}
                        {ocupado && (
                          <span
                            className="text-[10px] shrink-0 px-1.5 py-0.5 rounded border border-destructive/40 bg-destructive/5 text-destructive"
                            title={`O código ${n.code} já é de "${ocupado}". Importar cria uma segunda linha no mesmo endereço.`}
                          >
                            código já usado
                          </span>
                        )}
                      </>
                    )}
                    {/* O que veio das colunas: conferir aqui evita descobrir
                        que a data entrou errada só depois de importar. */}
                    {n.vals && (
                      <span className="ml-auto flex items-center gap-1.5 shrink-0 text-[10px] text-muted-foreground mt-0.5">
                        {(n.vals.start_date || n.vals.end_date) && (
                          <span className="font-mono">
                            {fmtDia(n.vals.start_date)}→{fmtDia(n.vals.end_date)}
                          </span>
                        )}
                        {n.vals.hours != null && <span className="font-mono">{n.vals.hours}h</span>}
                        {n.vals.actual_end_date && (
                          <span className="px-1 rounded border border-success/40 text-success">concluída</span>
                        )}
                        {!n.vals.actual_end_date && n.vals.actual_start_date && (
                          <span className="px-1 rounded border border-warning/40 text-warning">em andamento</span>
                        )}
                        {n.vals.responsavel && <span className="truncate max-w-[90px]">{n.vals.responsavel}</span>}
                      </span>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* A LISTA do que ficou de fora — linha, texto e motivo.
            Cada motivo pede uma correção diferente: "sem código EAP" é uma
            observação solta, "código fora do padrão" é numeração que o parser
            não lê. Um aviso genérico obrigava a adivinhar qual era o caso. */}
        {detalheAberto && parsed.descartadas.length > 0 && (
          // ALTURA PRÓPRIA, não `shrink-0` solto. Antes ela crescia conforme o
          // conteúdo e EMPURRAVA o corpo: a última linha do campo colado sumia
          // atrás dela ("1.1.2.4 Classificar stakeholders" cortado ao meio).
          // Com `h-[136px] shrink-0`, o corpo (que é `flex-1 min-h-0`) encolhe
          // para caber — o painel tem lugar em vez de invadir.
          <div className="h-[136px] shrink-0 border-t bg-muted/20 flex flex-col">
            {/* Cabeçalho com o resumo e o fechar: sem ele, sair da lista exigia
                achar o selo lá no rodapé, que a própria lista empurrou. */}
            <div className="flex items-center justify-between gap-3 px-6 py-1.5 shrink-0">
              <span className="text-[11px] text-muted-foreground">
                {linhasPerdidas.length > 0 && (
                  <span className="text-warning font-medium">
                    {linhasPerdidas.length} fora da importação
                  </span>
                )}
                {linhasPerdidas.length > 0 && linhasAnexadas.length > 0 && " · "}
                {linhasAnexadas.length > 0 && (
                  <span>{linhasAnexadas.length} juntada{linhasAnexadas.length > 1 ? "s" : ""} ao item anterior</span>
                )}
                <span className="text-muted-foreground/70"> — clique para ir até a linha</span>
              </span>
              <button
                type="button"
                onClick={() => setDetalheAberto(false)}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                Fechar
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto rolagem-visivel px-6 pb-2.5">
              <div className="rounded-md border border-border bg-background divide-y divide-border/60">
                {parsed.descartadas.map((d) => {
                  const anexada = d.motivo === "anexada";
                  return (
                    <button
                      key={`${d.numero}-${d.motivo}`}
                      type="button"
                      onClick={() => irParaLinha(d.numero)}
                      className="w-full flex items-baseline gap-2.5 px-2.5 py-1.5 text-left hover:bg-muted/60 transition-colors"
                      title="Ir para esta linha no texto colado"
                    >
                      <span className="text-[10.5px] text-muted-foreground/70 tabular-nums w-6 text-right shrink-0">
                        {d.numero}
                      </span>
                      <span className="flex-1 min-w-0 truncate font-mono text-[12px]">{d.texto}</span>
                      <span
                        className={cn(
                          "text-[10.5px] shrink-0 whitespace-nowrap",
                          anexada ? "text-muted-foreground" : "text-warning",
                        )}
                        title={anexada ? `O texto entrou em "${d.anexadaEm}"` : undefined}
                      >
                        {MOTIVO_LABEL[d.motivo]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Rodapé: contadores + ações (sempre visível) */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-3.5 border-t bg-muted/30 shrink-0">
          {tree.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <CountBadge role="fase" n={counts.fase} />
              {counts.entrega > 0 && <CountBadge role="entrega" n={counts.entrega} />}
              <CountBadge role="atividade" n={counts.atividade} />
              {counts.marco > 0 && <CountBadge role="marco" n={counts.marco} />}
              {/* O AVISO ABRE. Antes era um número calculado por subtração
                  (coladas − reconhecidas), então dizia "1 linha" sem poder
                  dizer QUAL — não existia lista para mostrar. Agora o parser
                  registra cada descarte e o selo revela a lista. */}
              {linhasPerdidas.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDetalheAberto((v) => !v)}
                  className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md border border-warning/40 bg-warning/5 text-warning text-[11px] font-medium hover:bg-warning/10 transition-colors"
                  title="Ver quais linhas ficaram de fora"
                  aria-expanded={detalheAberto}
                >
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  {linhasPerdidas.length} {linhasPerdidas.length === 1 ? "linha não reconhecida" : "linhas não reconhecidas"}
                  <ChevronDown className={cn("w-3 h-3 shrink-0 opacity-60 transition-transform", detalheAberto && "rotate-180")} />
                </button>
              )}
              {/* Anexadas NÃO são perda: o texto entrou no item anterior. Ficam
                  em tom neutro, longe do âmbar — antes entravam no mesmo
                  contador e assustavam sem ter havido perda nenhuma. */}
              {linhasAnexadas.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDetalheAberto((v) => !v)}
                  className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md border border-border bg-muted/40 text-muted-foreground text-[11px] hover:text-foreground transition-colors"
                  title="Títulos que quebraram em duas linhas e foram juntados ao item anterior"
                  aria-expanded={detalheAberto}
                >
                  {linhasAnexadas.length} {linhasAnexadas.length === 1 ? "linha juntada" : "linhas juntadas"}
                  <ChevronDown className={cn("w-3 h-3 shrink-0 opacity-60 transition-transform", detalheAberto && "rotate-180")} />
                </button>
              )}
            </div>
          ) : (
            <span className="text-[13px] text-muted-foreground">Nada para importar ainda.</span>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={resetAndClose}>Cancelar</Button>
            <Button size="sm" onClick={handleImport} disabled={tree.length === 0 || importing} className="gap-1.5">
              <Upload className="w-4 h-4" />
              {/* Desconta o que será REAPROVEITADO: contar a fase existente
                  como item a importar prometia criar algo que não é criado. */}
              {importing
                ? "Importando..."
                : (() => {
                    const novos = tree.length - reaproveitados;
                    return `Importar ${novos} ${novos === 1 ? "item" : "itens"}`;
                  })()}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
