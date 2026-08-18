'use client';
import { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from "react";
import { DateField } from "@/components/ui/date-field";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { CharterFlowPanel, type CharterStatus } from "@/components/charter/CharterFlowPanel";
import { OrigemDemanda } from "@/components/charter/OrigemDemanda";
import {
  FileText, Save, ClipboardList, CheckCircle2, Ban, FileDown, Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AIAssistButton, AIContext } from "@/components/AIAssistButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PriorityBadge } from "@/components/PriorityBadge";
import { BaselineBlock } from "@/components/BaselineBlock";
import { cn } from "@/lib/utils";
import {
  sugerirCampos, sugerirAprovadores, entregasDaEap, orcamentoAutorizado,
  completude as completudeEssencial,
  ORIGEM_LABEL, ORIGEM_DETALHE,
  type Sugestao, type FontePremissa, type FonteBaseline,
} from "@/lib/charterAutofill";

/* -------- AutoTextarea: cresce conforme conteúdo -------- */
const AutoTextarea = ({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <Textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={1}
      className={`text-sm resize-none min-h-[2rem] py-1.5 leading-snug overflow-hidden ${className || ""}`}
    />
  );
};

interface Phase { id: string; title: string }
interface Risk { id: string; description: string; probability: string; impact: string; status: string }
interface MemberRow {
  id: string;
  user_id: string;
  full_name: string;
  sector: string | null;
  invitation_status: "pending" | "accepted" | "declined";
  decline_reason: string | null;
  /** Papel na matriz RACI (seção 8). Rótulo de governança, não permissão. */
  raci?: string | null;
}

/**
 * R executa · A aprova (só um) · C é consultado · I acompanha.
 *
 * Veio de EditProjectDialog junto com o seletor: a matriz é editada aqui, no
 * documento que a usa, e não na ficha da equipe. Ver o comentário da seção 8.
 *
 * É RÓTULO, não permissão — não concede nem tira acesso a nada. Quem decide
 * acesso são as colunas `can_*` de project_members (lib/projectRoles.ts).
 * Nenhum dos 10 produtos de mercado pesquisados usa rótulo de governança como
 * mecanismo de acesso, e o PMBOK define RACI como matriz de comunicação.
 */
const RACI_OPCOES: { v: "R" | "A" | "C" | "I"; hint: string }[] = [
  { v: "R", hint: "Responsável — executa" },
  { v: "A", hint: "Aprova — aval final (só um por projeto)" },
  { v: "C", hint: "Consultado — opina antes da decisão" },
  { v: "I", hint: "Informado — só acompanha" },
];
const inviteBadge = (s: MemberRow["invitation_status"]) => {
  if (s === "accepted") return { label: "Aceito", cls: "bg-success/15 text-success border-success/40" };
  if (s === "declined") return { label: "Recusado", cls: "bg-destructive/15 text-destructive border-destructive/40" };
  return { label: "Aguardando", cls: "bg-warning/15 text-warning border-warning/40 animate-pulse" };
};

interface ProjectCharterProps {
  projectId: string;
  project: {
    title: string;
    description: string | null;
    owner: string | null;
    due_date: string | null;
    start_date?: string | null;
    status: string;
    priority?: string | null;
    objective?: string | null;
    problem_statement?: string | null;
    scope?: string | null;
    out_of_scope?: string | null;
    restrictions?: string | null;
    expected_benefits?: string | null;
    budget_planned?: number | null;
  };
  phases: Phase[];
  members: { full_name: string; sector: string | null }[];
  onMembersChanged?: () => void;
  /** Leva a outra aba do projeto. Alimenta os "próximos passos" que aparecem
   *  quando o TAP é aprovado — o documento destrava o trabalho em vez de
   *  terminar em si mesmo. */
  onIrPara?: (aba: string) => void;
}

interface CharterData {
  sponsor: string;
  manager: string;            // gerente do projeto (PMBOK)
  authority: string;          // nível de autoridade do gerente
  start_date: string;
  justification: string;
  assumptions: string;        // premissas (recuperado)
  constraints: string;        // restrições (premissas & restrições)
  // objetivo SMART
  smart_specific?: string;
  smart_measurable?: string;
  smart_achievable?: string;
  smart_relevant?: string;
  smart_temporal?: string;
  approvals?: { role: string; name: string; date: string }[];
  code?: string;
  benefits_table?: { benefit: string; indicator: string; goal: string; deadline: string }[];
  // aprovação formal (trava)
  approved_at?: string | null;
  approved_by?: string | null;
  approved_by_name?: string | null;
}

/* -------- TextField -------- */
interface TextFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
  rows?: number;
  aiContext?: AIContext;
  editing: boolean;
  className?: string;
}
const TextField = ({
  value, onChange, placeholder, multiline = true, rows = 3, aiContext, editing, className,
}: TextFieldProps) => {
  if (editing) {
    return multiline ? (
      <div className="relative">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={`text-sm resize-none ${aiContext ? "pr-10" : ""} ${className || ""}`}
        />
        {aiContext && (
          <div className="absolute top-1 right-1">
            <AIAssistButton value={value} onChange={onChange} context={aiContext} size="icon" />
          </div>
        )}
      </div>
    ) : (
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`text-sm ${className || ""}`} />
    );
  }
  return value ? (
    <p className={`text-sm text-foreground whitespace-pre-line ${className || ""}`}>{value}</p>
  ) : (
    <p className="text-sm text-muted-foreground italic">—</p>
  );
};

/**
 * Seção do TAP — uma LINHA que expande, não um cartão.
 *
 * Antes cada seção era um Card com cabeçalho, borda e espaçamento próprios.
 * Seção vazia ocupava a mesma altura de uma cheia: o TAP anunciava o vazio em
 * tamanho real, e o olho percorria seis blocos para descobrir que cinco não
 * tinham nada. Agora a vazia é uma linha de 40px.
 *
 * Abre por padrão o que tem conteúdo; o que está em branco fica fechado com
 * um "+ preencher" — o mesmo dado que antes acusava ("em branco") agora
 * convida. Na impressão tudo aparece aberto: o PDF é o documento.
 */
const SectionBlock = ({ n, title, children, status, editing }: {
  n: number; title: string; children: React.ReactNode;
  status?: { preenchidos: number; total: number };
  /** Editando, tudo abre: seção fechada seria campo impossível de preencher. */
  editing?: boolean;
}) => {
  const vazia = !!status && status.preenchidos === 0;
  const completa = !!status && status.preenchidos === status.total;
  // null = ninguém clicou ainda, então segue o conteúdo: fechada se vazia.
  // Guardar só `useState(!vazia)` congelaria a decisão na primeira renderização
  // — a seção continuaria fechada mesmo depois de preenchida.
  const [manual, setManual] = useState<boolean | null>(null);
  const aberta = editing || (manual ?? !vazia);
  const setAberta = (fn: (v: boolean) => boolean) => setManual(fn(aberta));

  return (
    // scroll-mt: o cabeçalho da página é fixo, e sem a margem o índice levava
    // a seção para debaixo dele.
    <div id={`tap-secao-${n}`} className="border-b border-border last:border-b-0 print:break-inside-avoid scroll-mt-24">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors print:hidden"
      >
        <span className="text-[10px] text-muted-foreground w-2.5 shrink-0">{aberta ? "▾" : "▸"}</span>
        <span className={cn(
          "w-5 h-5 rounded text-[10.5px] font-bold font-mono flex items-center justify-center shrink-0",
          vazia ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
        )}>{n}</span>
        <span className={cn("flex-1 min-w-0 text-[13.5px] truncate", vazia ? "text-muted-foreground" : "font-medium")}>
          {title}
        </span>
        {status && (
          <span className={cn(
            "text-[11px] font-mono tabular-nums shrink-0",
            vazia ? "text-primary" : completa ? "text-success" : "text-warning",
          )}>
            {/* "+ preencher" em vez de "em branco": mesma informação, mas
                acionável — a linha vira o convite para escrever. */}
            {vazia ? "+ preencher" : completa ? `✓ ${status.total}` : `${status.preenchidos} de ${status.total}`}
          </span>
        )}
      </button>

      {/* Cabeçalho só da impressão — o botão some no PDF. */}
      <div className="hidden print:flex items-center gap-3 px-4 py-2 bg-primary/10 border-b border-primary/20">
        <span className="text-xs font-bold bg-primary/15 text-primary rounded px-2 py-0.5">{n}</span>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">{title}</h3>
      </div>

      <div className={cn("px-4 pb-4 pt-1 space-y-3", aberta ? "" : "hidden print:block")}>
        {children}
      </div>
    </div>
  );
};

/**
 * O TAP abria com 7 seções e ~20 campos vazios de uma vez. Medido em
 * 02/08/2026: 13 desses campos tinham 0% de preenchimento nos 52 projetos —
 * não por desleixo, mas porque pedir tudo na abertura contraria o próprio
 * PMBOK, em que o TAP AUTORIZA e o plano detalha.
 *
 * Agora abre com o essencial e o resto fica atrás de "Detalhar o TAP".
 * Nada é removido: só muda o que já vem aberto. Nenhum campo vira
 * obrigatório — o TAP informa o que falta e deixa seguir.
 */
const preenchido = (v: unknown) =>
  Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim());

/** Nomes curtos das seções, para o aviso "Em branco: …" caber numa linha. */
const SECAO_NOMES: Record<number, string> = {
  2: "Identificação",
  3: "Problema",
  4: "Objetivo SMART",
  5: "Escopo",
  6: "Premissas",
  7: "Benefícios",
  // A matriz RACI entra no índice porque tem contagem própria (quantos membros
  // já têm papel). Aprovações (9) continua fora: não é campo a preencher, é
  // assinatura — e assinatura não se mede em "3 de 4".
  8: "RACI",
};

/**
 * Índice das seções, com o estado de cada uma.
 *
 * O TAP tem 8 seções e rola. Para saber o que falta era preciso descer a
 * página inteira abrindo cada bloco fechado — o "Detalhar o TAP" escondia sem
 * responder onde estava o buraco.
 *
 * Aqui o estado de todas cabe num olhar: cheia, parcial, vazia. Clicar leva à
 * seção. Some na impressão, como o resto do andaime: o PDF é o documento.
 */
const IndiceSecoes = ({ porSecao }: { porSecao: Record<number, { preenchidos: number; total: number }> }) => {
  const irPara = (n: number) => {
    document.getElementById(`tap-secao-${n}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <nav className="print:hidden flex flex-wrap gap-1.5" aria-label="Seções do TAP">
      {Object.entries(SECAO_NOMES).map(([k, nome]) => {
        const n = Number(k);
        const st = porSecao[n];
        const vazia = !st || st.preenchidos === 0;
        const cheia = st && st.preenchidos === st.total;
        return (
          <button
            key={n}
            type="button"
            onClick={() => irPara(n)}
            title={st ? `${st.preenchidos} de ${st.total} campos` : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 h-6 px-2 rounded-full border text-[11.5px] transition-colors",
              cheia && "border-success/40 bg-success/5 text-success hover:bg-success/10",
              !cheia && !vazia && "border-warning/40 bg-warning/5 text-warning hover:bg-warning/10",
              vazia && "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {/* Ponto cheio, meio ou vazio: a forma diz o estado antes da cor,
                para quem não distingue verde de âmbar. */}
            <span className="text-[9px] leading-none">{cheia ? "●" : vazia ? "○" : "◐"}</span>
            {nome}
          </button>
        );
      })}
    </nav>
  );
};

/* ============================================================ */
export const ProjectCharter = ({ projectId, project, phases, members, onMembersChanged, onIrPara }: ProjectCharterProps) => {
  const { toast } = useToast();
  const { user, canManage } = useAuth();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [risks, setRisks] = useState<Risk[]>([]);
  /** Fontes do autopreenchimento — ver lib/charterAutofill. */
  const [premissas, setPremissas] = useState<FontePremissa[]>([]);
  const [baseline, setBaseline] = useState<FonteBaseline | null>(null);
  const [allProfiles, setAllProfiles] = useState<{ id: string; full_name: string; sector: string | null }[]>([]);
  const [memberRows, setMemberRows] = useState<MemberRow[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [addingMember, setAddingMember] = useState(false);

  // Estado do TAP como coluna, não mais derivado de approved_at ser nulo: agora
  // existe "em aprovação", que antes não tinha onde caber.
  const [charterStatus, setCharterStatus] = useState<CharterStatus>("rascunho");
  const reloadCharterStatus = useCallback(async () => {
    const { data: row, error } = await supabase
      .from("projects").select("charter_status").eq("id", projectId).maybeSingle();
    // Migration pendente na VM: cai no estado derivado do carimbo, como antes.
    if (error || !row) return;
    const s = (row as any).charter_status as CharterStatus | null;
    if (s) setCharterStatus(s);
  }, [projectId]);
  useEffect(() => { reloadCharterStatus(); }, [reloadCharterStatus]);

  // Guarda o charter_data cru vindo do banco. O formulário só conhece um
  // subconjunto das chaves; sem esta base, salvar apagaria as demais (ex.:
  // deliverables/approval_requirements/success_criteria de versões anteriores).
  const rawCharterRef = useRef<Record<string, any>>({});

  const [data, setData] = useState<CharterData>({
    sponsor: "", manager: "", authority: "", start_date: "", justification: "",
    assumptions: "", constraints: "",
    smart_specific: "", smart_measurable: "", smart_achievable: "",
    smart_relevant: "", smart_temporal: "",
    approvals: [], code: "", benefits_table: [],
    approved_at: null, approved_by: null, approved_by_name: null,
  });

  const [form, setForm] = useState({
    objective: project.objective || "",
    problem_statement: project.problem_statement || "",
    scope: project.scope || "",
    out_of_scope: project.out_of_scope || "",
    expected_benefits: project.expected_benefits || "",
  });

  /** Camada 2 do TAP (as seções do PMBOK). Fechada por padrão — ver comentário
   *  em `preenchido`. Abre sozinha se já houver conteúdo lá dentro: esconder
   *  o que a pessoa escreveu seria pior que mostrar campo vazio. */
  const [detalhado, setDetalhado] = useState(false);

  /**
   * O que o sistema JÁ SABE e o TAP ainda não tem.
   *
   * Medido em 02/08: 13 de 20 campos com 0% de preenchimento em 52 projetos, e
   * nenhum dos 25 com patrocinador. Não é desleixo — na hora de abrir ninguém
   * sabe a resposta, e metade dela está no banco: o gestor no cadastro, o
   * patrocinador na solicitação, o prazo na linha de base, as premissas na
   * tabela própria.
   *
   * Indexado por campo para a oferta aparecer AO LADO dele, não numa lista
   * separada que exigiria procurar onde aplicar.
   */
  const sugestoes = useMemo(() => {
    const lista = sugerirCampos(
      { ...data, objective: form.objective, scope: form.scope, justification: data.justification },
      {
        projeto: {
          manager: (project as any).manager, owner: project.owner, sponsor: (project as any).sponsor,
          restrictions: (project as any).restrictions, objective: form.objective,
          due_date: project.due_date, baseline_end_date: (project as any).baseline_end_date,
          budget_planned: project.budget_planned,
        },
        premissas,
        baseline,
      },
    );
    return Object.fromEntries(lista.map((s) => [s.campo, s])) as Record<string, Sugestao>;
  }, [data, form, project, premissas, baseline]);

  /** Aceita a oferta. Grava no charter e a sugestão some — o campo deixou de
   *  estar vazio, que é a única condição para ela existir. */
  const usarSugestao = (campo: string, valor: string) => {
    setData((prev) => ({ ...prev, [campo]: valor }));
  };

  /**
   * Cria a reunião de kickoff já com quem assinou o TAP.
   *
   * Os participantes saem das aprovações: são exatamente as pessoas que
   * autorizaram o projeto, e recadastrá-las à mão seria digitar de novo o que
   * o TAP acabou de registrar. A pauta nasce do próprio documento — objetivo,
   * escopo e prazo são o que se apresenta num kickoff.
   */
  const irParaKickoff = async () => {
    const participantes = (data.approvals || [])
      .map((a) => (a.name || "").trim())
      .filter(Boolean);
    const pauta = [
      "1. Apresentação do TAP aprovado",
      form.objective ? `2. Objetivo: ${form.objective}` : "2. Objetivo do projeto",
      form.scope ? "3. Escopo acordado" : "3. Escopo",
      "4. Equipe e responsabilidades",
      "5. Próximos passos e cronograma",
    ].join("\n");

    const { error } = await (supabase.from("meetings") as any).insert({
      project_id: projectId,
      title: `Kickoff — ${project.title}`,
      meeting_type: "kickoff",
      meeting_date: new Date().toISOString().slice(0, 10),
      agenda: pauta,
      participants: participantes,
    });

    if (error) {
      toast({ title: "Não foi possível criar o kickoff", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Kickoff criado",
      description: participantes.length
        ? `${participantes.length} participante(s) do TAP já incluídos. Ajuste a data em Reuniões.`
        : "Ajuste data e participantes em Reuniões.",
    });
    onIrPara?.("meetings");
  };

  /** Completude por seção — alimenta a barra do topo e o "3 de 4" de cada
   *  cabeçalho. Conta o que EXISTE, nunca bloqueia. */
  const completude = useMemo(() => {
    const secoes = [
      { n: 2, campos: [data.code, data.sponsor, data.authority, data.start_date || project.start_date] },
      { n: 3, campos: [form.problem_statement, data.justification] },
      { n: 4, campos: [data.smart_specific, data.smart_measurable, data.smart_achievable, data.smart_relevant, data.smart_temporal] },
      { n: 5, campos: [form.scope, form.out_of_scope] },
      { n: 6, campos: [data.assumptions, data.constraints] },
      { n: 7, campos: [form.expected_benefits, data.benefits_table] },
    ].map((s) => ({
      n: s.n,
      total: s.campos.length,
      preenchidos: s.campos.filter(preenchido).length,
    }));

    // O essencial entra na conta do topo para a barra refletir o TAP inteiro.
    const essenciais = [
      project.title, (project as any).manager || project.owner, project.due_date,
      form.objective, project.budget_planned, form.out_of_scope,
    ].filter(preenchido).length;

    const totalCampos = 6 + secoes.reduce((n, s) => n + s.total, 0);
    const totalPreenchidos = essenciais + secoes.reduce((n, s) => n + s.preenchidos, 0);

    /**
     * A seção 8 (RACI) fica FORA do `secoes` acima de propósito: ali cada
     * entrada é uma lista de campos de texto, e a matriz conta pessoas com
     * papel definido. Somá-la ao total de campos do TAP faria a barra do topo
     * oscilar com o tamanho da equipe, não com o preenchimento do documento.
     *
     * Entra só no índice, para o chip mostrar o estado — e por isso é anexada
     * a `porSecao` aqui, depois do cálculo dos totais.
     */
    const raciDefinidos = memberRows.filter((m) => m.raci).length;
    const porSecao: Record<number, { preenchidos: number; total: number }> = {
      ...Object.fromEntries(secoes.map((s) => [s.n, { preenchidos: s.preenchidos, total: s.total }])),
      8: { preenchidos: raciDefinidos, total: Math.max(memberRows.length, 1) },
    };

    return {
      porSecao,
      essenciais,
      preenchidos: totalPreenchidos,
      total: totalCampos,
      pct: Math.round((totalPreenchidos / totalCampos) * 100),
      // Lista para o aviso ao aprovar — informa, não impede.
      faltando: secoes.filter((s) => s.preenchidos < s.total),
    };
    // `memberRows` entra porque a seção 8 conta pessoas com papel RACI: sem
    // ela, o chip do índice congelaria no valor da primeira renderização.
  }, [data, form, project, memberRows]);

  // Conteúdo pré-existente nas seções do PMBOK abre a camada 2 sozinha.
  useEffect(() => {
    if (completude.preenchidos > completude.essenciais) setDetalhado(true);
  }, [completude.preenchidos, completude.essenciais]);

  useEffect(() => {
    setForm({
      objective: project.objective || "",
      problem_statement: project.problem_statement || "",
      scope: project.scope || "",
      out_of_scope: project.out_of_scope || "",
      expected_benefits: project.expected_benefits || "",
    });
    try {
      const charter: any = (project as any).charter_data;
      const parsed =
        charter && typeof charter === "object"
          ? charter
          : project.description?.startsWith("{")
          ? JSON.parse(project.description)
          : null;
      rawCharterRef.current =
        parsed && typeof parsed === "object" ? { ...parsed } : {};
      if (parsed && (parsed.__charter || (project as any).charter_data)) {
          setData((prev) => ({
            ...prev,
            // Sponsor/Manager: fonte única = charter_data; migra da coluna nativa
            // do projeto quando o jsonb estiver vazio (não duplica mais).
            sponsor: parsed.sponsor || (project as any).sponsor || "",
            manager: parsed.manager || (project as any).manager || "",
            authority: parsed.authority || "",
            start_date: parsed.start_date || "",
            justification: parsed.justification || "",
            assumptions: parsed.assumptions || "",
            constraints: parsed.constraints || (project as any).restrictions || "",
            smart_specific: parsed.smart_specific || "",
            smart_measurable: parsed.smart_measurable || "",
            smart_achievable: parsed.smart_achievable || "",
            smart_relevant: parsed.smart_relevant || "",
            smart_temporal: parsed.smart_temporal || "",
            approvals: Array.isArray(parsed.approvals) ? parsed.approvals : [],
            code: parsed.code || "",
            benefits_table: Array.isArray(parsed.benefits_table) ? parsed.benefits_table : [],
            approved_at: parsed.approved_at || null,
            approved_by: parsed.approved_by || null,
            approved_by_name: parsed.approved_by_name || null,
          }));
      } else {
          // Sem charter salvo ainda: semeia sponsor/manager das colunas nativas.
          setData((prev) => ({
            ...prev,
            sponsor: (project as any).sponsor || "",
            manager: (project as any).manager || "",
            constraints: (project as any).restrictions || "",
          }));
      }
    } catch {}
  }, [project]);

  useEffect(() => { fetchRelations(); }, [projectId]);

  const fetchRelations = async () => {
    const [r, prof, adminRoles, mem] = await Promise.all([
      supabase.from("risks").select("id, description, probability, impact, status").eq("project_id", projectId).eq("is_trashed", false).order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, sector").not("full_name", "is", null).order("full_name"),
      supabase.from("user_roles").select("user_id").eq("role", "admin"),
      supabase.from("project_members").select("id, user_id, invitation_status, decline_reason, raci").eq("project_id", projectId),
      // PREMISSAS: existem numa tabela própria e o TAP pedia texto livre — o
      // mesmo dado vivia em dois lugares sem se falarem.
    ]);

    /* FONTES DO AUTOPREENCHIMENTO, fora do Promise.all acima.
       Vão separadas por dois motivos: `types.ts` está desatualizado e não
       conhece estas tabelas (o `as any` quebraria a inferência do array), e
       elas são OPCIONAIS — se a migration não rodou no ambiente, o TAP
       continua funcionando e o autopreenchimento apenas não oferece o que não
       conseguiu ler. `.catch` porque tabela ausente devolve erro de rede, não
       resultado vazio. */
    const sb = supabase as any;
    const prem = await sb.from("assumptions")
      .select("description").eq("project_id", projectId).eq("is_trashed", false)
      .then((x: any) => x, () => ({ data: null }));
    // A linha de base ativa é única por índice parcial — limit(1) basta.
    const base = await sb.from("budget_baselines")
      .select("baseline_total, version").eq("project_id", projectId).eq("is_active", true).limit(1)
      .then((x: any) => ({ data: x?.data?.[0] ?? null }), () => ({ data: null }));
    if (r.data) setRisks(r.data);
    // Tabela ausente no ambiente não pode derrubar o TAP: as duas são opcionais
    // e o autopreenchimento simplesmente não oferece o que não conseguiu ler.
    setPremissas(prem.data ? (prem.data as any[]).map((p) => ({ description: p.description })) : []);
    setBaseline((base as any)?.data ?? null);
    const adminIds = new Set((adminRoles.data || []).map((x: any) => x.user_id));
    const profiles = (prof.data || []).filter((p: any) => p.full_name && !adminIds.has(p.id));
    setAllProfiles(profiles);
    if (mem.data) {
      const rows = mem.data.map((m: any) => {
        const p = profiles.find((pp) => pp.id === m.user_id);
        return {
          id: m.id,
          user_id: m.user_id,
          full_name: p?.full_name || "—",
          sector: p?.sector || null,
          invitation_status: (m.invitation_status as MemberRow["invitation_status"]) || "pending",
          decline_reason: m.decline_reason || null,
          raci: m.raci || null,
        };
      });
      setMemberRows(rows);
    }
  };

  const handleAddStakeholder = async () => {
    if (!selectedProfileId) return;
    setAddingMember(true);
    const profile = allProfiles.find((p) => p.id === selectedProfileId);
    const { error } = await supabase.from("project_members").insert({
      project_id: projectId, user_id: selectedProfileId, sector: profile?.sector || null,
      invitation_status: "accepted",
      responded_at: new Date().toISOString(),
      invited_by: user?.id ?? null,
      can_create: true, can_edit: false, can_delete: false, can_move: false,
    });
    setAddingMember(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    // notificação direcionada
    await supabase.from("notifications").insert({
      project_id: projectId,
      target_user_id: selectedProfileId,
      type: "project_invite",
      title: `Você foi adicionado(a) ao projeto: ${project.title}`,
      message: `Seu acesso ao projeto "${project.title}" já está ativo.`,
    });
    setSelectedProfileId("");
    await fetchRelations();
    onMembersChanged?.();
    toast({ title: "Membro adicionado!" });
  };

  /**
   * Define o papel RACI de um membro. Grava direto, como as demais ações da
   * equipe nesta tela (convidar, remover) — não espera o "Salvar" do TAP.
   *
   * Regra do A único: é o consenso mais forte da literatura de RACI — dois
   * aprovadores significa nenhum decidindo. Marcar um novo A rebaixa o
   * anterior a C (Consultado), que é o papel mais próximo de quem antes
   * aprovava: continua opinando, mas não dá o aval final.
   *
   * O rebaixamento vai em UPDATE separado, e não numa transação: falhar em
   * rebaixar o anterior deixaria dois "A", que a seção 9 trata sem quebrar
   * (`sugerirAprovadores` devolve TODOS os "A", não só o primeiro).
   */
  const definirRaci = async (memberId: string, papel: "R" | "A" | "C" | "I" | null) => {
    const anteriorA = papel === "A"
      ? memberRows.find((m) => (m.raci || "").toUpperCase() === "A" && m.id !== memberId)
      : null;

    const { error } = await supabase.from("project_members").update({ raci: papel }).eq("id", memberId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }

    if (anteriorA) {
      await supabase.from("project_members").update({ raci: "C" }).eq("id", anteriorA.id);
      toast({
        title: "Aprovador substituído",
        description: `${anteriorA.full_name} passou a Consultado — só uma pessoa aprova por projeto.`,
      });
    }

    await fetchRelations();
    onMembersChanged?.();
  };

  const handleRemoveStakeholder = async (memberId: string) => {
    const { error } = await supabase.from("project_members").delete().eq("id", memberId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    await fetchRelations();
    onMembersChanged?.();
  };

  const handleResendInvite = async (m: MemberRow) => {
    await supabase.from("notifications").insert({
      project_id: projectId,
      target_user_id: m.user_id,
      type: "project_invite",
      title: `Convite reenviado: ${project.title}`,
      message: `Reenvio do convite para participar do projeto "${project.title}".`,
    });
    await supabase.from("project_members").update({ invitation_status: "pending", responded_at: null, decline_reason: null }).eq("id", m.id);
    await fetchRelations();
    toast({ title: "Convite reenviado" });
  };

  const handleManualAccept = async (m: MemberRow) => {
    await supabase.from("project_members").update({ invitation_status: "accepted", responded_at: new Date().toISOString() }).eq("id", m.id);
    await fetchRelations();
    toast({ title: "Aceite manual registrado" });
  };

  const handleSave = async () => {
    setSaving(true);
    const charterPayload: any = { ...rawCharterRef.current, __charter: true, ...data };
    const updatePayload: any = {
      charter_data: charterPayload,
      objective: form.objective || null,
      problem_statement: form.problem_statement || null,
      scope: form.scope || null,
      out_of_scope: form.out_of_scope || null,
      // Restrições: fonte única = charter_data.constraints; espelha na coluna
      // nativa para quem lê `restrictions` fora do TAP.
      restrictions: data.constraints || null,
      expected_benefits: form.expected_benefits || null,
      // Sponsor/Manager: espelha nas colunas nativas (fonte de leitura externa).
      sponsor: data.sponsor || null,
      manager: data.manager || null,
    };
    // Limpa qualquer JSON do TAP que ainda esteja em description (legado)
    if (project.description?.startsWith("{")) {
      updatePayload.description = null;
    }
    const { error } = await supabase.from("projects").update(updatePayload).eq("id", projectId);
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar TAP", description: error.message, variant: "destructive" }); return; }
    setEditing(false);
    toast({ title: "TAP salvo com sucesso!" });
  };

  const isApproved = !!data.approved_at;

  // Aprovar e reabrir saíram daqui: viraram atos com trilha, participantes e
  // notificação, orquestrados por /api/charter/flow e operados pelo
  // CharterFlowPanel. Antes eram dois updates diretos no JSONB, sem validação e
  // sem registro de quem reabriu.

  const handleExportPDF = () => {
    // Usa o diálogo de impressão do navegador (com CSS @media print já aplicado).
    window.print();
  };

  const formatDate = (d: string | null | undefined) => {
    if (!d) return "—";
    try {
      const [y, m, day] = d.split("T")[0].split("-").map(Number);
      return format(new Date(y, m - 1, day), "dd/MM/yyyy", { locale: ptBR });
    } catch { return "—"; }
  };

  const probLabel = (p: string) => ({ low: "Baixa", medium: "Média", high: "Alta" }[p] || p);
  const impactLabel = (i: string) => ({ low: "Baixo", medium: "Médio", high: "Alto" }[i] || i);
  const riskBadge = (imp: string, prob: string) => {
    const score = ({ low: 1, medium: 2, high: 3 }[imp] || 2) * ({ low: 1, medium: 2, high: 3 }[prob] || 2);
    if (score >= 6) return "bg-destructive/15 text-destructive border-destructive/40";
    if (score >= 3) return "bg-warning/15 text-warning border-warning/40";
    return "bg-success/15 text-success border-success/40";
  };

  // --- Approvals editor helpers ---
  const addApproval = () => setData({ ...data, approvals: [...(data.approvals || []), { role: "", name: "", date: "" }] });
  const updateApproval = (idx: number, field: "role" | "name" | "date", val: string) => {
    const list = [...(data.approvals || [])]; list[idx] = { ...list[idx], [field]: val };
    setData({ ...data, approvals: list });
  };
  const removeApproval = (idx: number) => {
    const list = [...(data.approvals || [])]; list.splice(idx, 1); setData({ ...data, approvals: list });
  };

  // --- Benefits table editor helpers ---
  const addBenefit = () => setData({ ...data, benefits_table: [...(data.benefits_table || []), { benefit: "", indicator: "", goal: "", deadline: "" }] });
  const updateBenefit = (idx: number, field: "benefit" | "indicator" | "goal" | "deadline", val: string) => {
    const list = [...(data.benefits_table || [])]; list[idx] = { ...list[idx], [field]: val };
    setData({ ...data, benefits_table: list });
  };
  const removeBenefit = (idx: number) => {
    const list = [...(data.benefits_table || [])]; list.splice(idx, 1); setData({ ...data, benefits_table: list });
  };

  return (
    <div className="space-y-4 print:space-y-2">
      {/* Toolbar (oculta na impressão) */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        {/* Selo de aprovação à esquerda */}
        <div>
          {isApproved ? (
            <Badge variant="outline" className="gap-1.5 border-success/40 bg-success/10 text-success">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Aprovado{data.approved_by_name ? ` por ${data.approved_by_name}` : ""} · {formatDate(data.approved_at)}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1.5 text-muted-foreground">
              <ClipboardList className="w-3.5 h-3.5" /> Rascunho
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={handleExportPDF} className="gap-1">
            <FileDown className="w-4 h-4" /> PDF
          </Button>

          {editing ? (
            <>
              <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
                <Save className="w-4 h-4" /> {saving ? "Salvando..." : "Salvar TAP"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
            </>
          ) : !canManage ? (
            <span className="text-xs text-muted-foreground self-center">Somente leitura</span>
          ) : charterStatus === "rascunho" || charterStatus === "recusado" ? (
            // "Aprovar TAP" saiu daqui: aprovar virou um ATO, não um clique de
            // quem edita. Quem conduz envia para os aprovadores designados
            // (painel abaixo); quem aprova é quem foi designado.
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="gap-1">
              <ClipboardList className="w-4 h-4" /> Editar campos
            </Button>
          ) : null}
        </div>
      </div>

      {/* De qual demanda este projeto nasceu (só se veio do roadmap). */}
      <OrigemDemanda projectId={projectId} />

      {/* Circulação para aprovação: estado, aprovadores e trilha. */}
      <div className="print:hidden">
        <CharterFlowPanel
          projectId={projectId}
          status={charterStatus}
          canManage={canManage}
          onChanged={() => { reloadCharterStatus(); onMembersChanged?.(); }}
        />
      </div>

      {/* DEPOIS DE APROVADO, O TAP OFERECE O PRÓXIMO PASSO.
          Era um beco: preenche, circula, assina — e nada acontece. O documento
          que AUTORIZA o projeto não destravava nada, e quem aprovava saía da
          tela sem saber o que fazer em seguida.
          As três ações usam módulos que já existem; o TAP só deixa de ser
          documento e passa a ser o marco que libera o trabalho. */}
      {charterStatus === "aprovado" && canManage && (
        <Card className="p-3 print:hidden border-success/40 bg-success/[0.03]">
          <div className="flex items-center gap-2 mb-2.5">
            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            <span className="text-sm font-semibold">Aprovado — próximos passos</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Kickoff com os aprovadores já como participantes: são as pessoas
                que assinaram, e recadastrá-las à mão seria digitar de novo o
                que o TAP acabou de registrar. */}
            <Button
              size="sm" variant="outline" className="h-8 text-xs gap-1.5"
              onClick={irParaKickoff}
            >
              <ClipboardList className="w-3.5 h-3.5" /> Agendar kickoff
            </Button>
            {/* A linha de base congela o que o TAP autorizou. Sem isso o valor
                agregado compara o real contra um alvo que ainda muda. */}
            <Button
              size="sm" variant="outline" className="h-8 text-xs gap-1.5"
              onClick={() => onIrPara?.("financials")}
            >
              <Save className="w-3.5 h-3.5" /> Congelar linha de base
            </Button>
            <Button
              size="sm" variant="outline" className="h-8 text-xs gap-1.5"
              onClick={() => onIrPara?.("backlog")}
            >
              <FileText className="w-3.5 h-3.5" /> Detalhar a EAP
            </Button>
            <Button
              size="sm" variant="outline" className="h-8 text-xs gap-1.5 ml-auto"
              onClick={() => window.print()}
            >
              <FileDown className="w-3.5 h-3.5" /> Exportar PDF
            </Button>
          </div>
        </Card>
      )}

      {/* Cabeçalho geral */}
      <Card className="overflow-hidden border-border print:break-inside-avoid">
        <div className="bg-primary/10 text-foreground p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary-foreground/15 flex items-center justify-center flex-shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Termo de Abertura do Projeto · TAP</p>
            <h1 className="text-xl md:text-2xl font-bold truncate text-foreground">{project.title}</h1>
          </div>
        </div>
      </Card>

      {/* Completude — informa o que falta sem obrigar nada. Some na impressão:
          o TAP em PDF é o documento, não o formulário. */}
      <Card className="p-3 print:hidden">
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <span className="text-sm font-semibold">Termo de Abertura</span>
          <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
            {completude.preenchidos} de {completude.total} campos
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${completude.pct}%` }} />
        </div>

        {/* PRONTO PARA ASSINAR — outra pergunta, outra conta.
            A barra acima mede o documento inteiro (20 campos). Esta mede os 6
            que fazem o TAP cumprir sua função de AUTORIZAR: objetivo, escopo,
            justificativa, gestor, patrocinador e prazo. Um TAP com esses seis
            está pronto para circular; os demais enriquecem, não habilitam.
            Sem essa distinção, "8 de 20" desanimava quem já podia assinar. */}
        {(() => {
          const ess = completudeEssencial(
            { ...data, objective: form.objective, scope: form.scope, justification: data.justification },
            { manager: (project as any).manager, sponsor: (project as any).sponsor },
          );
          if (ess.faltando.length === 0) {
            return (
              <p className="mt-2 text-[11px] text-success leading-snug inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Pronto para circular: o essencial está preenchido.
              </p>
            );
          }
          return (
            <p className="mt-2 text-[11px] text-muted-foreground leading-snug">
              Para circular, falta: <span className="text-foreground">{ess.faltando.join(", ")}</span>.
              {Object.keys(sugestoes).length > 0 && (
                <span className="text-primary"> {Object.keys(sugestoes).length} campo(s) podem ser preenchidos com o que o sistema já sabe.</span>
              )}
            </p>
          );
        })()}

        {/* ÍNDICE no lugar do "Em branco: Identificação · Problema · …".
            Aquela linha dizia o que faltava e não levava a lugar nenhum — a
            pessoa lia, descia a página e reabria as seções procurando. O
            índice diz a mesma coisa E leva, com o estado de TODAS (inclusive
            as cheias, que o texto omitia). Informa, nunca bloqueia: campo
            obrigatório travaria a abertura do projeto, o oposto do que se
            quer aqui. */}
        <div className="mt-2.5">
          <IndiceSecoes porSecao={completude.porSecao} />
        </div>
      </Card>

      {/* Todas as seções num CARD só — lista contínua em vez de oito cartões
          soltos, cada um com sua borda e sua margem. */}
      <Card className="overflow-hidden">

      {/* CAMADA 1 — O ESSENCIAL. Os seis campos que autorizam o projeto:
          os quatro que a equipe já preenche (>70% de uso) mais objetivo e
          fora do escopo, que o mercado trata como indispensáveis e que hoje
          ficavam no fim de um formulário longo, com 0% de preenchimento. */}
      <SectionBlock n={1} title="O essencial" status={{ preenchidos: completude.essenciais, total: 6 }} editing={editing}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Field label="Título do Projeto"><p className="text-sm font-semibold">{project.title}</p></Field>
          <Field label="Gestor do Projeto">
            <p className="text-sm">{(project as any).manager || project.owner || <span className="italic text-muted-foreground">Não definido</span>}</p>
          </Field>
          <Field label="Prazo previsto">
            <p className="text-sm">{formatDate(project.due_date)}</p>
          </Field>
          <div className="md:col-span-3">
            <Field label="Objetivo — em uma frase">
              <TextField editing={editing} value={form.objective} onChange={(v) => setForm({ ...form, objective: v })}
                placeholder="O que este projeto entrega, e para quê" rows={2} aiContext="tap_objective" />
            </Field>
          </div>
          <Field label="Orçamento previsto">
            <p className="text-sm">{project.budget_planned ? `R$ ${Number(project.budget_planned).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</p>
          </Field>
          <div className="md:col-span-2">
            <Field label="Fora do escopo">
              <TextField editing={editing} value={form.out_of_scope} onChange={(v) => setForm({ ...form, out_of_scope: v })}
                placeholder="O que este projeto NÃO vai fazer" rows={2} />
            </Field>
          </div>
        </div>
      </SectionBlock>

      {/* Porta da camada 2 — mesma altura das linhas de seção, para a lista
          não quebrar. Some na impressão: no PDF o TAP sai inteiro. */}
      <button
        type="button"
        onClick={() => setDetalhado((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 border-b border-border last:border-b-0 bg-muted/30 hover:bg-muted/60 transition-colors text-left print:hidden"
      >
        <span className="text-[10px] text-muted-foreground w-2.5 shrink-0">{detalhado ? "▾" : "▸"}</span>
        <span className={cn("flex-1 text-[13.5px]", detalhado ? "text-primary font-medium" : "text-muted-foreground")}>
          Detalhar o TAP
        </span>
        <span className="text-[11px] font-mono text-muted-foreground shrink-0">
          {completude.total - 6} campos · PMBOK
        </span>
      </button>

      {/* CAMADA 2 — as seções do PMBOK, as mesmas de sempre. */}
      <div className={detalhado ? "" : "hidden print:block"}>

      {/* 2. IDENTIFICAÇÃO */}
      <SectionBlock n={2} title="Identificação do Projeto" status={completude.porSecao[2]} editing={editing}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
          <Field label="Código">
            <TextField editing={editing} value={data.code || ""} onChange={(v) => setData({ ...data, code: v })} placeholder="Ex: PRJ-2025-001" multiline={false} />
          </Field>
          <Field label="Prioridade">
            {project.priority ? (
              <PriorityBadge priority={project.priority} size="md" />
            ) : (
              <span className="text-sm text-muted-foreground italic">—</span>
            )}
          </Field>
          <Field label="Patrocinador (Sponsor)">
            <TextField editing={editing} value={data.sponsor} onChange={(v) => setData({ ...data, sponsor: v })} placeholder="Nome do patrocinador" multiline={false} />
            {editing && sugestoes.sponsor && (
              <SugestaoInline s={sugestoes.sponsor} onUsar={() => usarSugestao("sponsor", sugestoes.sponsor.valor)} />
            )}
          </Field>
          <Field label="Gerente do Projeto">
            <TextField editing={editing} value={data.manager} onChange={(v) => setData({ ...data, manager: v })} placeholder="Nome do gerente" multiline={false} />
            {editing && sugestoes.manager && (
              <SugestaoInline s={sugestoes.manager} onUsar={() => usarSugestao("manager", sugestoes.manager.valor)} />
            )}
          </Field>
          <Field label="Nível de Autoridade">
            <TextField editing={editing} value={data.authority} onChange={(v) => setData({ ...data, authority: v })} placeholder="Ex.: aprova mudanças até R$ 10 mil" multiline={false} />
            {editing && sugestoes.authority && (
              <SugestaoInline s={sugestoes.authority} onUsar={() => usarSugestao("authority", sugestoes.authority.valor)} />
            )}
          </Field>
          <Field label="Líder do Projeto">
            <p className="text-sm">{project.owner || <span className="italic text-muted-foreground">Não definido</span>}</p>
          </Field>
          {/* ORÇAMENTO AUTORIZADO — a linha de base vence o campo solto.
              `budget_planned` é um número digitado à mão; a linha de base foi
              aprovada, versionada, e é a referência do valor agregado. Num
              documento que AUTORIZA gasto, citar o número informal seria
              autorizar o valor errado. */}
          <Field label="Orçamento Autorizado">
            {(() => {
              const orc = orcamentoAutorizado(
                { budget_planned: project.budget_planned },
                baseline,
              );
              if (!orc) return <p className="text-sm text-muted-foreground italic">—</p>;
              return (
                <p className="text-sm">
                  {orc.texto}
                  {orc.nota && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">({orc.nota})</span>
                  )}
                </p>
              );
            })()}
          </Field>
          <Field label="Data de Início">
            {editing ? (
              <DateField value={data.start_date} onChange={(v) => setData({ ...data, start_date: v })} className="text-sm h-8" />
            ) : (
              <p className="text-sm">{formatDate(data.start_date || project.start_date)}</p>
            )}
          </Field>
          <Field label="Data de Término Prevista">
            <p className="text-sm">{formatDate(project.due_date)}</p>
          </Field>
          <Field label="Status Atual">
            <Badge variant="outline" className="text-xs">{project.status}</Badge>
          </Field>
        </div>
        <div className="mt-4 pt-3 border-t">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Cronograma — Previsto x Real</p>
          <BaselineBlock project={project as any} canManage />
        </div>
      </SectionBlock>

      {/* 2. PROBLEMA / JUSTIFICATIVA */}
      <SectionBlock n={3} title="Problema / Justificativa" status={completude.porSecao[3]} editing={editing}>
        <Field label="Situação atual / Problema">
          <TextField editing={editing} value={form.problem_statement} onChange={(v) => setForm({ ...form, problem_statement: v })} placeholder="Descreva a situação atual e o problema a ser resolvido..." rows={3} aiContext="tap_problem" />
        </Field>
        <Field label="Justificativa estratégica">
          <TextField editing={editing} value={data.justification} onChange={(v) => setData({ ...data, justification: v })} placeholder="Por que este projeto é necessário agora?" rows={3} aiContext="tap_problem" />
        </Field>
      </SectionBlock>

      {/* 3. OBJETIVO SMART */}
      <SectionBlock n={4} title="Objetivo SMART" status={completude.porSecao[4]} editing={editing}>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm border border-border rounded-md overflow-hidden">
            <tbody>
              {[
                { k: "smart_specific", letter: "S", label: "Específico", color: "bg-primary/10" },
                { k: "smart_measurable", letter: "M", label: "Mensurável", color: "bg-primary/5" },
                { k: "smart_achievable", letter: "A", label: "Atingível", color: "bg-primary/10" },
                { k: "smart_relevant", letter: "R", label: "Relevante", color: "bg-primary/5" },
                { k: "smart_temporal", letter: "T", label: "Temporal", color: "bg-primary/10" },
              ].map((row) => (
                <tr key={row.k} className="border-b border-border last:border-0">
                  <td className={`${row.color} px-3 py-2 font-bold text-primary w-12 text-center align-top`}>{row.letter}</td>
                  <td className="px-3 py-2 font-medium w-32 align-top text-muted-foreground">{row.label}</td>
                  <td className="px-3 py-2 align-top">
                    <TextField editing={editing} value={(data as any)[row.k] || ""} onChange={(v) => setData({ ...data, [row.k]: v } as CharterData)} placeholder={`Defina ${row.label.toLowerCase()}...`} rows={2} />
                    {/* O prazo vem da linha de base; o específico, do objetivo
                        do projeto. Duas das cinco letras já estão respondidas
                        em outro lugar do sistema. */}
                    {editing && sugestoes[row.k] && (
                      <SugestaoInline s={sugestoes[row.k]} onUsar={() => usarSugestao(row.k, sugestoes[row.k].valor)} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionBlock>

      {/* 4. ESCOPO */}
      <SectionBlock n={5} title="Escopo do Projeto" status={completude.porSecao[5]} editing={editing}>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm border border-border rounded-md overflow-hidden">
            <thead>
              <tr>
                <th className="bg-success/15 text-success px-3 py-2 text-left font-semibold border-b-2 border-success/40 w-1/2">
                  <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Incluído no Escopo</span>
                </th>
                <th className="bg-destructive/15 text-destructive px-3 py-2 text-left font-semibold border-b-2 border-destructive/40 w-1/2">
                  <span className="inline-flex items-center gap-1.5"><Ban className="w-4 h-4" /> Excluído do Escopo</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="bg-success/5 px-3 py-3 align-top">
                  <TextField editing={editing} value={form.scope} onChange={(v) => setForm({ ...form, scope: v })} placeholder="O que será entregue (uma entrega por linha)..." rows={5} aiContext="tap_scope" />
                </td>
                <td className="bg-destructive/5 px-3 py-3 align-top">
                  <TextField editing={editing} value={form.out_of_scope} onChange={(v) => setForm({ ...form, out_of_scope: v })} placeholder="O que NÃO faz parte (uma exclusão por linha)..." rows={5} aiContext="tap_out_of_scope" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {phases.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Fases / Entregáveis cadastrados:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* O CÓDIGO REAL DA EAP, não a posição na lista.
                  Antes numerava "1.{i+1}" pela ordem, ignorando o `wbs_code` —
                  então o documento formal citava uma numeração que não batia
                  com a do Backlog nem com a do Cronograma. Três telas, três
                  números para a mesma entrega, e o TAP é o que vira anexo de
                  contrato. Sem código cadastrado, mostra só o título: um número
                  inventado é pior que nenhum. */}
              {phases.map((p) => {
                const code = ((p as any).wbs_code || "").trim();
                return (
                  <div key={p.id} className="text-sm flex items-start gap-2 p-2 rounded border border-border bg-muted/30">
                    {code && <span className="text-primary font-mono font-semibold shrink-0">{code}</span>}
                    <span>{p.title}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionBlock>

      {/* 5. PREMISSAS E RESTRIÇÕES (recuperado do PMBOK) */}
      <SectionBlock n={6} title="Premissas e Restrições" status={completude.porSecao[6]} editing={editing}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Premissas</div>
            <p className="text-[11px] text-muted-foreground mb-2">Condições assumidas como verdadeiras para o planejamento (ex.: verba aprovada, equipe disponível).</p>
            <TextField
              value={data.assumptions}
              onChange={(v) => setData({ ...data, assumptions: v })}
              placeholder="Ex.: A infraestrutura de TI estará disponível até o início da fase de execução."
              editing={editing}
              rows={4}
            />
            {editing && sugestoes.assumptions && (
              <SugestaoInline s={sugestoes.assumptions} onUsar={() => usarSugestao("assumptions", sugestoes.assumptions.valor)} />
            )}
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Restrições</div>
            <p className="text-[11px] text-muted-foreground mb-2">Limites impostos ao projeto (prazo, orçamento, recursos, tecnologia, normas).</p>
            <TextField
              value={data.constraints}
              onChange={(v) => setData({ ...data, constraints: v })}
              placeholder="Ex.: Orçamento máximo de R$ 50 mil; entrega obrigatória antes do fim do ano fiscal."
              editing={editing}
              rows={4}
            />
            {editing && sugestoes.constraints && (
              <SugestaoInline s={sugestoes.constraints} onUsar={() => usarSugestao("constraints", sugestoes.constraints.valor)} />
            )}
          </div>
        </div>
      </SectionBlock>

      {/* 6. BENEFÍCIOS E CRITÉRIOS DE SUCESSO */}
      <SectionBlock n={7} title="Benefícios Esperados e Critérios de Sucesso" status={completude.porSecao[7]} editing={editing}>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm border border-border rounded-md overflow-hidden">
            <thead>
              <tr className="bg-primary/10">
                <th className="px-3 py-2 text-left font-semibold border-b-2 border-primary/30">Benefício</th>
                <th className="px-3 py-2 text-left font-semibold border-b-2 border-primary/30">Indicador de Sucesso</th>
                <th className="px-3 py-2 text-center font-semibold border-b-2 border-primary/30 whitespace-nowrap">Meta</th>
                <th className="px-3 py-2 text-center font-semibold border-b-2 border-primary/30 whitespace-nowrap">Prazo para Verificar</th>
                {editing && <th className="w-8 border-b-2 border-primary/30"></th>}
              </tr>
            </thead>
            <tbody>
              {(data.benefits_table || []).length === 0 && !editing && (
                <tr><td colSpan={4} className="px-3 py-3 text-center text-muted-foreground italic">Nenhum benefício registrado</td></tr>
              )}
              {(data.benefits_table || []).map((b, idx) => (
                <tr key={idx} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 align-top">
                    {editing ? (
                      <AutoTextarea
                        value={b.benefit}
                        onChange={(v) => updateBenefit(idx, "benefit", v)}
                        placeholder="Ex: Visibilidade do portfólio para liderança"
                      />
                    ) : (
                      <span className="whitespace-pre-line">{b.benefit || "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {editing ? (
                      <AutoTextarea
                        value={b.indicator}
                        onChange={(v) => updateBenefit(idx, "indicator", v)}
                        placeholder="Ex: % projetos com painel atualizado"
                      />
                    ) : (
                      <span className="whitespace-pre-line">{b.indicator || "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-center bg-success/5 whitespace-nowrap">
                    {editing ? (
                      <Input value={b.goal} onChange={(e) => updateBenefit(idx, "goal", e.target.value)} placeholder="≥ 80%" className="h-8 text-sm text-center font-semibold min-w-[5rem]" />
                    ) : (
                      <span className="font-semibold text-success">{b.goal || "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-center whitespace-nowrap">
                    {editing ? (
                      <Input value={b.deadline} onChange={(e) => updateBenefit(idx, "deadline", e.target.value)} placeholder="Mês 4" className="h-8 text-sm text-center min-w-[5rem]" />
                    ) : (
                      <span>{b.deadline || "—"}</span>
                    )}
                  </td>
                  {editing && (
                    <td className="px-2 py-2 align-top">
                      <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeBenefit(idx)}>×</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editing && (
          <Button type="button" size="sm" variant="outline" onClick={addBenefit} className="gap-1">
            + Adicionar benefício
          </Button>
        )}

        {/* Equipe do Projeto */}
        <div className="pt-2 border-t border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Equipe do Projeto
          </p>
          {memberRows.length > 0 ? (
            <div className="space-y-1.5">
              {memberRows.map((m) => {
                const ib = inviteBadge(m.invitation_status);
                return (
                  <div key={m.id} className="flex flex-wrap items-center gap-2 p-2 rounded-md border border-border bg-muted/30">
                    <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {m.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{m.full_name}</p>
                      {m.sector && <p className="text-xs text-muted-foreground truncate">{m.sector}</p>}
                      {m.invitation_status === "declined" && m.decline_reason && (
                        <p className="text-[11px] text-destructive truncate">Motivo: {m.decline_reason}</p>
                      )}
                    </div>
                    <Badge className={`text-[10px] ${ib.cls}`}>{ib.label}</Badge>
                    {editing && m.invitation_status !== "accepted" && (
                      <>
                        <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => handleResendInvite(m)}>
                          Reenviar
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-success" onClick={() => handleManualAccept(m)}>
                          Aceitar manual
                        </Button>
                      </>
                    )}
                    {editing && (
                      <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={() => handleRemoveStakeholder(m.id)}>×</Button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Nenhum membro cadastrado</p>
          )}
          {editing && (
            <div className="pt-2 mt-2 flex flex-col sm:flex-row gap-2">
              <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                <SelectTrigger className="text-sm flex-1 h-9">
                  <SelectValue placeholder="Convidar membro..." />
                </SelectTrigger>
                <SelectContent>
                  {allProfiles.filter((p) => !memberRows.some((m) => m.user_id === p.id)).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}{p.sector ? ` — ${p.sector}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" size="sm" onClick={handleAddStakeholder} disabled={!selectedProfileId || addingMember}>
                {addingMember ? "Enviando..." : "Convidar"}
              </Button>
            </div>
          )}
        </div>

        {/* Riscos iniciais */}
        {risks.length > 0 && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Riscos Iniciais</p>
            <div className="space-y-1.5">
              {risks.slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-start gap-2 text-sm p-2 rounded border border-border bg-muted/20">
                  <Badge className={`${riskBadge(r.impact, r.probability)} text-xs flex-shrink-0`}>
                    {impactLabel(r.impact)}/{probLabel(r.probability)}
                  </Badge>
                  <span className="flex-1">{r.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionBlock>

      {/* 8. MATRIZ RACI — veio da ficha da equipe.
          O seletor morava na linha do membro, em EditProjectDialog, porque a
          coluna vive em `project_members` e aquela é a tela que edita a
          tabela. Razão de implementação, não de produto: quem abre a ficha
          para mexer na equipe não está pensando em governança, e o resultado
          medido em 18/08/2026 foi que NENHUM dos 43 projetos tinha um "A"
          definido — o campo mais importante da matriz era o que ninguém
          preenchia, enquanto 44 dos 50 "I" vinham do default do banco.
          Aqui a pergunta tem consequência imediata: quem for "A" aparece na
          seção seguinte como aprovador. E a matriz vira TABELA, comparável de
          relance — na ficha era uma tira de 4 letras por pessoa, e para saber
          quem aprovava era preciso varrer linha por linha.
          A coluna não mudou de lugar: só a tela que a edita. */}
      <SectionBlock
        n={8}
        title="Matriz de Responsabilidades (RACI)"
        status={{ preenchidos: memberRows.filter((m) => m.raci).length, total: Math.max(memberRows.length, 1) }}
        editing={editing}
      >
        {memberRows.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Nenhum membro na equipe. Adicione pessoas na seção anterior para definir os papéis.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-sm border border-border rounded-md overflow-hidden">
                <thead>
                  <tr className="bg-primary/10">
                    <th className="px-3 py-2 text-left font-semibold border-b-2 border-primary/30">Pessoa</th>
                    {RACI_OPCOES.map((op) => (
                      <th
                        key={op.v}
                        title={op.hint}
                        className="px-2 py-2 text-center font-semibold border-b-2 border-primary/30 w-14"
                      >
                        {op.v}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {memberRows.map((m) => (
                    <tr key={m.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-1.5">
                        <span className="text-sm">{m.full_name}</span>
                        {m.sector && <span className="text-xs text-muted-foreground"> — {m.sector}</span>}
                      </td>
                      {RACI_OPCOES.map((op) => {
                        const ativo = (m.raci || "").toUpperCase() === op.v;
                        return (
                          <td key={op.v} className="px-2 py-1.5 text-center">
                            <button
                              type="button"
                              disabled={!editing}
                              title={editing ? op.hint : undefined}
                              // Clicar no papel já marcado desmarca: "nenhum" é
                              // estado legítimo, e sem isso não haveria como
                              // desfazer uma marcação errada.
                              onClick={() => definirRaci(m.id, ativo ? null : op.v)}
                              className={cn(
                                "w-7 h-7 rounded text-xs font-bold transition-colors",
                                ativo
                                  ? op.v === "A"
                                    ? "bg-success/15 text-success ring-1 ring-success/40"
                                    : "bg-primary/10 text-primary ring-1 ring-primary/40"
                                  : "text-muted-foreground/40 border border-dashed border-border",
                                editing && !ativo && "hover:bg-muted hover:text-foreground",
                                !editing && "cursor-default",
                              )}
                            >
                              {ativo ? op.v : ""}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-muted-foreground">
              {RACI_OPCOES.map((op) => (
                <span key={op.v}>
                  <b className="text-foreground">{op.v}</b> — {op.hint.replace(/^[A-Za-zÀ-ú]+ — /, "")}
                </span>
              ))}
            </div>
            {!editing && (
              <p className="text-[11px] text-muted-foreground mt-2 print:hidden">
                Edite o TAP para definir os papéis.
              </p>
            )}
          </>
        )}
      </SectionBlock>

      {/* 9. APROVAÇÕES */}
      <SectionBlock n={9} title="Aprovações Formais" editing={editing}>
        {/* A matriz RACI vira operação aqui: quem é "A" na equipe é quem dá o
            aval final do projeto, então já entra como aprovador em vez de ser
            cadastrado de novo à mão. */}
        {(() => {
          // TODOS os RACI-A, não só o primeiro. `find` pegava um: num projeto
          // com dois responsáveis, o segundo ficava invisível e era cadastrado
          // à mão — ou esquecido, que é pior num documento que autoriza.
          const faltantes = sugerirAprovadores(
            data.approvals || [],
            memberRows.map((m) => ({ user_name: m.full_name, raci: m.raci })),
          );
          const temAlgumA = memberRows.some((m) => (m.raci || "").toUpperCase() === "A");
          if (!temAlgumA) return null;
          return (
            <div className="flex items-center gap-2 flex-wrap rounded-md border border-primary/30 bg-primary/5 px-3 py-2 print:hidden">
              <span className="text-xs text-muted-foreground">
                {faltantes.length > 1 ? "Aprovadores definidos na equipe:" : "Aprovador definido na equipe:"}
              </span>
              {faltantes.length === 0 ? (
                <span className="text-[11px] text-success">já estão na lista</span>
              ) : (
                <>
                  <span className="text-sm font-medium">{faltantes.map((a) => a.name).join(" · ")}</span>
                  {editing ? (
                    <Button
                      type="button" size="sm" variant="outline" className="h-7 text-xs ml-auto"
                      onClick={() => setData({
                        ...data,
                        approvals: [
                          ...(data.approvals || []),
                          ...faltantes.map((a) => ({ role: a.role, name: a.name, date: "" })),
                        ],
                      })}
                    >
                      Incluir {faltantes.length > 1 ? `os ${faltantes.length}` : ""} nas aprovações
                    </Button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground ml-auto">edite o TAP para incluir</span>
                  )}
                </>
              )}
            </div>
          );
        })()}
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm border border-border rounded-md overflow-hidden">
            <thead>
              <tr className="bg-primary/10">
                <th className="px-3 py-2 text-left font-semibold border-b-2 border-primary/30 w-1/4">Função</th>
                <th className="px-3 py-2 text-left font-semibold border-b-2 border-primary/30">Nome</th>
                <th className="px-3 py-2 text-left font-semibold border-b-2 border-primary/30 w-40">Data / Assinatura</th>
                {editing && <th className="w-10 border-b-2 border-primary/30"></th>}
              </tr>
            </thead>
            <tbody>
              {(data.approvals || []).length === 0 && !editing && (
                <tr><td colSpan={3} className="px-3 py-3 text-center text-muted-foreground italic">Nenhuma aprovação registrada</td></tr>
              )}
              {(data.approvals || []).map((ap, idx) => (
                <tr key={idx} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 align-top">
                    {editing ? <Input value={ap.role} onChange={(e) => updateApproval(idx, "role", e.target.value)} placeholder="Ex: Sponsor" className="h-8 text-sm" /> : <span>{ap.role || "—"}</span>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {editing ? <Input value={ap.name} onChange={(e) => updateApproval(idx, "name", e.target.value)} placeholder="Nome completo" className="h-8 text-sm" /> : <span>{ap.name || "—"}</span>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {editing ? <DateField value={ap.date} onChange={(v) => updateApproval(idx, "date", v)} className="h-8 text-sm" /> : <span>{formatDate(ap.date)}</span>}
                  </td>
                  {editing && (
                    <td className="px-2 py-2 align-top">
                      <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeApproval(idx)}>×</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editing && (
          <Button type="button" size="sm" variant="outline" onClick={addApproval} className="gap-1">
            + Adicionar aprovador
          </Button>
        )}
      </SectionBlock>

      </div>{/* fim da camada 2 */}
      </Card>{/* fim da lista de seções */}

      {/* CSS de impressão */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
};

/* -------- Field helper -------- */
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
    {children}
  </div>
);

/**
 * Oferta de autopreenchimento — o valor que o sistema já sabe.
 *
 * Aparece SÓ em campo vazio e SÓ enquanto se edita. Não grava sozinho: mostra
 * o que seria escrito e de onde veio, e o usuário aceita. Preencher por conta
 * própria transformaria o TAP num documento que o sistema assina no lugar de
 * quem responde por ele.
 *
 * A procedência é metade do valor num documento formal: "Patrocinador: Raphael"
 * sem dizer que veio da solicitação do Roadmap é dado sem origem.
 */
const SugestaoInline = ({ s, onUsar }: { s: Sugestao; onUsar: () => void }) => (
  <button
    type="button"
    onClick={onUsar}
    title={`${ORIGEM_DETALHE[s.origem]} Clique para usar: "${s.valor.slice(0, 120)}${s.valor.length > 120 ? "…" : ""}"`}
    className="mt-1 inline-flex items-start gap-1.5 max-w-full text-left rounded border border-dashed border-primary/40 bg-primary/[0.04] px-2 py-1 text-[11.5px] text-muted-foreground hover:bg-primary/10 hover:border-primary/60 transition-colors"
  >
    <Sparkles className="w-3 h-3 shrink-0 mt-[3px] text-primary" />
    <span className="min-w-0">
      <span className="text-foreground line-clamp-2">{s.valor}</span>
      <span className="text-primary/80 ml-1 whitespace-nowrap">
        · {ORIGEM_LABEL[s.origem]}{s.nota ? ` (${s.nota})` : ""}
      </span>
    </span>
  </button>
);