'use client';
/**
 * Visão em TABELA do portfólio — linha por projeto, coluna por dado.
 *
 * O quadro de cartões é bom para MOVER um projeto de estágio; é ruim para
 * COMPARAR muitos. Numa tela cabem ~6 cartões contra ~20 linhas, e perguntas
 * como "quais estão atrasados?", "o que é do setor de TI?" ou "quem tem mais
 * projeto na mão?" exigiam contar no olho.
 *
 * Mostra o que o banco já tinha e nunca chegava à tela (medido em 04/08/2026):
 * dono, setor e tipo em 100% dos projetos, GUT em 79%, e as tarefas atrasadas
 * de 8 dos 24 ativos.
 */
import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowUp, ArrowDown, Hourglass, AlertTriangle, X } from "lucide-react";
import { getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";
import { formatProjectDueDate } from "@/lib/projectDeadline";
import { diasSemMovimento } from "@/components/SortableProjectCard";
import { cn } from "@/lib/utils";

export interface TableProject {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  owner: string | null;
  assignees: string[];
  updated_at?: string | null;
  sector?: string | null;
  project_type?: string | null;
  priority_score?: number | null;
}

export interface TableMetrics {
  total: number;
  concluidas: number;
  atrasadas: number;
  percent: number;
}

/**
 * Estágios com o mesmo peso de cor das bolinhas do quadro — mesmo estágio,
 * mesma cor nas duas visões.
 *
 * "Concluído" fica CINZA de propósito: é o estado que não pede ação, e verde
 * forte aqui competiria com o verde de "em dia", que é o que importa olhar.
 */
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  ideacao: { label: "Ideação", cls: "bg-amber-500/20 text-amber-800 dark:text-amber-300 ring-1 ring-amber-500/30" },
  poc: { label: "POC", cls: "bg-sky-500/20 text-sky-800 dark:text-sky-300 ring-1 ring-sky-500/30" },
  mvp: { label: "MVP", cls: "bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 ring-1 ring-indigo-500/30" },
  blocked: { label: "Bloqueio", cls: "bg-rose-500/20 text-rose-800 dark:text-rose-300 ring-1 ring-rose-500/30" },
  drawer: { label: "Gaveta", cls: "bg-slate-500/20 text-slate-700 dark:text-slate-300 ring-1 ring-slate-500/30" },
  "em-execucao": { label: "Execução", cls: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-500/30" },
  concluido: { label: "Concluído", cls: "bg-muted text-muted-foreground ring-1 ring-border" },
};

/**
 * Cor da barra por faixa de progresso. Antes toda barra era azul, inclusive
 * em 0% — e uma barra vazia e cinza sumia no meio da tabela, que é
 * exatamente o caso de um projeto parado.
 */
const corProgresso = (pct: number): string => {
  if (pct >= 80) return "bg-success";
  if (pct >= 40) return "bg-primary";
  if (pct > 0) return "bg-warning";
  return "bg-destructive";
};

/** A base usa GUT (crítica/urgente/alta/média/baixa) e o legado high/medium/low. */
const PRIORIDADE_LABEL: Record<string, string> = {
  critica: "Crítica", urgente: "Urgente", alta: "Alta", media: "Média",
  baixa: "Baixa", pendente: "Pendente",
  high: "Alta", medium: "Média", low: "Baixa",
};

const TYPE_LABEL: Record<string, string> = {
  estrategico: "Estratégico",
  operacional: "Operacional",
  novos_negocios: "Novos Negócios",
  parceria: "Parceria",
  inovacao: "Inovação",
};

type SortKey = "title" | "status" | "owner" | "sector" | "percent" | "due_date" | "alertas";

export function ProjectsTable({
  projects, metrics, assigneeAvatarMap = {}, onRowClick,
}: {
  projects: TableProject[];
  metrics: Record<string, TableMetrics>;
  assigneeAvatarMap?: Record<string, string>;
  onRowClick?: (p: TableProject) => void;
}) {
  // Ordena por ALERTA por padrão: numa tabela de portfólio, a primeira
  // pergunta é "o que precisa de atenção?", não "o que vem primeiro no
  // alfabeto".
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "alertas", dir: "desc" });

  /**
   * Filtros das colunas que a tabela introduziu. A busca por título e o
   * filtro de estágio já vêm da página; aqui entram os recortes que só
   * existem nesta visão — dono, setor e "só o que precisa de atenção".
   */
  const [fDono, setFDono] = useState<string>("");
  const [fSetor, setFSetor] = useState<string>("");
  const [fTipo, setFTipo] = useState<string>("");
  const [fPrioridade, setFPrioridade] = useState<string>("");
  /** vencido | vence30 | sem — recortes de prazo que exigem ação diferente. */
  const [fPrazo, setFPrazo] = useState<string>("");
  /** parado | andando | quase | pronto | sem — faixas de progresso. */
  const [fProgresso, setFProgresso] = useState<string>("");
  const [soAlerta, setSoAlerta] = useState(false);

  const limparTudo = () => {
    setFDono(""); setFSetor(""); setFTipo(""); setFPrioridade("");
    setFPrazo(""); setFProgresso(""); setSoAlerta(false);
  };

  // Opções vêm dos projetos EM TELA, não de uma lista fixa: filtro que
  // oferece valor sem resultado é filtro que mente.
  const donos = useMemo(
    () => Array.from(new Set(projects.map((p) => p.owner).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)),
    [projects],
  );
  const setores = useMemo(
    () => Array.from(new Set(projects.map((p) => p.sector).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)),
    [projects],
  );
  const tipos = useMemo(
    () => Array.from(new Set(projects.map((p) => p.project_type).filter(Boolean) as string[])).sort(),
    [projects],
  );
  const prioridades = useMemo(
    () => Array.from(new Set(projects.map((p) => p.priority).filter(Boolean) as string[])).sort(),
    [projects],
  );

  /** Recorte de prazo do projeto — cada um pede uma ação diferente. */
  const faixaPrazo = (p: TableProject): string => {
    if (!p.due_date) return "sem";
    const d = p.due_date.slice(0, 10);
    const hj = new Date().toISOString().slice(0, 10);
    if (d < hj && p.status !== "concluido") return "vencido";
    const em30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    return d <= em30 ? "vence30" : "ok";
  };

  /** Faixa de progresso. "sem" é diferente de 0%: um não tem trabalho
   *  cadastrado, o outro tem e não começou — decisões distintas. */
  const faixaProgresso = (p: TableProject): string => {
    const m = metrics[p.id];
    if (!m || m.total === 0) return "sem";
    if (m.percent === 0) return "parado";
    if (m.percent >= 100) return "pronto";
    return m.percent >= 70 ? "quase" : "andando";
  };

  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  };

  /** Peso do alerta: atrasadas contam mais que tempo parado. */
  const pesoAlerta = (p: TableProject) => {
    const m = metrics[p.id];
    const dias = diasSemMovimento(p.updated_at) ?? 0;
    return (m?.atrasadas ?? 0) * 1000 + (dias >= 30 ? dias : 0);
  };

  const linhas = useMemo(() => {
    const val = (p: TableProject): string | number => {
      switch (sort.key) {
        case "status": return STATUS_LABEL[p.status]?.label ?? p.status;
        case "owner": return (p.owner || "zzz").toLowerCase();
        case "sector": return (p.sector || "zzz").toLowerCase();
        case "percent": return metrics[p.id]?.percent ?? -1;
        // Sem prazo vai para o fim, não para o topo — projeto sem data não é
        // o mais urgente.
        case "due_date": return p.due_date ? new Date(p.due_date).getTime() : Number.MAX_SAFE_INTEGER;
        case "alertas": return pesoAlerta(p);
        default: return (p.title || "").toLowerCase();
      }
    };
    const visiveis = projects.filter((p) => {
      if (fDono && p.owner !== fDono) return false;
      if (fSetor && p.sector !== fSetor) return false;
      if (fTipo && p.project_type !== fTipo) return false;
      if (fPrioridade && p.priority !== fPrioridade) return false;
      if (fPrazo && faixaPrazo(p) !== fPrazo) return false;
      if (fProgresso && faixaProgresso(p) !== fProgresso) return false;
      // "Precisa de atenção" = tarefa atrasada OU parado há 30+ dias. É o
      // mesmo critério da coluna Alertas, para o filtro não discordar do que
      // a tabela mostra.
      if (soAlerta && pesoAlerta(p) === 0) return false;
      return true;
    });

    return visiveis.sort((a, b) => {
      const va = val(a), vb = val(b);
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb));
      return sort.dir === "desc" ? -cmp : cmp;
    });
  }, [projects, metrics, sort, fDono, fSetor, fTipo, fPrioridade, fPrazo, fProgresso, soAlerta]);

  const Th = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={cn("text-left font-medium px-3 py-2 whitespace-nowrap", className)}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        {children}
        {sort.key === k && (sort.dir === "asc"
          ? <ArrowUp className="w-3 h-3" />
          : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );

  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <p className="text-sm text-muted-foreground">Nenhum projeto nesta visão.</p>
      </div>
    );
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const comAlerta = projects.filter((p) => pesoAlerta(p) > 0).length;
  const temFiltro = !!fDono || !!fSetor || !!fTipo || !!fPrioridade || !!fPrazo || !!fProgresso || soAlerta;

  return (
    <>
    {/* Filtros da tabela. Busca por título e estágio já vêm da página — aqui
        entram só os recortes que esta visão introduziu. */}
    <div className="flex items-center gap-2 flex-wrap mb-3">
      <select
        value={fDono}
        onChange={(e) => setFDono(e.target.value)}
        className={cn("h-8 rounded-md border px-2 text-xs transition-colors", fDono ? "border-primary bg-primary/5 text-primary font-medium" : "border-border bg-background text-muted-foreground hover:text-foreground")}
      >
        <option value="">Todos os donos</option>
        {donos.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>

      <select
        value={fSetor}
        onChange={(e) => setFSetor(e.target.value)}
        className={cn("h-8 rounded-md border px-2 text-xs transition-colors", fSetor ? "border-primary bg-primary/5 text-primary font-medium" : "border-border bg-background text-muted-foreground hover:text-foreground")}
      >
        <option value="">Todos os setores</option>
        {setores.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      {/* Só entra na barra o filtro com mais de um valor na base: um seletor
          com uma opção só ocupa espaço e nunca muda nada. */}
      {tipos.length > 1 && (
        <select
          value={fTipo}
          onChange={(e) => setFTipo(e.target.value)}
          className={cn("h-8 rounded-md border px-2 text-xs transition-colors", fTipo ? "border-primary bg-primary/5 text-primary font-medium" : "border-border bg-background text-muted-foreground hover:text-foreground")}
        >
          <option value="">Todos os tipos</option>
          {tipos.map((t) => <option key={t} value={t}>{TYPE_LABEL[t] || t}</option>)}
        </select>
      )}

      {prioridades.length > 1 && (
        <select
          value={fPrioridade}
          onChange={(e) => setFPrioridade(e.target.value)}
          className={cn("h-8 rounded-md border px-2 text-xs transition-colors", fPrioridade ? "border-primary bg-primary/5 text-primary font-medium" : "border-border bg-background text-muted-foreground hover:text-foreground")}
        >
          <option value="">Toda prioridade</option>
          {prioridades.map((p) => (
            <option key={p} value={p}>{PRIORIDADE_LABEL[p] || p}</option>
          ))}
        </select>
      )}

      <select
        value={fPrazo}
        onChange={(e) => setFPrazo(e.target.value)}
        className={cn("h-8 rounded-md border px-2 text-xs transition-colors", fPrazo ? "border-primary bg-primary/5 text-primary font-medium" : "border-border bg-background text-muted-foreground hover:text-foreground")}
      >
        <option value="">Qualquer prazo</option>
        <option value="vencido">Vencido</option>
        <option value="vence30">Vence em 30 dias</option>
        <option value="ok">No prazo</option>
        <option value="sem">Sem prazo</option>
      </select>

      <select
        value={fProgresso}
        onChange={(e) => setFProgresso(e.target.value)}
        className={cn("h-8 rounded-md border px-2 text-xs transition-colors", fProgresso ? "border-primary bg-primary/5 text-primary font-medium" : "border-border bg-background text-muted-foreground hover:text-foreground")}
      >
        <option value="">Qualquer progresso</option>
        <option value="parado">Não começou (0%)</option>
        <option value="andando">Em andamento</option>
        <option value="quase">Quase pronto (70%+)</option>
        <option value="pronto">Concluído (100%)</option>
        <option value="sem">Sem atividades</option>
      </select>

      {/* Só aparece se houver o que mostrar — botão que sempre resulta em
          lista vazia é armadilha. */}
      {comAlerta > 0 && (
        <button
          type="button"
          onClick={() => setSoAlerta((v) => !v)}
          className={cn(
            "h-8 inline-flex items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
            soAlerta
              ? "border-destructive bg-destructive/10 text-destructive"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Precisa de atenção
          <span className="tabular-nums">{comAlerta}</span>
        </button>
      )}

      {temFiltro && (
        <button
          type="button"
          onClick={limparTudo}
          className="h-8 inline-flex items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" /> limpar
        </button>
      )}

      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
        {linhas.length} de {projects.length}
      </span>
    </div>

    <div className="rounded-lg border border-border bg-card overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="bg-muted/40 border-b border-border">
          <tr>
            <Th k="title">Projeto</Th>
            <Th k="status">Estágio</Th>
            <Th k="owner">Dono</Th>
            <Th k="sector" className="hidden md:table-cell">Setor</Th>
            <Th k="percent">Progresso</Th>
            <Th k="due_date">Prazo</Th>
            <Th k="alertas">Alertas</Th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((p) => {
            const m = metrics[p.id];
            const dias = diasSemMovimento(p.updated_at);
            const st = STATUS_LABEL[p.status] ?? { label: p.status, cls: "bg-muted text-muted-foreground" };
            const vencido = !!p.due_date && p.due_date.slice(0, 10) < hoje && p.status !== "concluido";
            const avatar = p.owner ? resolveAvatarFromLookup(p.owner, p.owner, assigneeAvatarMap) : null;

            // Gravidade da linha, na ordem em que alguém age: o que já falhou
            // vem antes do que só merece acompanhamento.
            //
            // Projeto CONCLUÍDO nunca entra em alerta. Sem essa exceção, 16 dos
            // 24 projetos ficavam vermelhos — dois terços da tabela, o que anula
            // o propósito da cor. Um projeto encerrado com pendência é dado a
            // revisar, não trabalho a fazer: ele aparece na coluna de alertas,
            // que continua mostrando o número, mas não pinta a linha.
            //
            // VERMELHO é reservado ao que já falhou de fato: tarefa atrasada.
            // Prazo vencido e progresso 0% ficam em ÂMBAR — merecem olhar, mas
            // já têm cor própria na coluna de prazo e na barra, e somá-los ao
            // vermelho pintava 58% da tabela. Alerta que cobre a maioria das
            // linhas deixa de ser alerta.
            const encerrado = p.status === "concluido";
            const gravidade: "alta" | "media" | "baixa" = encerrado
              ? "baixa"
              : m && m.atrasadas > 0
                ? "alta"
                : vencido || (m && m.total > 0 && m.percent === 0)
                  || (dias !== null && dias >= 30) || faixaPrazo(p) === "vence30"
                  ? "media"
                  : "baixa";

            return (
              <tr
                key={p.id}
                onClick={() => onRowClick?.(p)}
                className={cn(
                  // Zebra: com 7 colunas o olho pula de linha sem ela.
                  "border-b border-border/50 last:border-b-0 even:bg-muted/20 hover:bg-muted/50 transition-colors cursor-pointer",
                  // Faixa lateral de 3px pela gravidade — permite varrer a
                  // tabela sem ler nada. Fina de propósito: colorir a linha
                  // inteira viraria um semáforo e cansaria a leitura.
                  "border-l-[3px]",
                  gravidade === "alta" ? "border-l-destructive"
                    : gravidade === "media" ? "border-l-warning"
                    : "border-l-success/40",
                )}
              >
                <td className="px-3 py-2 max-w-[240px]">
                  <span className="font-medium text-foreground truncate block" title={p.title}>{p.title}</span>
                  {p.project_type && (
                    <span className="text-[10px] text-muted-foreground">
                      {TYPE_LABEL[p.project_type] || p.project_type}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap", st.cls)}>
                    {st.label}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {p.owner ? (
                    <span className="inline-flex items-center gap-1.5 max-w-[130px]">
                      <Avatar className="h-5 w-5 shrink-0">
                        {avatar ? <AvatarImage src={avatar} alt={p.owner} /> : null}
                        <AvatarFallback className="text-[8px]">{getAvatarInitials(p.owner)}</AvatarFallback>
                      </Avatar>
                      <span className="truncate text-muted-foreground">{p.owner}</span>
                    </span>
                  ) : <span className="text-muted-foreground/50">—</span>}
                </td>
                <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">
                  {p.sector || <span className="text-muted-foreground/50">—</span>}
                </td>
                <td className="px-3 py-2">
                  {m && m.total > 0 ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-16 rounded-full bg-muted overflow-hidden shrink-0">
                        {/* Largura mínima de 3% para a barra em 0% existir
                            visualmente — sem isso, "parado" fica idêntico a
                            "sem dado". */}
                        <span
                          className={cn("block h-full rounded-full transition-all", corProgresso(m.percent))}
                          style={{ width: `${Math.max(m.percent, 3)}%` }}
                        />
                      </span>
                      <span className={cn(
                        "tabular-nums text-[11px] font-medium",
                        m.percent === 0 ? "text-destructive"
                          : m.percent >= 100 ? "text-success"
                          : "text-muted-foreground",
                      )}>
                        {m.percent}%
                      </span>
                    </span>
                  ) : <span className="text-muted-foreground/50 text-[11px]">sem atividades</span>}
                </td>
                {/* Só o que sai do normal ganha cor: prazo em dia continua em
                    texto comum. Se tudo é colorido, nada chama atenção. */}
                <td className={cn(
                  "px-3 py-2 whitespace-nowrap tabular-nums",
                  vencido ? "text-destructive font-semibold"
                    : faixaPrazo(p) === "vence30" ? "text-warning font-medium"
                    : "text-muted-foreground",
                )}>
                  {p.due_date ? formatProjectDueDate(p.due_date) : <span className="text-muted-foreground/50">—</span>}
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    {/* Pílula em vez de texto: o alerta precisa ter peso de
                        etiqueta, não de nota de rodapé. */}
                    {m && m.atrasadas > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-destructive font-bold text-[10px]"
                            title={`${m.atrasadas} tarefa(s) com prazo vencido`}>
                        <AlertTriangle className="w-3 h-3" />{m.atrasadas}
                      </span>
                    )}
                    {dias !== null && dias >= 30 && (
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold text-[10px]",
                        dias >= 90 ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning")}
                            title={`Sem alteração há ${dias} dias`}>
                        <Hourglass className="w-3 h-3" />{dias}d
                      </span>
                    )}
                    {/* Silêncio quando está tudo bem: um traço em toda linha
                        saudável só cria ruído na coluna que deve chamar
                        atenção. */}
                  </span>
                </td>
              </tr>
            );
          })}
          {/* Filtro sem resultado: dizer que não há e oferecer a saída, em vez
              de uma tabela vazia que parece defeito. */}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center">
                <p className="text-sm text-muted-foreground mb-2">Nenhum projeto com esses filtros.</p>
                <button
                  type="button"
                  onClick={limparTudo}
                  className="text-xs text-primary hover:underline"
                >
                  limpar filtros
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    </>
  );
}
