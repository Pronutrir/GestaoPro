'use client';
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Layers, Circle, Diamond, ClipboardList, FileText, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  splitColumns, pareceCabecalho, detectarColunas, lerLinha, statusPorDatas,
  type ColValues,
} from "@/lib/wbsColumns";

/* ------------------------------------------------------------------ */
/*  Modelo interno: cada nó da árvore importada com seu papel EAP.      */
/* ------------------------------------------------------------------ */
type EapRole = "fase" | "entrega" | "atividade" | "marco";
interface TreeNode {
  code: string;          // 1, 1.1, 1.1.2...
  title: string;
  depth: number;         // 1 = topo
  role: EapRole;         // resolvido por posição + palavra-chave
  parentCode: string | null;
  /** Datas, horas, custo e responsável lidos das colunas da planilha. */
  vals?: ColValues;
}

interface ImportWBSDialogProps {
  projectId: string;
  onDataChanged: () => void;
}

const ROLE_META: Record<EapRole, { label: string; short: string; icon: JSX.Element; cls: string }> = {
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

const isMilestoneTitle = (t: string) =>
  /(^|\s)(marco|milestone)(\s|:|$)/i.test(t) || /🏁|\[m\]/i.test(t);

/**
 * Papel de cada nó. Duas perguntas independentes, que antes estavam coladas:
 *
 *   NÍVEL   diz o que o item É na EAP. Só o nível 1 é Fase — "1.1" não é outra
 *           fase, é uma ENTREGA dentro da fase 1.
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
 * Quem tem filhos NUNCA é marco, mesmo com "Milestone" no título — marco é
 * ponto no tempo e não agrupa. EAPs reais usam "Milestone 1 - Lançamento" como
 * nome da FASE, e tratar isso como marco quebrava o agrupamento inteiro: no
 * Backlog e no Cronograma os filhos ficavam sem pai visível.
 */
const aplicarPapeis = (nodes: TreeNode[]) => {
  const temFilhos = new Set(nodes.map((n) => n.parentCode).filter(Boolean) as string[]);
  for (const n of nodes) {
    if (n.depth === 1) n.role = "fase";
    else if (temFilhos.has(n.code)) n.role = "entrega";
    else if (isMilestoneTitle(n.title)) n.role = "marco";
    else n.role = "atividade";
  }
};

/* ------------------------------------------------------------------ */
/*  Parser FLEXÍVEL: aceita código numérico (1.2.3), bullets (• - – *)  */
/*  e indentação por espaços/tabs. Sempre produz uma hierarquia com     */
/*  códigos normalizados (1, 1.1, 1.1.2...).                            */
/* ------------------------------------------------------------------ */
const parseFlexible = (text: string): TreeNode[] => {
  // MODO PLANILHA: quando vem com TAB, as colunas são lidas antes de tudo.
  // Sem isto o TAB virava espaço e datas/horas entravam no TÍTULO — a
  // informação não era só perdida, sujava o nome da tarefa.
  const grid = splitColumns(text);
  if (grid) {
    const temCab = pareceCabecalho(grid[0]);
    const roles = detectarColunas(grid, temCab);
    const corpo = temCab ? grid.slice(1) : grid;
    const linhas = corpo
      .map((row) => ({ vals: lerLinha(row, roles), row }))
      .filter((x) => (x.vals.titulo || "").trim().length > 0);

    const nodes: TreeNode[] = [];
    for (const { vals } of linhas) {
      if (!vals.codigo) continue; // sem código não há como posicionar na árvore
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
    return nodes;
  }

  const rawLines = text.split("\n").map((l) => l.replace(/\t/g, "  ")).filter((l) => l.trim().length > 0);
  if (rawLines.length === 0) return [];

  // Aceita "1.1 Título", "1.1. Título", "1.1) Título" e "1.1 - Título".
  // O separador opcional depois do código evita que uma EAP colada do Word,
  // que costuma usar ")" ou "-", deixe de ser reconhecida como numerada.
  const numRe = /^\s*(\d+(?:\.\d+)*)\s*[.)]?\s*[-–—]?\s+(.+)$/;

  type Raw = { indent: number; title: string; explicitCode: string | null };
  const raws: Raw[] = rawLines.map((line) => {
    const indent = line.length - line.trimStart().length;
    let body = line.trim();
    let explicitCode: string | null = null;
    const m = body.match(numRe);
    if (m) { explicitCode = m[1]; body = m[2].trim(); }
    // remove marcadores de bullet no início
    body = body.replace(/^[•\-–—*•]+\s*/, "").trim();
    return { indent, title: body, explicitCode };
  }).filter((r) => r.title.length > 0);

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
        if (prev) prev.title = `${prev.title} ${r.title}`.trim();
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
    nodes.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
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
      const code = parentCode ? `${parentCode}.${siblingIndex}` : String(siblingIndex);
      const level = stack.length + 1;
      nodes.push({ code, title: r.title, depth: level, role: "atividade", parentCode });
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

  return nodes;
};

/* ------------------------------------------------------------------ */
/*  Modelos por tipo de projeto (para quem não tem EAP pronta).        */
/* ------------------------------------------------------------------ */
const TEMPLATES: { id: string; emoji: string; name: string; desc: string; text: string }[] = [
  {
    id: "sistema", emoji: "💻", name: "Implantação de sistema",
    desc: "Descoberta · Desenvolvimento · Homologação · Go-live",
    text: `1. Descoberta e Requisitos
1.1 Levantamento de requisitos
1.1.1 Entrevistar áreas
1.1.2 Mapear processos atuais
1.1.3 Marco: Requisitos aprovados
2. Desenvolvimento
2.1 Modelagem e arquitetura
2.2 Construção
2.2.1 Desenvolver módulo principal
2.2.2 Integrações
3. Homologação
3.1 Testes com usuários
3.2 Ajustes finais
4. Go-live
4.1 Plano de implantação
4.2 Treinamento
4.3 Marco: Sistema em produção`,
  },
  {
    id: "campanha", emoji: "📣", name: "Campanha de marketing",
    desc: "Briefing · Criação · Veiculação · Análise",
    text: `1. Briefing e Planejamento
1.1 Definir objetivo e público
1.2 Definir orçamento
1.3 Marco: Briefing aprovado
2. Criação
2.1 Conceito e mensagem
2.2 Produção de peças
3. Veiculação
3.1 Configurar canais
3.2 Publicar e monitorar
4. Análise
4.1 Coletar métricas
4.2 Relatório de resultados`,
  },
  {
    id: "processo", emoji: "🔧", name: "Melhoria de processo",
    desc: "Diagnóstico · Redesenho · Piloto · Rollout",
    text: `1. Diagnóstico
1.1 Mapear processo atual (AS-IS)
1.2 Identificar gargalos
2. Redesenho
2.1 Desenhar processo futuro (TO-BE)
2.2 Validar com áreas
2.3 Marco: Novo processo aprovado
3. Piloto
3.1 Executar piloto
3.2 Avaliar resultados
4. Rollout
4.1 Treinar equipes
4.2 Implantar em toda a operação`,
  },
];

export const ImportWBSDialog = ({ projectId, onDataChanged }: ImportWBSDialogProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"paste" | "template">("paste");
  const [text, setText] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

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

  const tree = useMemo(() => parseFlexible(text), [text]);
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

  const resetAndClose = () => { setText(""); setSelectedTemplate(null); setTab("paste"); setOpen(false); };

  const pickTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setSelectedTemplate(id);
    setText(t.text);
    // Volta para "Colar texto" ao escolher um modelo: é lá que o texto fica
    // visível e editável. Ficar na aba de modelos escondia o que havia sido
    // carregado — a pessoa via só um "✓" e não percebia que ainda faltava
    // confirmar em "Importar N itens", então parecia que nada acontecia.
    setTab("paste");
  };

  const handleImport = async () => {
    if (tree.length === 0) return;
    setImporting(true);
    try {
      // Nível 1 agrupador = "fase do projeto" (tabela phases). Agrupadores
      // Com a regra por nível, "fase" só existe em depth 1 — os filtros abaixo
      // são equivalentes a depth===1 / depth>1, e ficam explícitos assim.
      const phases = tree.filter((n) => n.role === "fase" && n.depth === 1);
      const nonPhase = tree.filter((n) => !(n.role === "fase" && n.depth === 1));

      const { data: existingPhases } = await supabase
        .from("phases").select("display_order")
        .eq("project_id", projectId).order("display_order", { ascending: false }).limit(1);
      let phaseOrder = (existingPhases?.[0]?.display_order ?? 0) + 1;

      // Coluna "Backlog" do fluxo (display_order 0): itens importados nascem lá,
      // como os criados manualmente — assim seguem o mesmo fluxo (Kanban/status).
      const { data: stagesData } = await supabase
        .from("workflow_stages").select("id, display_order")
        .eq("project_id", projectId).order("display_order", { ascending: true });
      const backlogStageId =
        stagesData?.find((s) => s.display_order === 0)?.id ?? stagesData?.[0]?.id ?? null;
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
        const { data: jaExistem } = await supabase
          .from("phases")
          .select("id, title, wbs_code")
          .eq("project_id", projectId)
          .eq("is_trashed", false);

        for (const f of ((jaExistem as any[]) || [])) {
          const codigo =
            (f.wbs_code || "").trim() ||
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
        const parts = node.code.split(".");
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

        // Fase e Entrega gravam igual — os dois agrupam, e o trigger só aceita
        // 'fase'/'pacote' como pai. A diferença entre elas é o NÍVEL, lido do
        // wbs_code na hora de exibir, não um valor distinto no banco.
        const itemType = (node.role === "fase" || node.role === "entrega") ? "fase" : "atividade";
        const basePayload: any = {
          project_id: projectId,
          // Idem às fases: título limpo, código em wbs_code.
          title: node.title,
          phase_id: phaseId,
          parent_id: parentId,
          display_order: phaseOrderCounter[phaseKey]++,
          wbs_code: node.code,
          item_type: itemType,
          is_milestone: node.role === "marco",
          // Nasce no Backlog — igual a criação manual (segue o fluxo).
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
        if (res.error && /item_type/i.test(res.error.message) && itemType === "fase") {
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

  const CountBadge = ({ role, n }: { role: EapRole; n: number }) => (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full border", ROLE_META[role].cls)}>
      {ROLE_META[role].icon} {n} {ROLE_META[role].label.toLowerCase()}{n === 1 ? "" : "s"}
    </span>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : resetAndClose())}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2 h-9">
          <Upload className="w-4 h-4" /> Importar EAP
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl w-[94vw] h-[82vh] overflow-hidden p-0 gap-0 flex flex-col">
        {/* Cabeçalho enxuto */}
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="text-base font-semibold">Importar EAP</DialogTitle>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Cole sua estrutura em qualquer formato ou comece de um modelo.{" "}
            <span className="text-foreground">
              Nível 1 vira Fase; do 1.1 em diante, Entrega se tiver subitens ou Atividade se não tiver.
            </span>{" "}
            Colando de planilha, as colunas de data, horas e responsável são reconhecidas.
          </p>
        </DialogHeader>

        {/* Abas segmentadas */}
        <div className="flex items-center gap-1 px-6 pt-3 shrink-0">
          {([["paste", "Colar texto", <ClipboardList key="i" className="w-4 h-4" />],
             ["template", "Usar modelo", <FileText key="i" className="w-4 h-4" />]] as const).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-2 text-[13px] px-3 py-1.5 rounded-md transition-colors",
                tab === id ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Corpo: cresce e rola internamente; footer fica ancorado */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-t mt-3 flex-1 min-h-0">
          {/* Entrada */}
          <div className="p-6 md:border-r flex flex-col min-h-0">
            {tab === "paste" ? (
              // textarea nativa: o wrapper de UI força whiteSpace/overflowWrap
              // inline e reajusta altura no onChange, o que atrapalhava a
              // digitação e a colagem neste campo (que é monoespaçado, de
              // muitas linhas e vive dentro de um flex com min-h-0).
              // `h-full` explícito: com `flex-1 min-h-0` a altura colapsava a
              // zero e o campo ficava sem área clicável.
              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); setSelectedTemplate(null); }}
                spellCheck={false}
                autoFocus
                className="h-full w-full min-h-[240px] resize-none rounded-md border border-input bg-muted/50 px-3 py-2 font-mono text-[13px] leading-relaxed ring-offset-background placeholder:text-muted-foreground focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                placeholder={[
                  "1. Planejamento          ← nível 1 é Fase",
                  "1.1 Levantar requisitos  ← agrupa: vira Entrega",
                  "1.1.1 Entrevistar área   ← folha: vira Atividade",
                  "1.2 Aprovar escopo       ← folha: vira Atividade",
                  "2. Execução",
                  "2.1 Desenvolver",
                  "",
                  "ou com bullets e recuo:",
                  "• Planejamento",
                  "   - Levantar requisitos",
                ].join("\n")}
              />
            ) : (
              <div className="overflow-y-auto space-y-2 -mx-1 px-1">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pickTemplate(t.id)}
                    className={cn(
                      "w-full flex items-center gap-3 text-left border rounded-lg p-3 transition-colors",
                      selectedTemplate === t.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                    )}
                  >
                    <span className="w-9 h-9 rounded-md bg-muted flex items-center justify-center text-lg shrink-0">{t.emoji}</span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">{t.name}</span>
                      <span className="block text-xs text-muted-foreground truncate">{t.desc}</span>
                    </span>
                    {selectedTemplate === t.id && <span className="ml-auto text-primary text-sm">✓</span>}
                  </button>
                ))}
                {/* Não é uma opção de importação: só fecha o diálogo. Estava
                    com a mesma aparência dos modelos acima, então clicar nele
                    parecia escolher um modelo — o modal fechava, nada era
                    criado e nada explicava o porquê. Agora é texto com um link,
                    não mais um cartão irmão dos modelos. */}
                <p className="text-xs text-muted-foreground pt-1">
                  Prefere montar item a item?{" "}
                  <button
                    type="button"
                    onClick={resetAndClose}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    Feche e use “Nova Atividade”
                  </button>
                  .
                </p>
              </div>
            )}
          </div>

          {/* Pré-visualização em árvore */}
          <div className="p-6 flex flex-col min-h-0">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3 shrink-0">
              Pré-visualização
            </div>
            {tree.length === 0 ? (
              <div className="flex-1 flex items-center justify-center border border-dashed rounded-lg text-center text-[13px] text-muted-foreground px-6">
                A árvore aparece aqui conforme você cola o texto ou escolhe um modelo.
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-1 -mx-1 px-1">
                {tree.map((n) => {
                  // Ancestral inventado pelo parser (o texto começou em "1.2",
                  // então o "1" foi criado para a árvore não ficar quebrada).
                  const inventado = n.title.startsWith("(sem título)");
                  const jaExiste = inventado ? faseExistente(n.code) : null;
                  return (
                  <div key={n.code} className="flex items-center gap-2.5 py-1" style={{ paddingLeft: (n.depth - 1) * 20 }}>
                    <span className={cn("inline-flex items-center text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border shrink-0", ROLE_META[n.role].cls)}>
                      {ROLE_META[n.role].short}
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground shrink-0">{n.code}</span>
                    {/* A fase JÁ EXISTE: mostra o título real e avisa que será
                        reaproveitada. Antes dizia "(sem título) 1" e prometia
                        uma fase nova que a importação não cria — ela reaproveita
                        a existente. */}
                    {jaExiste ? (
                      <>
                        <span className="text-[13px] truncate">{jaExiste}</span>
                        <span className="text-[10px] shrink-0 px-1.5 py-0.5 rounded border border-success/40 bg-success/5 text-success">
                          já existe · será reaproveitada
                        </span>
                      </>
                    ) : inventado ? (
                      <>
                        <span className="text-[13px] truncate text-muted-foreground italic">sem título</span>
                        <span className="text-[10px] shrink-0 px-1.5 py-0.5 rounded border border-warning/40 bg-warning/5 text-warning"
                              title={`O código ${n.code} não estava no texto colado, mas "${tree.find((x) => x.parentCode === n.code)?.code ?? ""}" precisa dele. Será criada sem título.`}>
                          criada automaticamente
                        </span>
                      </>
                    ) : (
                      <span className="text-[13px] truncate">{n.title}</span>
                    )}
                    {/* O que veio das colunas: conferir aqui evita descobrir
                        que a data entrou errada só depois de importar. */}
                    {n.vals && (
                      <span className="ml-auto flex items-center gap-1.5 shrink-0 text-[10px] text-muted-foreground">
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

        {/* Rodapé: contadores + ações (sempre visível) */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-3.5 border-t bg-muted/30 shrink-0">
          {tree.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <CountBadge role="fase" n={counts.fase} />
              {counts.entrega > 0 && <CountBadge role="entrega" n={counts.entrega} />}
              <CountBadge role="atividade" n={counts.atividade} />
              {counts.marco > 0 && <CountBadge role="marco" n={counts.marco} />}
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
