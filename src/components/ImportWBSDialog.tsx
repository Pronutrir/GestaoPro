'use client';
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Layers, Circle, Diamond, ClipboardList, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Modelo interno: cada nó da árvore importada com seu papel EAP.      */
/* ------------------------------------------------------------------ */
type EapRole = "fase" | "atividade" | "marco";
interface TreeNode {
  code: string;          // 1, 1.1, 1.1.2...
  title: string;
  depth: number;         // 1 = topo
  role: EapRole;         // resolvido por posição + palavra-chave
  parentCode: string | null;
}

interface ImportWBSDialogProps {
  projectId: string;
  onDataChanged: () => void;
}

const ROLE_META: Record<EapRole, { label: string; short: string; icon: JSX.Element; cls: string }> = {
  fase:      { label: "Fase/Entrega", short: "Fase",  icon: <Layers className="w-3 h-3" />,  cls: "bg-primary/10 text-primary border-primary/30" },
  atividade: { label: "Atividade",    short: "Ativ.", icon: <Circle className="w-3 h-3" />,  cls: "bg-muted text-muted-foreground border-border" },
  marco:     { label: "Marco",        short: "Marco", icon: <Diamond className="w-3 h-3" />,  cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
};

const isMilestoneTitle = (t: string) =>
  /(^|\s)(marco|milestone)(\s|:|$)/i.test(t) || /🏁|\[m\]/i.test(t);

/* ------------------------------------------------------------------ */
/*  Parser FLEXÍVEL: aceita código numérico (1.2.3), bullets (• - – *)  */
/*  e indentação por espaços/tabs. Sempre produz uma hierarquia com     */
/*  códigos normalizados (1, 1.1, 1.1.2...).                            */
/* ------------------------------------------------------------------ */
const parseFlexible = (text: string): TreeNode[] => {
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
      const parts = r.explicitCode.split(".");
      const depth = parts.length;
      const parentCode = depth > 1 ? parts.slice(0, depth - 1).join(".") : null;
      nodes.push({ code: r.explicitCode, title: r.title, depth, role: "atividade", parentCode });
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

  // 2) Resolve o PAPEL EAP (modelo unificado, profundidade livre):
  //    - QUALQUER nó com filhos = Fase/Entrega (agrupa, em qualquer nível)
  //    - folha: marco se o título indicar; senão atividade
  const hasChildren = new Set(nodes.map((n) => n.parentCode).filter(Boolean) as string[]);
  for (const n of nodes) {
    if (hasChildren.has(n.code)) n.role = "fase";
    else if (isMilestoneTitle(n.title)) n.role = "marco";
    else n.role = "atividade";
  }

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

  const tree = useMemo(() => parseFlexible(text), [text]);
  const counts = useMemo(() => {
    const c = { fase: 0, atividade: 0, marco: 0 };
    tree.forEach((n) => { c[n.role]++; });
    return c;
  }, [tree]);

  const resetAndClose = () => { setText(""); setSelectedTemplate(null); setTab("paste"); setOpen(false); };

  const pickTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setSelectedTemplate(id);
    setText(t.text);
  };

  const handleImport = async () => {
    if (tree.length === 0) return;
    setImporting(true);
    try {
      // Nível 1 agrupador = "fase do projeto" (tabela phases). Agrupadores
      // ANINHADOS (fase em profundidade > 1) viram activities com item_type='fase'
      // — Fase/Entrega vive na árvore de atividades em qualquer nível.
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

      const phaseIdMap: Record<string, string> = {};
      for (const phase of phases) {
        const { data, error } = await supabase.from("phases").insert({
          project_id: projectId,
          // Título limpo: o código vive em wbs_code. Concatenar os dois gravava
          // a numeração dentro do texto, então renumerar a EAP exigiria reescrever
          // o título de cada item à mão.
          title: phase.title,
          display_order: phaseOrder++,
          wbs_code: phase.code,
        }).select("id").single();
        if (error) throw error;
        phaseIdMap[phase.code] = data.id;
      }

      const codeIdMap: Record<string, string> = {};
      const phaseOrderCounter: Record<string, number> = {};
      const findPhaseId = (node: TreeNode): string | null => {
        const parts = node.code.split(".");
        for (let len = parts.length - 1; len >= 1; len--) {
          const ancestor = parts.slice(0, len).join(".");
          if (phaseIdMap[ancestor]) return phaseIdMap[ancestor];
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

        // Agrupador aninhado = 'fase'; marco/atividade = 'atividade' (folha).
        const itemType = node.role === "fase" ? "fase" : "atividade";
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
          // Nasce no Backlog, pendente — igual a criação manual (segue o fluxo).
          workflow_stage_id: backlogStageId,
          status: "pending",
        };

        let res = await supabase.from("activities").insert(basePayload).select("id").single();
        if (res.error && /item_type/i.test(res.error.message) && itemType === "fase") {
          pacoteUnsupported = true;
          res = await supabase.from("activities").insert({ ...basePayload, item_type: "atividade" }).select("id").single();
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
      toast({
        title: "EAP importada!",
        description: `${counts.fase} fase(s)/entrega(s), ${counts.atividade} atividade(s) e ${counts.marco} marco(s) criados.`,
      });
      resetAndClose();
      onDataChanged();
    } catch (error) {
      console.error("Erro ao importar EAP:", error);
      toast({ title: "Erro ao importar EAP", variant: "destructive" });
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
            Cole sua estrutura em qualquer formato ou comece de um modelo.
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
              <Textarea
                value={text}
                onChange={(e) => { setText(e.target.value); setSelectedTemplate(null); }}
                className="flex-1 min-h-0 resize-none font-mono text-[13px] leading-relaxed"
                placeholder={"1. Fase\n1.1 Entrega\n1.1.1 Atividade\n\nou com bullets e recuo:\n• Fase\n   - Atividade"}
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
                <button
                  type="button"
                  onClick={resetAndClose}
                  className="w-full flex items-center gap-3 text-left border border-dashed rounded-lg p-3 hover:bg-muted/50"
                >
                  <span className="w-9 h-9 rounded-md bg-muted flex items-center justify-center text-lg shrink-0">📄</span>
                  <span>
                    <span className="block text-[13px] font-medium">EAP em branco</span>
                    <span className="block text-xs text-muted-foreground">Montar item a item no Backlog</span>
                  </span>
                </button>
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
                {tree.map((n) => (
                  <div key={n.code} className="flex items-center gap-2.5 py-1" style={{ paddingLeft: (n.depth - 1) * 20 }}>
                    <span className={cn("inline-flex items-center text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border shrink-0", ROLE_META[n.role].cls)}>
                      {ROLE_META[n.role].short}
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground shrink-0">{n.code}</span>
                    <span className="text-[13px] truncate">{n.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Rodapé: contadores + ações (sempre visível) */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-3.5 border-t bg-muted/30 shrink-0">
          {tree.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <CountBadge role="fase" n={counts.fase} />
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
              {importing ? "Importando..." : `Importar ${tree.length} ${tree.length === 1 ? "item" : "itens"}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
