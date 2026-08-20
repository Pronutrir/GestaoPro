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
  Maximize2, Printer, Download, ChevronLeft, Plus, Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EAP_LABELS, resolveEapKind, type EapKind } from "@/lib/eapModel";

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
  /** Agrupadores que o corte de largura deixou de fora — vira "+N fases". */
  gruposOcultos?: number;
}

const RAIZ_ID = "__raiz__";

/** Agrupador ramifica na horizontal; folha desce na vertical. */
const agrupa = (k: EapKind) => k === "projeto" || k === "fase" || k === "entrega";

/**
 * Quantos agrupadores por pai antes de virar "+N fases".
 *
 * Seis é o que devolve zoom 100% e o título em 11px numa tela de ~1.400px:
 * 6 × (168 + 32) = 1.200px. Com oito o desenho ainda cabe, mas exige 88% de
 * zoom e leva a fonte a 9,6px — abaixo dos 10px que se considera o piso do
 * texto legível.
 *
 * O MESMO teto vale para a pilha de FOLHAS. Eu havia escrito aqui que "folhas
 * descem, e descer é barato" — é barato numa fase, não na raiz: a Revitalização
 * Tasy tem 12 itens pendurados direto no projeto, e os 336px de pilha
 * empurravam todas as fases para fora da primeira tela. O que se via ao abrir
 * era uma coluna de marcos, não a estrutura.
 */
const LARGURA_MAX = 6;

/**
 * Limites do zoom, em fonte única — os botões e a roda do mouse precisam
 * concordar, e antes cada um carregava seu próprio número.
 *
 * O piso é 0,6 porque o título tem 11px: abaixo disso o texto passa dos ~6px e
 * deixa de ser legível. Quem precisa ver o conjunto usa o corte de largura ou
 * a trilha, não o zoom — foi assim que a árvore de 6.000px virou 1.360px.
 */
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 3;

// Caixa: agrupador é mais alto porque leva a barra de progresso.
const W = 168;
const H_GRUPO = 42;
const H_FOLHA = 22;
const GAP_X = 32;
const GAP_Y = 6;

export function EapVisual({ projectTitle, items, onSelect, className }: Props) {
  const [nivelMax, setNivelMax] = useState(3);
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());
  /** Pais cujo "+N fases" foi aberto — mostram todos os agrupadores. */
  const [larguraAberta, setLarguraAberta] = useState<Set<string>>(new Set());
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
        /**
         * MESMA função que a lista usa — `resolveEapKind`.
         *
         * Eu tinha trocado por `item_type === "fase"`, achando que era assim
         * que a lista decidia. Errado: `isPhaseLikeActivity` (item_type) só
         * escolhe QUEM vira card de agrupador; o PAPEL desenhado na linha vem
         * de `resolveEapKind` (BacklogSection, no cálculo de `groupKind`), que
         * é o que faz a lista mostrar Layers para Fase e Package para Entrega.
         *
         * A troca fez a EAP chamar de "Fase" os mesmos itens que a lista
         * marcava como Entrega — 1.3.1 "Treinamento Agendas" e 1.2.2 "Cadastros
         * e Funções Gerais" entre eles. Ou seja: eu criei a divergência que
         * queria corrigir, na direção oposta.
         *
         * A regra é uma só, e é a do modelo: o NÍVEL do código manda. Se a
         * numeração de um projeto estiver na convenção errada, o conserto é
         * renumerar (botão no menu do Backlog) — não cada tela inventar a sua.
         */
        kind: resolveEapKind(it, filhos.length > 0),
        progresso: it.progresso ?? null,
        todosFilhos: filhos,
        filhos,
        /**
         * ÓRFÃO É QUEM ESTÁ SOLTO — e agrupador não está.
         *
         * A regra olhava só o código e o `parent_id`: qualquer item com código
         * de subitem (1.3.4) sem pai era pintado de vermelho. Na Revitalização
         * Tasy isso marcou 38 caixas, e 30 delas TÊM FILHOS — são fases de
         * nível 1 cujo código veio da importação e nunca foi renumerado. A tela
         * ficava quase toda vermelha, e o alerta deixava de significar algo.
         *
         * Quem agrupa é a raiz de um ramo, esteja o código como estiver. O
         * alerta fica para a folha realmente solta: código dizendo que pertence
         * a algo, sem pai e sem nada embaixo. Na mesma base, 8 casos.
         */
        orfao: !!code && code.includes(".") && !it.parent_id && filhos.length === 0,
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

  /**
   * Corte por nível, por colapso manual — e por LARGURA.
   *
   * O corte por largura faltava, e era o defeito de fundo: `nivelMax` limita a
   * PROFUNDIDADE, e numa EAP quem estoura a tela é a LARGURA. Um projeto com
   * 30 agrupadores no nível 1 desenhava 6.000px (30 × 200) tanto em "Nível 1"
   * quanto em "Nível 5" — o seletor não mudava nada, e para caber numa tela de
   * 1.400px o zoom ia a 23%, com a fonte do título em 2,6px.
   *
   * Agora cada pai mostra no máximo `LARGURA_MAX` agrupadores; o resto vira um
   * nó "+N fases" que expande no lugar. É a mesma peça do "▸ N ocultas" que já
   * existia para as folhas e nunca tinha sido aplicada aos agrupadores.
   *
   * Só AGRUPADOR é limitado. Folha empilha na vertical, e vertical é barato —
   * rolar para baixo não custa legibilidade nenhuma.
   *
   * Medido: 6 por linha devolve 1.200px, zoom 100% e os 11px do título. Com 8
   * ainda dá (9,6px), mas 10px é o piso do que se considera legível.
   */
  const podada = useMemo(() => {
    /**
     * A PROFUNDIDADE É CONTADA NA RECURSÃO, não subtraída de `nivel`.
     *
     * Antes era `(n.nivel - base) >= nivelMax`, com `base = exibida.nivel`.
     * Isso depende de `nivel` ter sido atribuído certo na construção — e a
     * raiz sintética recebe 0 enquanto os itens promovidos a raiz (órfãos,
     * ciclos) recebem 1, mesmo estando no mesmo lugar da árvore. Ao focar, a
     * subtração podia dar um número que fechava o próprio nó exibido, e a tela
     * mostrava só a caixa do foco com "N ocultas" — nenhuma fase, nenhuma
     * entrega, como no relato.
     *
     * Contando na descida, `d` é sempre a distância real até o nó exibido:
     * 0 é ele mesmo, 1 são os filhos. Não há como fechar a raiz do que se está
     * olhando.
     */
    const podar = (n: Node, d: number): Node => {
      const fechado = colapsados.has(n.id) || d >= nivelMax;
      if (fechado) return { ...n, filhos: [] };

      const expandido = larguraAberta.has(n.id);
      const grupos = n.filhos.filter((f) => agrupa(f.kind));
      const folhas = n.filhos.filter((f) => !agrupa(f.kind));
      const gruposVisiveis = expandido ? grupos : grupos.slice(0, LARGURA_MAX);
      /**
       * A PILHA DE FOLHAS TAMBÉM PRECISA DE TETO.
       *
       * Eu tinha escrito que "folha desce, e descer é barato". É barato numa
       * fase — não na RAIZ. Na Revitalização Tasy há 12 itens pendurados
       * direto no projeto (4 marcos e 8 atividades soltas): 336px de pilha
       * ANTES da primeira fase, que empurrava todas elas para fora da tela.
       * O que se via ao abrir era uma coluna de marcos, não a estrutura.
       *
       * O teto é o mesmo dos agrupadores, e reusa o "▸ N ocultas" que já
       * existia. Quem quiser a lista inteira tem a aba Lista ao lado.
       */
      const folhasVisiveis = expandido ? folhas : folhas.slice(0, LARGURA_MAX);

      return {
        ...n,
        // A ordem aqui não importa — a renderização separa por papel.
        filhos: [...gruposVisiveis, ...folhasVisiveis].map((f) => podar(f, d + 1)),
        gruposOcultos: grupos.length - gruposVisiveis.length,
      };
    };
    return podar(exibida, 0);
  }, [exibida, colapsados, nivelMax, larguraAberta]);

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
      // Conta FOLHA oculta: é ela que ocupa mais uma linha na pilha. O
      // agrupador cortado pela largura vai para o lado, não para baixo.
      const oculto = n.todosFilhos.filter((f) => !agrupa(f.kind)).length > folhas ? 1 : 0;
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
      // O "+N fases" fica à DIREITA do pai, fora da caixa dele — sem somá-lo
      // aqui, o botão que revela o resto da árvore nasceria cortado na borda.
      maxX = Math.max(maxX, n.x + W / 2);
      // O "+N fases" fica à direita do ÚLTIMO FILHO (não do pai): sem somá-lo
      // aqui, o botão que revela o resto da árvore nasceria fora da moldura.
      if ((n.data.gruposOcultos ?? 0) > 0 && n.children?.length) {
        const ultimo = n.children[n.children.length - 1];
        maxX = Math.max(maxX, ultimo.x + W / 2 + GAP_X + (W - 40));
      }
      const folhas = n.data.filhos.filter((f) => !agrupa(f.kind)).length;
      const oculto = n.data.todosFilhos.filter((f) => !agrupa(f.kind)).length > folhas ? 1 : 0;
      maxY = Math.max(maxY, n.y + H_GRUPO + (folhas + oculto) * (H_FOLHA + GAP_Y) + 20);
    }
    const pad = 40;
    // A caixa vai de `-pad` até `maxY + pad`: a altura é `maxY + 2*pad`, com a
    // folga entrando uma vez em cada ponta. `maxY` já é medido a partir de 0
    // (o topo da raiz), então não há dupla contagem aqui.
    return { x: minX - pad, y: -pad, w: maxX - minX + pad * 2, h: maxY + pad * 2 };
  }, [layout]);

  /**
   * "Ajustar" = zoom 1 + pan zerado.
   *
   * Não é um cálculo de enquadramento: o `viewBox` já é a caixa envolvente
   * inteira, então zoom 1 JÁ mostra a árvore toda. Isso é possível porque o
   * corte de largura garante que ela cabe — antes dele, "caber" significava
   * comprimir 6.000px em 1.400px, com a fonte indo a 2,6px.
   *
   * Por isso o percentual ao lado não mede "quanto do real": mede quanto se
   * aproximou a partir do enquadramento completo.
   */
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
      {/**
        * TRILHA em LINHA PRÓPRIA, acima dos controles.
        *
        * Ela é a única coisa aqui que muda o tempo todo — um caminho de três
        * níveis empurrava os botões para a segunda linha e os fazia dançar a
        * cada clique. Separada, os controles ficam sempre no mesmo lugar.
        *
        * É trilha COMPLETA, não um botão de voltar: com o clique entrando na
        * fase, descer vira o gesto comum, e com um botão só a pessoa perde a
        * noção de onde está a partir do segundo nível. Aqui dá para saltar
        * direto para qualquer ponto, inclusive a raiz.
        */}
      {trilha.length > 0 && (
        <div className="flex items-center gap-0.5 flex-wrap pb-1.5 print:hidden">
            <Button
              size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs"
              onClick={() => setFoco(null)}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              {projectTitle}
            </Button>
            {trilha.slice(1).map((t) => (
              <span key={t.id} className="flex items-center gap-0.5">
                <span className="text-muted-foreground/50 text-xs">/</span>
                <Button
                  size="sm" variant="ghost" className="h-7 px-2 text-xs max-w-[140px] truncate"
                  onClick={() => setFoco(t.id)}
                >
                  {t.title}
                </Button>
              </span>
            ))}
          <span className="text-muted-foreground/50 text-xs">/</span>
          <span className="text-xs font-semibold px-1 max-w-[160px] truncate">{exibida.title}</span>
        </div>
      )}

      {/* Controles de VISÃO, agrupados por função: o que a árvore MOSTRA
          (nível), o TAMANHO dela (zoom, ajustar), e o que SAI dela (SVG,
          imprimir) — este último empurrado para a direita, porque exportar é
          o fim do trabalho, não parte de olhar. */}
      <div className="flex items-center gap-2 flex-wrap pb-2 print:hidden">
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
        <span className="w-px h-5 bg-border" />
        {/**
          * ZOOM VISÍVEL, não só Ctrl+roda.
          *
          * O zoom existia desde o começo, mas escondido num atalho — quem não
          * conhecesse o gesto não tinha como aproximar, e nada na tela dizia em
          * que nível o desenho estava. Um controle que ninguém encontra é o
          * mesmo que não existir.
          *
          * O percentual no meio não é enfeite: é o que responde "o que estou
          * vendo é o tamanho real?". Clicar nele volta a 100%.
          */}
        <div className="inline-flex items-center rounded-md border border-border overflow-hidden">
          <button
            type="button"
            title="Afastar"
            className="px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
            disabled={zoom <= ZOOM_MIN + 0.001}
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - 0.2))}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Voltar ao tamanho real"
            onClick={() => setZoom(1)}
            className="px-1.5 py-1 text-[11px] font-mono text-muted-foreground hover:bg-muted hover:text-foreground transition-colors min-w-[46px]"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            title="Aproximar"
            className="px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
            disabled={zoom >= ZOOM_MAX - 0.001}
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + 0.2))}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
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
            /**
             * Piso em 0,6 — antes era 0,2, abaixo da legibilidade.
             *
             * O título tem 11px e as folhas 9,5px: a 0,2 isso vira 2,2px e
             * 1,9px, que não é texto, é textura. O piso vai até onde o menor
             * texto ainda passa dos ~6px, e quem precisa ver o conjunto usa o
             * corte de largura ou a trilha — não o zoom.
             */
            setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * (e.deltaY < 0 ? 1.12 : 0.89))));
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
              /**
               * Conta só as FOLHAS que sobraram — `todosFilhos.length -
               * filhos.length` misturaria os agrupadores cortados pela largura,
               * que já têm o próprio "+N fases". O mesmo item apareceria nos
               * dois contadores.
               */
              const ocultos = d.todosFilhos.filter((f) => !agrupa(f.kind)).length - folhas.length;
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
                    /**
                     * CLIQUE ENTRA NA FASE; duplo clique abre a atividade.
                     *
                     * Estava invertido — o clique abria o painel e o duplo
                     * focava. Num projeto largo, navegar a árvore é o gesto
                     * que se repete dezenas de vezes, e abrir a atividade é o
                     * eventual; o gesto mais fácil tem que servir ao mais
                     * frequente. É o que o WBS Schedule Pro faz: "Focus" é a
                     * resposta dele para gráfico largo demais.
                     *
                     * Vale só para AGRUPADOR. Folha não tem no que entrar,
                     * então lá o clique abre direto (ver a renderização das
                     * folhas, mais abaixo).
                     */
                    onClick={(e) => { e.stopPropagation(); if (!ehProjeto) setFoco(d.id); }}
                    onDoubleClick={(e) => { e.stopPropagation(); if (!ehProjeto) onSelect?.(d.id); }}
                  >
                    {/**
                      * FASE e ENTREGA deixam de ter a mesma caixa.
                      *
                      * As duas eram desenhadas cinza idêntico, e a legenda
                      * dizia "Fase / Entrega" junto — então uma entrega (o que
                      * o PMBOK chama de pacote de trabalho) era indistinguível
                      * de uma fase. Foi o relato: "1.3.1 não é fase, é pacote".
                      *
                      * O papel já vinha certo de `resolveEapKind` — o nível do
                      * código manda, e 1.3.1 é nível 3, logo entrega. O que
                      * faltava era o DESENHO refletir isso.
                      *
                      * `lib/eapModel` explica por que a distinção importa: sem
                      * ela "a EAP fica achatada — a entrega deixa de estar
                      * dentro da fase e vira outra fase ao lado dela". Era
                      * exatamente o que a tela mostrava.
                      *
                      * FASE tem borda escura e fundo sólido (é etapa do ciclo
                      * de vida); ENTREGA é mais leve e recuada (está dentro de
                      * uma fase). A hierarquia se lê pelo peso, sem legenda.
                      */}
                    <rect
                      x={px} y={py} width={W} height={H_GRUPO} rx={7}
                      className={cn(
                        ehProjeto && "fill-primary/10 stroke-primary stroke-[1.4]",
                        !ehProjeto && d.kind === "fase" && "fill-muted stroke-foreground/40 stroke-[1.6]",
                        !ehProjeto && d.kind !== "fase" && "fill-background stroke-border stroke-[1.2]",
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
                    {/* O PAPEL, escrito. A cor sozinha exige decorar a legenda,
                        e num diagrama impresso em preto e branco ela some. */}
                    {!ehProjeto && (
                      <text x={px + W - 12} y={py + 16} textAnchor="end"
                        className={cn(
                          "uppercase",
                          d.kind === "fase" ? "fill-foreground/55" : "fill-muted-foreground/70",
                        )}
                        style={{ fontSize: 7.5, letterSpacing: "0.06em", fontWeight: 700 }}>
                        {EAP_LABELS[d.kind]}
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

                  {/* "+N fases" — os agrupadores que o corte de LARGURA deixou
                      de fora. Fica no eixo dos agrupadores (à direita do
                      último), não na pilha de folhas: é irmão deles, e pô-lo
                      embaixo sugeriria que está dentro do pai.
                      Sem isto, um pai com 30 fases desenhava 6.000px. */}
                  {/**
                    * "+N fases" ao lado do ÚLTIMO FILHO, não do pai.
                    *
                    * Estava ancorado em `px` — a caixa do próprio pai — e o pai
                    * fica CENTRADO sobre os filhos, não à esquerda deles. Na
                    * raiz o resultado era o botão sobrepondo o nome do projeto,
                    * enquanto as fases apareciam bem mais abaixo.
                    *
                    * Ancorar no último filho põe o botão onde ele significa
                    * algo: no fim da fileira que ele continua.
                    */}
                  {(d.gruposOcultos ?? 0) > 0 && n.children && n.children.length > 0 && (() => {
                    const ultimo = n.children[n.children.length - 1];
                    const bx = ultimo.x + W / 2 + GAP_X;
                    const by = ultimo.y + 4;
                    return (
                      <g className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLarguraAberta((prev) => new Set(prev).add(d.id));
                        }}>
                        <rect
                          x={bx} y={by}
                          width={W - 40} height={H_GRUPO - 8} rx={7}
                          className="fill-primary/10 stroke-primary" strokeDasharray="4 3" strokeWidth={1.3} />
                        <text
                          x={bx + (W - 40) / 2} y={by + (H_GRUPO - 8) / 2 + 4}
                          textAnchor="middle" className="fill-primary font-semibold" style={{ fontSize: 11 }}>
                          + {d.gruposOcultos} {d.gruposOcultos === 1 ? "fase" : "fases"}
                        </text>
                      </g>
                    );
                  })()}
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
          <span className="w-2.5 h-2.5 rounded-sm bg-muted border-[1.5px] border-foreground/40" /> Fase
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-background border border-border" /> Entrega
        </span>
        <span className="inline-flex items-center gap-1.5">
          {/* Barra deitada e menor: no desenho, atividade é a caixa estreita
              que desce empilhada, enquanto entrega é a caixa larga que fica na
              fileira. O swatch imita essa diferença de forma — sem isso os
              dois seriam quadrados iguais na legenda. */}
          <span className="w-3.5 h-2 rounded-[2px] bg-background border border-border" /> Atividade
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-warning/20 border border-warning rotate-45" /> Marco
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-destructive/10 border border-dashed border-destructive" />
          Fora da árvore
        </span>
        <span className="ml-auto">Clique na fase entra nela · duplo clique abre · arraste move · Ctrl+roda dá zoom</span>
      </div>
    </div>
  );
}
