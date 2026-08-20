'use client';

/**
 * EAP VISUAL — a árvore da decomposição, desenhada.
 *
 * A EAP já existia no sistema: o modelo de três papéis (`lib/eapModel.ts`), os
 * códigos 1.2.3 e a árvore por `parent_id`. O que faltava era o DESENHO — a
 * estrutura só aparecia como lista indentada, de onde não dá para apresentar a
 * decomposição de um projeto numa reunião.
 *
 * ── POR QUE NÃO O ORGANOGRAMA CLÁSSICO ────────────────────────────────────
 *
 * A EAP "do livro" põe os filhos lado a lado sob o pai. Isso faz a largura
 * crescer com o número de FOLHAS, não de níveis. Medido na base em 19/08/2026:
 * há um pai com 51 filhos, e o maior projeto tem 413 atividades — o diagrama
 * teria dezenas de milhares de pixels de largura. Não cabe.
 *
 * A saída vem do WBS Schedule Pro, a ferramenta de referência da categoria: o
 * estilo padrão dela ("WBS Chart Style") exibe AGRUPADORES na horizontal e
 * FOLHAS na vertical, abaixo do pai. Assim o eixo horizontal cresce com o
 * número de fases (poucas, limitadas) e o vertical absorve as atividades
 * (muitas — e rolar para baixo é de graça).
 *
 * A regra encaixa direto no `eapModel`, que já distingue agrupador de folha.
 *
 * ── POR QUE SVG PRÓPRIO ───────────────────────────────────────────────────
 *
 * `d3-hierarchy` (5,8 KB, zero dependências) faz só a matemática do layout
 * arrumado (Reingold–Tilford) — não toca no DOM. O desenho é SVG com Tailwind,
 * como o Cronograma já faz para as setas de dependência. React Flow (60 KB)
 * renderizaria 413 nós como elementos DOM e traria um editor de grafos que
 * uma árvore não precisa; elkjs pesa 437 KB.
 *
 * ── SÓ LEITURA ────────────────────────────────────────────────────────────
 *
 * Arrastar aqui moveria uma subárvore inteira, com renumeração em cascata de
 * dezenas de `wbs_code` — fácil de disparar sem querer com o zoom afastado.
 * Toda mudança de estrutura continua no Backlog, onde os controles e a
 * permissão já estão resolvidos. Clicar num nó abre a atividade.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hierarchy, tree, type HierarchyPointNode } from "d3-hierarchy";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Maximize2, Printer, Download, ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveEapKind, type EapKind } from "@/lib/eapModel";

export interface EapNodeInput {
  id: string;
  title: string;
  wbs_code?: string | null;
  parent_id?: string | null;
  is_milestone?: boolean | null;
  item_type?: string | null;
  /** 0–100. Já calculado por quem chama (o Backlog conhece as colunas). */
  progresso?: number | null;
}

interface Props {
  projectTitle: string;
  items: EapNodeInput[];
  /** Clique num nó — abre a atividade no painel que já existe. */
  onSelect?: (id: string) => void;
  className?: string;
}

/** Nó interno da árvore, já com o papel resolvido. */
interface Node {
  id: string;
  title: string;
  code: string | null;
  kind: EapKind;
  progresso: number | null;
  /** Filhos ANTES do corte por nível/colapso — para saber quantos ficaram ocultos. */
  todosFilhos: Node[];
  filhos: Node[];
  /** Código diz que tem pai, mas `parent_id` está vazio. */
  orfao: boolean;
  nivel: number;
}

const RAIZ_ID = "__raiz__";

/** Agrupador ramifica na horizontal; folha desce na vertical. */
const agrupa = (k: EapKind) => k === "projeto" || k === "fase" || k === "entrega";

// Caixa: agrupador é mais alto porque leva a barra de progresso.
const W = 168;
const H_GRUPO = 42;
const H_FOLHA = 22;
const GAP_X = 32;
const GAP_Y = 6;

export function EapVisual({ projectTitle, items, onSelect, className }: Props) {
  const [nivelMax, setNivelMax] = useState(3);
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());
  const [foco, setFoco] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  /**
   * Monta a árvore a partir de `parent_id`.
   *
   * Um item cujo pai não está na lista visível é promovido a raiz — mesma
   * regra do Backlog, senão ele sumiria da tela ao ser filtrado.
   *
   * `orfao` marca quem tem código de subitem (1.3.4) mas nenhum pai. Medido em
   * 19/08/2026: 90 itens em 6 projetos, e NENHUM tem pai recuperável pelo
   * código — os níveis intermediários nunca foram criados. A lista indentada
   * escondia isso (o item aparecia no topo e ninguém estranhava); a árvore
   * desenhada mostra uma caixa solta, sem linha ligando a nada.
   */
  const raiz = useMemo<Node>(() => {
    const visiveis = new Set(items.map((i) => i.id));
    const porPai = new Map<string, EapNodeInput[]>();
    const topo: EapNodeInput[] = [];
    for (const it of items) {
      const paiVisivel = it.parent_id ? visiveis.has(it.parent_id) : false;
      if (it.parent_id && paiVisivel) {
        porPai.set(it.parent_id, [...(porPai.get(it.parent_id) ?? []), it]);
      } else {
        topo.push(it);
      }
    }

    /**
     * CICLO EM `parent_id` NÃO PODE APAGAR O NÓ.
     *
     * Num ciclo A→B→A os dois têm pai visível, então nenhum entra em `topo` e
     * a recursão nunca os alcança: a árvore renderizaria sem eles, em
     * silêncio. Dado corrompido sumindo da tela é pior que dado corrompido
     * aparecendo torto — some justamente da tela que existe para revelar
     * problemas de estrutura.
     *
     * Quem não for alcançável a partir de `topo` é promovido a raiz, como
     * qualquer órfão. A guarda `vistos` lá embaixo continua valendo para o
     * caso de o ciclo estar ABAIXO de uma raiz legítima.
     */
    const alcancavel = new Set<string>();
    const marcar = (id: string) => {
      if (alcancavel.has(id)) return;
      alcancavel.add(id);
      for (const f of porPai.get(id) ?? []) marcar(f.id);
    };
    for (const t of topo) marcar(t.id);
    for (const it of items) {
      if (!alcancavel.has(it.id)) {
        topo.push(it);
        marcar(it.id);
      }
    }

    // `vistos` corta ciclo em parent_id (dado corrompido): sem ele a recursão
    // não terminaria. É a mesma proteção que `subirPaisCompletos` usa.
    const construir = (it: EapNodeInput, nivel: number, vistos: Set<string>): Node => {
      const filhosRaw = vistos.has(it.id) ? [] : (porPai.get(it.id) ?? []);
      const proximos = new Set(vistos).add(it.id);
      const filhos = filhosRaw.map((f) => construir(f, nivel + 1, proximos));
      const code = (it.wbs_code ?? "").trim() || null;
      return {
        id: it.id,
        title: it.title || "—",
        code,
        kind: resolveEapKind(it, filhos.length > 0),
        progresso: it.progresso ?? null,
        todosFilhos: filhos,
        filhos,
        orfao: !!code && code.includes(".") && !it.parent_id,
        nivel,
      };
    };

    // Uma construção só: `todosFilhos` e `filhos` precisam ser a MESMA lista
    // de objetos. Construir duas vezes geraria duas árvores com ids iguais mas
    // identidades diferentes, e o corte por nível compararia coisas distintas.
    const filhosDaRaiz = topo.map((t) => construir(t, 1, new Set()));
    return {
      id: RAIZ_ID,
      title: projectTitle,
      code: null,
      kind: "projeto",
      progresso: null,
      todosFilhos: filhosDaRaiz,
      filhos: filhosDaRaiz,
      orfao: false,
      nivel: 0,
    };
  }, [items, projectTitle]);

  /** Subárvore em foco, ou a raiz. A trilha de volta vem do caminho até ela. */
  const { exibida, trilha } = useMemo(() => {
    if (!foco) return { exibida: raiz, trilha: [] as Node[] };
    const caminho: Node[] = [];
    const achar = (n: Node): Node | null => {
      if (n.id === foco) return n;
      for (const f of n.filhos) {
        caminho.push(n);
        const r = achar(f);
        if (r) return r;
        caminho.pop();
      }
      return null;
    };
    const alvo = achar(raiz);
    return alvo ? { exibida: alvo, trilha: [...caminho] } : { exibida: raiz, trilha: [] };
  }, [raiz, foco]);

  /** Aplica corte por nível e por colapso manual. */
  const podada = useMemo(() => {
    const base = exibida.nivel;
    const podar = (n: Node): Node => {
      const fechado = colapsados.has(n.id) || (n.nivel - base) >= nivelMax;
      return { ...n, filhos: fechado ? [] : n.filhos.map(podar) };
    };
    return podar(exibida);
  }, [exibida, colapsados, nivelMax]);

  /**
   * LAYOUT HÍBRIDO.
   *
   * `d3.tree()` resolve uma orientação só, então a árvore é dividida: os
   * AGRUPADORES entram no d3 (ramificam para o lado) e as FOLHAS de cada
   * agrupador são empilhadas à mão, verticalmente, abaixo dele.
   *
   * `nodeSize` fixo em vez de `size`: o diagrama cresce com o conteúdo em vez
   * de ser espremido num retângulo — que é o que permite rolar em vez de
   * encolher a fonte até ficar ilegível.
   */
  const layout = useMemo(() => {
    /**
     * O d3 recebe SÓ os agrupadores — são eles que ramificam para o lado. As
     * folhas saem da árvore aqui e voltam na renderização, empilhadas sob o
     * pai. É o que faz um projeto de 413 atividades caber numa tela.
     *
     * `filhosVisiveis` preserva a lista ORIGINAL (com folhas) em cada nó, para
     * o cálculo de altura logo abaixo. Sem isso `alturaCom` leria a lista já
     * podada, contaria zero folhas em todo mundo, e as pilhas de dois ramos
     * vizinhos se sobreporiam.
     */
    const filhosVisiveis = new Map<string, Node[]>();
    const soGrupos = (n: Node): Node => {
      filhosVisiveis.set(n.id, n.filhos);
      return { ...n, filhos: n.filhos.filter((f) => agrupa(f.kind)).map(soGrupos) };
    };
    const arvoreGrupos = soGrupos(podada);

    const h = hierarchy<Node>(arvoreGrupos, (d) => d.filhos);
    // Espaço vertical de cada agrupador = a própria caixa + a pilha de folhas
    // que desce dele.
    const alturaCom = (n: Node) => {
      const originais = filhosVisiveis.get(n.id) ?? [];
      const folhas = originais.filter((f) => !agrupa(f.kind)).length;
      const oculto = n.todosFilhos.length > originais.length ? 1 : 0;
      return H_GRUPO + (folhas + oculto) * (H_FOLHA + GAP_Y) + 40;
    };
    tree<Node>()
      .nodeSize([W + GAP_X, 0])
      .separation(() => 1)(h);

    /**
     * O d3 devolve x = posição no eixo dos irmãos e y = profundidade. A
     * profundidade vira pixel aqui, somando a altura real de cada nível — que
     * varia com quantas folhas penduram nele.
     *
     * O offset é o MAIOR do nível, não o de cada ramo. Isso garante que
     * nenhuma pilha de folhas invada o nível de baixo, mas cobra um preço: um
     * único ramo largo estica o nível inteiro, e os ramos curtos ao lado ficam
     * com um trecho longo de conector vazio até o filho. Num nível com um pai
     * de 51 filhos, isso é bastante espaço morto.
     *
     * Alinhar cada ramo à sua própria altura exigiria empacotar as subárvores
     * em duas dimensões — outro algoritmo, não um ajuste deste. Fica assim de
     * propósito: espaço sobrando é feio, sobreposição é ilegível.
     */
    const alturaNivel = new Map<number, number>();
    h.each((d) => {
      alturaNivel.set(d.depth, Math.max(alturaNivel.get(d.depth) ?? 0, alturaCom(d.data)));
    });
    const offsetY = new Map<number, number>();
    let acc = 0;
    for (const nivel of [...alturaNivel.keys()].sort((a, b) => a - b)) {
      offsetY.set(nivel, acc);
      acc += alturaNivel.get(nivel)!;
    }

    const nos = h.descendants() as HierarchyPointNode<Node>[];
    for (const n of nos) {
      n.y = offsetY.get(n.depth) ?? 0;
      // Reanexa a lista completa (com folhas) ao dado do nó: a renderização e
      // o cálculo de bounds precisam dela, e o que o d3 carrega é a podada.
      n.data = { ...n.data, filhos: filhosVisiveis.get(n.data.id) ?? n.data.filhos };
    }
    return nos;
  }, [podada]);

  /** Caixa envolvente, para "ajustar à tela" e para o viewBox inicial. */
  const bounds = useMemo(() => {
    if (layout.length === 0) return { x: 0, y: 0, w: 400, h: 200 };
    let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of layout) {
      minX = Math.min(minX, n.x - W / 2);
      maxX = Math.max(maxX, n.x + W / 2);
      const folhas = n.data.filhos.filter((f) => !agrupa(f.kind)).length;
      const oculto = n.data.todosFilhos.length > n.data.filhos.length ? 1 : 0;
      maxY = Math.max(maxY, n.y + H_GRUPO + (folhas + oculto) * (H_FOLHA + GAP_Y) + 20);
    }
    const pad = 40;
    // A caixa vai de `-pad` até `maxY + pad`: a altura é `maxY + 2*pad`, com a
    // folga entrando uma vez em cada ponta. `maxY` já é medido a partir de 0
    // (o topo da raiz), então não há dupla contagem aqui.
    return { x: minX - pad, y: -pad, w: maxX - minX + pad * 2, h: maxY + pad * 2 };
  }, [layout]);

  const ajustar = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);
  useEffect(() => { ajustar(); }, [foco, ajustar]);

  const alternar = (id: string) =>
    setColapsados((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  /**
   * Baixa o SVG — sem biblioteca, só XMLSerializer.
   *
   * As cores do desenho vêm de classes Tailwind (`fill-muted`, `stroke-border`
   * …), resolvidas por uma folha de estilo EXTERNA. Serializar o nó e salvar
   * produzia um arquivo que, aberto fora do navegador, saía todo preto sobre
   * transparente — a estrutura certa, sem nenhuma cor.
   *
   * `getComputedStyle` resolve cada elemento no momento da exportação e grava
   * o valor final como atributo. É mais verboso que embutir um `<style>`, mas
   * funciona em qualquer visualizador e leva junto o tema (claro ou escuro)
   * que estava valendo na tela.
   */
  const baixarSvg = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const copia = svg.cloneNode(true) as SVGSVGElement;
    const origem = svg.querySelectorAll<SVGElement>("*");
    const destino = copia.querySelectorAll<SVGElement>("*");
    origem.forEach((el, i) => {
      const alvo = destino[i];
      if (!alvo) return;
      const s = window.getComputedStyle(el);
      for (const prop of ["fill", "stroke", "stroke-width", "stroke-dasharray", "font-size", "font-weight", "font-family", "text-anchor"] as const) {
        const v = s.getPropertyValue(prop);
        if (v && v !== "none" && v !== "normal") alvo.setAttribute(prop, v);
      }
      // As classes não significam nada fora do app e só inflariam o arquivo.
      alvo.removeAttribute("class");
    });
    copia.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copia.removeAttribute("class");
    // Fundo explícito: SVG é transparente por padrão, e um desenho de texto
    // escuro sobre transparente some ao ser colado num slide claro… ou escuro.
    copia.style.background = window.getComputedStyle(document.body).backgroundColor;

    const txt = new XMLSerializer().serializeToString(copia);
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${txt}`], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `EAP - ${projectTitle}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revogar na mesma volta do laço abortava o download em alguns
    // navegadores: a URL morria antes de a gravação começar.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  // Pan por arraste no fundo. `viewBox` em vez de transform CSS: mantém o SVG
  // vetorial na impressão, que é o ponto de ter escolhido SVG.
  const onDown = (e: React.MouseEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const onMove = (e: React.MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPan({ x: d.px - (e.clientX - d.x) / zoom, y: d.py - (e.clientY - d.y) / zoom });
  };
  const onUp = () => { dragRef.current = null; };

  /**
   * O zoom mantém o CENTRO no lugar, não o canto.
   *
   * Antes só a largura e a altura eram divididas pelo zoom, com a origem fixa
   * em `bounds.x/y`: aproximar empurrava o conteúdo para fora pela direita e
   * por baixo, e quem estava olhando o meio da árvore perdia o que via.
   * Recentralizar é o comportamento que qualquer mapa tem.
   */
  const vbW = bounds.w / zoom;
  const vbH = bounds.h / zoom;
  const vb = [
    bounds.x + pan.x + (bounds.w - vbW) / 2,
    bounds.y + pan.y + (bounds.h - vbH) / 2,
    vbW,
    vbH,
  ].join(" ");

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Controles de VISÃO. Espelham os que o Backlog já tem — agrupar,
          expandir, recolher — e acrescentam o que só a árvore precisa. */}
      <div className="flex items-center gap-2 flex-wrap pb-2 print:hidden">
        {trilha.length > 0 && (
          <Button
            size="sm" variant="ghost" className="h-7 gap-1 text-xs"
            onClick={() => setFoco(trilha.length > 1 ? trilha[trilha.length - 1].id : null)}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            {trilha[trilha.length - 1]?.title ?? "Tudo"}
          </Button>
        )}
        <Select value={String(nivelMax)} onValueChange={(v) => setNivelMax(Number(v))}>
          <SelectTrigger className="h-7 w-[112px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5, 9].map((n) => (
              <SelectItem key={n} value={String(n)} className="text-xs">
                {n === 9 ? "Tudo" : `Nível ${n}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={ajustar}>
          <Maximize2 className="w-3.5 h-3.5" /> Ajustar
        </Button>
        {/* NÃO existe alternar orientação, e a ausência é deliberada.
            Eu havia afirmado que sairia "de graça" porque o layout do d3 é
            agnóstico de orientação — o que é verdade só para as coordenadas
            DOS AGRUPADORES. As constantes deste desenho não são simétricas:
            o espaçamento entre irmãos é dimensionado pela LARGURA da caixa
            (168px) e o espaçamento entre níveis pela ALTURA dela mais a pilha
            de folhas. Trocar os eixos sem transpor as constantes fazia cada
            nível invadir o pai, e a pilha de folhas — que sempre desce —
            atravessava o irmão ao lado a partir da sexta folha.
            Girar de verdade exige transpor espaçamento, pilhas, limites e
            conectores. Fica para quando fizer falta, em vez de entregar um
            botão que produz um diagrama ilegível. */}
        <div className="flex items-center gap-1 ml-auto">
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={baixarSvg}>
            <Download className="w-3.5 h-3.5" /> SVG
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5" /> Imprimir
          </Button>
        </div>
      </div>

      {/* `eap-impressao` liga o @page paisagem em index.css — sem ela, mandar
          imprimir sairia retrato, cortando a árvore no eixo que ela cresce. */}
      <div className="eap-impressao rounded-lg border border-border bg-muted/30 overflow-auto print:border-0 print:bg-transparent">
        <svg
          ref={svgRef}
          viewBox={vb}
          className="w-full min-h-[420px] cursor-grab active:cursor-grabbing"
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
          onWheel={(e) => {
            // Zoom só com Ctrl/⌘: sem isso a roda do mouse sequestraria a
            // rolagem da página, que é o gesto mais comum aqui.
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            setZoom((z) => Math.min(3, Math.max(0.2, z * (e.deltaY < 0 ? 1.12 : 0.89))));
          }}
        >
          {/* A orientação é resolvida nas COORDENADAS de cada nó (o layout do
              d3 é agnóstico: basta trocar o papel de x e y), não por uma
              rotação do grupo — girar o container viraria o texto junto. */}
          <g>
            {/* Conectores primeiro, para as caixas ficarem por cima. */}
            {layout.map((n) => {
              const px = n.x;
              const py = n.y;
              return n.children?.map((c) => {
                const cx = c.x;
                const cy = c.y;
                const meio = (py + H_GRUPO + cy) / 2;
                const d = `M${px},${py + H_GRUPO} V${meio} H${cx} V${cy}`;
                return (
                  <path key={`${n.data.id}-${c.data.id}`} d={d}
                    className="stroke-border" strokeWidth={1.2} fill="none" />
                );
              });
            })}

            {layout.map((n) => {
              const px = n.x - W / 2;
              const py = n.y;
              const d = n.data;
              const folhas = d.filhos.filter((f) => !agrupa(f.kind));
              const ocultos = d.todosFilhos.length - d.filhos.length;
              /**
               * Só a RAIZ SINTÉTICA recebe o tratamento de projeto.
               *
               * Testar `kind === "projeto"` era errado: `resolveEapKind`
               * devolve esse papel para qualquer item cujo código EAP esteja
               * no nível do projeto. Uma atividade real com código de nível 1
               * ficava pintada como a raiz e, pior, sem clique e sem foco —
               * impossível de abrir pela EAP.
               *
               * A raiz é a única caixa que não corresponde a nenhuma linha do
               * banco, então é ela que não pode ser aberta. O id resolve isso
               * sem ambiguidade.
               */
              const ehProjeto = d.id === RAIZ_ID;

              return (
                <g key={d.id}>
                  {/* AGRUPADOR */}
                  <g
                    className="cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); if (!ehProjeto) onSelect?.(d.id); }}
                    onDoubleClick={(e) => { e.stopPropagation(); if (!ehProjeto) setFoco(d.id); }}
                  >
                    <rect
                      x={px} y={py} width={W} height={H_GRUPO} rx={7}
                      className={cn(
                        "stroke-[1.4]",
                        ehProjeto ? "fill-primary/10 stroke-primary" : "fill-muted stroke-border",
                        d.orfao && "fill-destructive/10 stroke-destructive",
                      )}
                      strokeDasharray={d.orfao ? "4 3" : undefined}
                    />
                    {d.code && (
                      <text x={px + 12} y={py + 16} className="fill-muted-foreground"
                        style={{ fontSize: 8.5, fontFamily: "var(--font-mono, monospace)" }}>
                        {d.code}
                      </text>
                    )}
                    <text x={px + 12} y={py + (d.code ? 29 : 25)}
                      className={cn("font-semibold", ehProjeto ? "fill-primary" : "fill-foreground")}
                      style={{ fontSize: 11 }}>
                      {d.title.length > 24 ? `${d.title.slice(0, 23)}…` : d.title}
                    </text>
                    {typeof d.progresso === "number" && !ehProjeto && (
                      <>
                        <rect x={px + 12} y={py + 34} width={116} height={4} rx={2} className="fill-border" />
                        <rect x={px + 12} y={py + 34} width={Math.max(0, Math.min(116, 116 * d.progresso / 100))}
                          height={4} rx={2} className="fill-success" />
                        <text x={px + 136} y={py + 38} className="fill-muted-foreground"
                          style={{ fontSize: 8.5, fontFamily: "var(--font-mono, monospace)" }}>
                          {Math.round(d.progresso)}%
                        </text>
                      </>
                    )}
                  </g>

                  {/* FOLHAS empilhadas — o que faz a árvore caber */}
                  {folhas.map((f, i) => {
                    const fy = py + H_GRUPO + 12 + i * (H_FOLHA + GAP_Y);
                    const fx = px + 18;
                    const marco = f.kind === "marco";
                    return (
                      <g key={f.id} className="cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); onSelect?.(f.id); }}>
                        <path d={`M${px + 8},${py + H_GRUPO} V${fy + H_FOLHA / 2} H${fx}`}
                          className="stroke-border" strokeWidth={1} fill="none" />
                        {marco ? (
                          <>
                            <path d={`M${fx + 2},${fy + 11} l8,-8 8,8 -8,8 z`}
                              className="fill-warning/20 stroke-warning" strokeWidth={1.3} />
                            <text x={fx + 24} y={fy + 15} className="fill-warning font-semibold"
                              style={{ fontSize: 9.5 }}>
                              {f.title.length > 20 ? `${f.title.slice(0, 19)}…` : f.title}
                            </text>
                          </>
                        ) : (
                          <>
                            <rect x={fx} y={fy} width={W - 34} height={H_FOLHA} rx={5}
                              className={cn("fill-background stroke-border",
                                f.orfao && "fill-destructive/10 stroke-destructive")}
                              strokeDasharray={f.orfao ? "4 3" : undefined} />
                            {f.code && (
                              <text x={fx + 8} y={fy + 15} className="fill-muted-foreground"
                                style={{ fontSize: 8, fontFamily: "var(--font-mono, monospace)" }}>
                                {f.code}
                              </text>
                            )}
                            <text x={fx + 8 + (f.code ? f.code.length * 5 + 6 : 0)} y={fy + 15}
                              className="fill-foreground" style={{ fontSize: 9.5 }}>
                              {f.title.length > 18 ? `${f.title.slice(0, 17)}…` : f.title}
                            </text>
                          </>
                        )}
                      </g>
                    );
                  })}

                  {/* Quantos ficaram de fora, e o clique que os traz */}
                  {ocultos > 0 && (
                    <g className="cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); alternar(d.id); }}>
                      <rect
                        x={px + 18} y={py + H_GRUPO + 12 + folhas.length * (H_FOLHA + GAP_Y)}
                        width={104} height={H_FOLHA} rx={11}
                        className="fill-primary/10 stroke-primary" strokeDasharray="3 2" />
                      <text
                        x={px + 70} y={py + H_GRUPO + 12 + folhas.length * (H_FOLHA + GAP_Y) + 15}
                        textAnchor="middle" className="fill-primary font-semibold" style={{ fontSize: 9.5 }}>
                        ▸ {ocultos} {ocultos === 1 ? "oculta" : "ocultas"}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/**
        * `@page` INJETADO PELO COMPONENTE, não no CSS global.
        *
        * A regra não pode ser escopada por seletor — `@page` só vale no nível
        * superior da folha de estilo. Posta em `index.css`, ela mudaria a
        * orientação de TODA impressão do sistema, inclusive a do TAP, que
        * declara `size: A4` e depende de retrato.
        *
        * Como este bloco só existe enquanto a EAP está montada, a paisagem
        * vale só aqui. É o mesmo padrão que o ProjectCharter já usa.
        *
        * A3 dá conta dos projetos médios; os grandes pedem A2 ou plotter — o
        * que é próprio de EAP, não defeito desta tela.
        */}
      <style>{`@media print { @page { size: A3 landscape; margin: 10mm; } }`}</style>

      {/* Legenda: as formas só significam algo se estiverem nomeadas. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-primary/10 border border-primary" /> Projeto
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-muted border border-border" /> Fase / Entrega
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-background border border-border" /> Atividade
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-warning/20 border border-warning rotate-45" /> Marco
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-destructive/10 border border-dashed border-destructive" />
          Fora da árvore
        </span>
        <span className="ml-auto">Clique abre · duplo clique foca · Ctrl+roda dá zoom</span>
      </div>
    </div>
  );
}
