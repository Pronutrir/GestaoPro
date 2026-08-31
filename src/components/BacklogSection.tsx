'use client';
import { useState, useEffect, useRef, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PersonCombobox } from "@/components/PersonCombobox";
import {
  CheckCircle2, Circle, Trash2, Inbox, ArrowRight, RotateCcw,
  ChevronDown, ChevronUp, ChevronRight, Plus, Layers, FolderOpen, CircleDashed, UserCheck,
  ChevronsUpDown, ChevronsDownUp, Diamond, EyeOff,
  Rows3, MoreHorizontal, Pencil, Package, IndentIncrease, SlidersHorizontal, Search,
  User, Flag, Calendar as CalendarIcon, Link2, X, Network,
} from "lucide-react";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { EditPhaseDialog } from "@/components/EditPhaseDialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppConfirm } from "@/components/AppConfirmProvider";
import { buildAvatarLookupMap, getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";
import { EAP_FASE_LEVEL, eapCanGroup, eapIsFaseLevel, eapLevel, eapRootCode, resolveEapKind, type EapKind } from "@/lib/eapModel";
import { podePromover, motivoNaoPromove } from "@/lib/quadroDeExecucao";
import { traduzirErroDoBanco } from "@/lib/erroDoBanco";
import { EapVisual } from "@/components/backlog/EapVisual";
import { parseWorkflowCategory, categoryFromLegacyFlags } from "@/lib/workflowCategory";
import { ehBacklog } from "@/components/kanban/shared";
import {
  avaliarProntidao, resumirProntidao, principaisCarencias,
  PRONTIDAO_LABELS, PRONTIDAO_LABELS_LONGOS,
} from "@/lib/prontidao";
import { LinkParentDialog } from "@/components/LinkParentDialog";
import { mutateInChunks, selectInChunks } from "@/lib/chunkedIn";
import { formatarDataBR, estaAtrasado, diasAte } from "@/lib/dataLocal";
import { GUT_META, normalizeGut, type GutLevel } from "@/lib/gutPriority";
// As sete decisões visuais da mesa de planejamento, como regras testáveis —
// 42 verificações em scripts/verificar-mesa-de-planejamento.cjs. A tela
// CONSOME; não reimplementa nenhuma delas, senão Backlog e Kanban divergem no
// limiar do GUT e no que "vazio" significa.
import {
  faixaDoGut,
  mostrarBadgeDeTipo,
  resumoDoGrupo,
  totalDoProjeto,
  corDoGut,
  ROTULO_GUT_VAZIO,
  comoMostrarVazio,
  CLASSE_NUMERO,
  formatarHoras,
  formatarCusto,
  codigoParaExibir,
  textoDaFaixa,
} from "@/lib/mesaDePlanejamento";
import { useAuth } from "@/contexts/AuthContext";
import { useKanbanPrefs } from "@/hooks/useKanbanPrefs";
import { ALTURA_DA_LINHA, type DensidadeBacklog } from "@/lib/kanbanPrefs";

interface Phase {
  id: string;
  title: string;
  // Campos opcionais: a query da página usa select("*"), mas o ambiente pode
  // não ter as colunas (migrations pendentes) — o diálogo degrada por campo.
  description?: string | null;
  wbs_code?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
}
interface WorkflowStage {
  id: string; title: string; display_order: number; color: string;
  /** Coluna final: mover para ela CONCLUI a tarefa (status + completed_at). */
  is_final?: boolean | null;
}
interface Activity {
  id: string;
  title: string;
  description: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
  cost: number;
  hours: number;
  phase_id: string | null;
  display_order?: number | null;
  priority?: string;
  tags?: string[];
  parent_id?: string | null;
  workflow_stage_id?: string | null;
  item_type?: string | null;
  is_milestone?: boolean | null;
  /** Código da EAP: define o papel (nível 1 = Fase, 2+ = Atividade). */
  wbs_code?: string | null;
  /** Arquivada (soft-delete). Fica fora da árvore e das contagens. */
  is_trashed?: boolean | null;
  /** Gravidade do GUT — é o que marca a prioridade como definida. */
  gravity?: number | null;
  /** G×U×T, de 1 a 125. É o número que a coluna de prioridade mostra. */
  priority_score?: number | null;

  // ── Derivado no servidor (migration 20260826130000) ────────────────────
  // Preenchido por trigger sobre TODAS as filhas, não sobre a fatia que a RLS
  // deixou passar. `null` = ainda não derivado; a célula mostra ausência e
  // NUNCA cai para as horas próprias do pai (seria o total errado, calado).
  derived_hours?: number | string | null;
  derived_cost?: number | string | null;
  derived_children?: number | null;
  /** A janela derivada: da filha que começa mais cedo à que termina mais tarde. */
  derived_start?: string | null;
  derived_end?: string | null;
}

/** Os chips de recorte rápido do topo. Combinam por E. */
type RecorteRapido = "minhas" | "sem-resp" | "sem-data" | "no-quadro";

interface BacklogSectionProps {
  projectId: string;
  activities: Activity[];
  phases: Phase[];
  onEditActivity: (activity: Activity) => void;
  onDeleteActivity: (activityId: string) => void;
  onToggleActivity: (activityId: string, currentStatus: string) => void;
  onDataChanged: () => void;
  isAdmin?: boolean;
  /** Por que arquivar está indisponível (projeto concluído, sem permissão…).
   *  Quando vem preenchido, o botão fica DESABILITADO com este texto no
   *  tooltip em vez de sumir — some sem explicação vira "não consigo excluir". */
  deleteBlockedReason?: string;
  hasActiveFilters?: boolean;
  /**
   * A atividade é da pessoa (responsável, participante ou criador)?
   *
   * `undefined` quando ela edita tudo — aí não há distinção a fazer, e nem o
   * filtro nem a marca aparecem. Vem da página, que é onde vivem as
   * identidades (nome, e-mail, id) para casar com o texto livre dos campos.
   */
  ehMinha?: (a: Activity) => boolean;
  /** Filtros que viviam na barra da página e passaram para o painel "Filtros".
   *  Ficam LÁ porque recortam `activities` antes de chegar aqui; o painel é só
   *  onde se mexe neles, junto dos demais. */
  statusFilter?: string;
  onStatusFilterChange?: (v: string) => void;
  priorityFilter?: string;
  onPriorityFilterChange?: (v: string) => void;
  /** Busca da página. Vem por prop porque recorta `activities` antes de chegar
   *  aqui — o componente só empresta o lugar, ao lado dos segmentos. */
  search?: string;
  onSearchChange?: (v: string) => void;
  /** "Nova Atividade" e "Importar EAP", renderizados no INÍCIO da linha de
   *  filtros. Vêm da página porque dependem de permissão e de diálogos que
   *  vivem lá — mas pertencem visualmente a esta linha, não a uma acima. */
  acoes?: React.ReactNode;
  /** Nome do projeto — vira a caixa-raiz da EAP visual. Opcional: sem ele a
   *  árvore ainda desenha, com um rótulo genérico na raiz. */
  projectTitle?: string;
}

export const BacklogSection = ({
  projectId, activities, phases,
  onEditActivity, onDeleteActivity, onToggleActivity,
  onDataChanged, isAdmin = false, deleteBlockedReason, hasActiveFilters, ehMinha,
  statusFilter = "all", onStatusFilterChange,
  priorityFilter = "all", onPriorityFilterChange,
  search = "", onSearchChange, acoes,
  projectTitle,
}: BacklogSectionProps) => {
  const { toast } = useToast();
  const appConfirm = useAppConfirm();
  const [backlogStageId, setBacklogStageId] = useState<string | null>(null);
  // Todos os stages, incluindo o "Backlog" (display_order=0), para mostrar badge de status
  const [allStages, setAllStages] = useState<WorkflowStage[]>([]);
  /**
   * "Tudo" (padrão) × "só a fila".
   *
   * O BACKLOG É A LISTA COMPLETA DO PROJETO, e o Kanban é outra visão dos
   * mesmos itens — decisão de 13/08/2026. Um item movido para o quadro NÃO
   * some daqui: ele continua na lista, com a coluna onde está no selo de
   * status. Backlog responde "o que existe"; Kanban responde "onde está".
   *
   * Isto reverte o padrão que eu tinha adotado (só a fila). O modelo Jira —
   * item está OU no backlog OU no sprint — não é o desta ferramenta: aqui a
   * aba é a EAP inteira, com responsável e prazo à vista.
   *
   * O recorte de fila continua disponível no interruptor, para quem quiser
   * ver só o que ainda não começou.
   */
  const [mostrarTudo, setMostrarTudo] = useState(true);
  /**
   * FILTRO "MINHAS" — mesmo padrão do `onlyMine` no Kanban.
   *
   * Quem edita só as suas via 166 atividades sem saber quais 3 podia tocar.
   * O interruptor recorta para o que ela edita; desligado, a marca na linha
   * continua distinguindo. Só existe quando `ehMinha` vem — para quem edita
   * tudo a distinção não faz sentido.
   *
   * Começa DESLIGADO: abrir já filtrado esconderia o projeto sem avisar, que
   * é o mesmo erro do recorte silencioso que corrigimos em 25/08.
   */
  const [soMinhas, setSoMinhas] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  /** "Levar as subatividades junto" — PERGUNTADO, e desmarcado por padrao.
   *  Nunca automatico: levar junto e decisao de escopo, de quem promove. */
  const [levarSubatividades, setLevarSubatividades] = useState(false);
  /** Qual linha esta com o seletor de responsavel aberto (o botao + Sem responsavel). */
  const [openAssigneeFor, setOpenAssigneeFor] = useState<string | null>(null);
  const [targetStageId, setTargetStageId] = useState<string>("");
  const [assignee, setAssignee] = useState<string>("");
  const [isMoving, setIsMoving] = useState(false);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null; email: string | null; avatar_url: string | null }[]>([]);
  const [profileNameMap, setProfileNameMap] = useState<Record<string, string>>({});
  const [profileAvatarMap, setProfileAvatarMap] = useState<Record<string, string>>({});
  const [showTrash, setShowTrash] = useState(false);
  const [trashedActivities, setTrashedActivities] = useState<any[]>([]);
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(null);
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set());
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());
  const [dependencyCounts, setDependencyCounts] = useState<Map<string, { pred: number; succ: number }>>(new Map());
  // Inline quick-add: key = `phase:<id|none>` or `parent:<id>`
  const [quickAddKey, setQuickAddKey] = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  // Inline edit title
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState("");
  // Modo de seleção em lote: quando ativo, exibe checkboxes nas linhas
  const [selectMode, setSelectMode] = useState(false);
  // Recorte por prontidão — ver lib/prontidao. Não é persistido de propósito:
  // é um recorte de trabalho ("o que preciso completar agora"), não uma
  // preferência de visualização como as colunas ou o agrupamento.
  const [prontidaoFilter, setProntidaoFilter] = useState<"all" | "ready" | "incomplete">("all");
  /** Os chips de recorte rapido. Combinam por E, e cada um liga/desliga. */
  const [recortesAtivos, setRecortesAtivos] = useState<Set<RecorteRapido>>(new Set());
  const alternarRecorte = (id: RecorteRapido) =>
    setRecortesAtivos((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  // Mover item para dentro de outro (troca parent_id). Menu de linha, não
  // arraste: numa lista aninhada "soltar sobre" (aninha) e "soltar entre"
  // (reordena) ficam a pixels de distância, e aninhar por engano é caro de
  // desfazer. No Kanban o arraste faz sentido; aqui não.
  const [moveIntoIds, setMoveIntoIds] = useState<string[] | null>(null);
  const [moveIntoCurrentParent, setMoveIntoCurrentParent] = useState<string | null>(null);
  /** Qual seletor de preenchimento em lote está aberto (um de cada vez). */
  const [bulkField, setBulkField] = useState<"assigned_to" | "end_date" | "priority" | null>(null);
  const [sequenciando, setSequenciando] = useState(false);
  // Agrupar em raias (como no Kanban). "phase" preserva a árvore EAP atual;
  // as demais exibem grupos planos por dimensão. Persistido por projeto.
  /**
   * DENSIDADE — compacto (30px) ou confortável (36px), guardada POR USUÁRIO.
   *
   * Vai pelo `useKanbanPrefs`, que já resolve o caminho inteiro: cache local
   * síncrono no primeiro render, banco por cima quando responde, e debounce na
   * escrita. A fase 06 pede exatamente isso — "siga o mesmo caminho, não
   * invente um segundo".
   *
   * Sem usuário (ou com a migration de prefs pendente), o hook cai no cache
   * local sozinho e a tela funciona igual.
   */
  const { user } = useAuth();
  const { prefs, setPrefs } = useKanbanPrefs(projectId, user?.id ?? null);
  const densidade: DensidadeBacklog = prefs.densidadeBacklog ?? "confortavel";
  const alturaDaLinha = ALTURA_DA_LINHA[densidade];

  type GroupBy = "phase" | "assignee" | "priority" | "status" | "type";
  const groupByKey = `backlog-groupby:${projectId}`;
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    if (typeof window === "undefined") return "phase";
    try {
      const stored = localStorage.getItem(`backlog-groupby:${projectId}`);
      return (stored as GroupBy) || "phase";
    } catch { return "phase"; }
  });
  const changeGroupBy = (v: GroupBy) => {
    setGroupBy(v);
    try { localStorage.setItem(groupByKey, v); } catch { /* quota */ }
  };
  /**
   * Lista ou EAP — a MESMA informação, desenhada de dois jeitos.
   *
   * A EAP visual não é uma tela nova: é o modo de exibição desta aqui. A busca,
   * os filtros e o recorte de itens continuam valendo — o que muda é só o
   * desenho da hierarquia. Por isso mora aqui e não numa aba de primeiro nível.
   *
   * NÃO É PERSISTIDO, diferente do agrupamento. O Backlog abre SEMPRE em Lista:
   * é onde se trabalha — marcar, editar, arrastar, filtrar. A EAP é para
   * conferir a estrutura ou apresentar, uma consulta pontual.
   *
   * Salvar a escolha faria quem entrasse uma vez na EAP reencontrá-la dias
   * depois, sem lembrar por quê, numa tela que não deixa mexer em nada. E a
   * volta nem sempre era óbvia: um filtro que esvaziasse a lista escondia o
   * próprio seletor. Abrir sempre no mesmo lugar vale mais que lembrar a última
   * escolha, quando os dois modos servem a propósitos tão diferentes.
   */
  type ModoExibicao = "lista" | "eap";
  const [modo, setModo] = useState<ModoExibicao>("lista");
  const changeModo = (v: ModoExibicao) => setModo(v);
  // Limpa a chave que a versão anterior gravava. Ela já não é lida, mas ficaria
  // no navegador de quem usou a EAP — lixo que ninguém mais explica.
  useEffect(() => {
    try { localStorage.removeItem(`backlog-modo:${projectId}`); } catch { /* quota */ }
  }, [projectId]);
  // Chaves de grupos colapsados no modo "raia" (plano), separado do da árvore.
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(new Set());
  const toggleLane = (id: string) =>
    setCollapsedLanes((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Colunas selecionáveis do backlog (o usuário escolhe o que ver). Persistido
  // por projeto, mesmo padrão da tabela de subatividades.
  // Largura elástica (minmax) em vez de fixa: com valores fixos a soma passava
  // de 760px e a última coluna — a de ações — saía da tela, exigindo rolagem
  // lateral para chegar ao botão de arquivar. Agora cada coluna encolhe até um
  // mínimo ainda legível e a tabela cabe na largura disponível.
  // Máximos mais enxutos: as colunas de dado não precisam crescer sem limite —
  // a folga vai para o título, que é o que a pessoa lê. Prazo e Horas seguram
  // conteúdo curto ("20/07/2026", "55h") e não justificam largura de sobra.
  /**
   * AS COLUNAS DO BACKLOG — a ordem é a do desenho, e a ordem importa.
   *
   * EAP · TIPO · NOME · RESPONSÁVEL · PREVISTO · ESFORÇO · GUT
   *
   * (EAP, TIPO e NOME vivem no prefixo fixo do grid, junto da caixa e do
   * chevron; daqui para a direita são as opcionais.)
   *
   * **STATUS SAIU.** Backlog é planejamento, não execução: o backlog inteiro
   * está no backlog, e repetir isso em 141 linhas é ruído. Quem quer ver
   * estágio abre o quadro — é a tela que existe para isso.
   *
   * PREVISTO passou a ser a JANELA (`08/09 → 09/09`), não só o prazo: planejar
   * é decidir quando começa e quando termina, e mostrar só o fim esconde
   * metade da decisão.
   */
  const BACKLOG_COLS: { id: string; label: string; width: string; align?: "center" | "left" }[] = [
    { id: "assigned_to", label: "Responsável", width: "minmax(96px,168px)", align: "left" },
    { id: "end_date", label: "Previsto", width: "minmax(104px,132px)", align: "left" },
    /**
     * SITUAÇÃO — onde o item está, e ela só fala quando tem o que dizer.
     *
     * A coluna Status tinha saído do desenho por uma premissa errada: a de que
     * o backlog lista apenas itens da fila. Ele lista TODOS — medido no projeto
     * de teste: 141 vivos, 5 já no quadro, misturados e indistinguíveis.
     *
     * Quem está na fila mostra VAZIO — sem traço, sem palavra, sem
     * placeholder. Um traço em 136 de 141 linhas seria ruído, e o vazio já
     * significa "na fila" por ser o estado normal desta tela.
     */
    { id: "situacao", label: "Situação", width: "minmax(92px,124px)", align: "left" },
    { id: "hours", label: "Esforço", width: "minmax(48px,68px)", align: "left" },
    { id: "priority", label: "GUT", width: "minmax(44px,64px)", align: "left" },
  ];
  const BACKLOG_COLS_DEFAULT = ["assigned_to", "end_date", "situacao", "hours", "priority"];
  const backlogColsKey = `backlog-cols:${projectId}`;
  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    if (typeof window === "undefined") return BACKLOG_COLS_DEFAULT;
    try {
      const stored = localStorage.getItem(`backlog-cols:${projectId}`);
      if (!stored) return BACKLOG_COLS_DEFAULT;
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : BACKLOG_COLS_DEFAULT;
    } catch {
      return BACKLOG_COLS_DEFAULT;
    }
  });
  const toggleCol = (id: string) => {
    setVisibleCols((prev) => {
      const next = prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id];
      try { localStorage.setItem(backlogColsKey, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  };
  // Largura real do container (não da janela): o backlog também aparece dentro
  // de painéis estreitos, onde uma media query da viewport erraria.
  const tableRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(0);
  useEffect(() => {
    const el = tableRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setTableWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Quando o espaço aperta, some com as colunas menos essenciais em vez de
  // criar rolagem lateral. Ordem de descarte = da menos para a mais decisiva
  // na leitura do backlog; tarefa e ações nunca saem.
  // situacao entra na ordem de descarte, mas TARDE: ela responde "isto já
  // está sendo feito?", que é decisão, enquanto esforço e previsto são
  // referência. Some antes de responsável e GUT, e depois de horas e datas.
  const DROP_ORDER = ["hours", "end_date", "situacao", "assigned_to", "status", "priority"];
  const chosenCols = BACKLOG_COLS.filter((c) => visibleCols.includes(c.id));
  const activeCols = (() => {
    // 0 = ainda não medido (primeiro render): mostra tudo e deixa o
    // ResizeObserver corrigir, em vez de piscar escondendo colunas.
    if (tableWidth === 0) return chosenCols;
    const FIXED = 20 + 26 + 32 + 120; // expand + check + ações + mínimo da Tarefa
    const minOf = (c: { width: string }) => Number(c.width.match(/minmax\((\d+)px/)?.[1] ?? 0);
    let cols = [...chosenCols];
    const fits = () => FIXED + cols.reduce((s, c) => s + minOf(c), 0) + 8 * (3 + cols.length) <= tableWidth;
    for (const id of DROP_ORDER) {
      if (fits()) break;
      cols = cols.filter((c) => c.id !== id);
    }
    return cols;
  })();

  // Grid: [expand 20][check 26][tarefa flex][...colunas][ações 32]
  // Ações agora é um único "⋯" (antes eram dois botões, daí os 60px): a folga
  // volta para o título, que é o que a pessoa lê.
  // O mínimo da coluna Tarefa é baixo de propósito: ela tem `truncate`, então
  // encolher corta o texto com reticências — o que é preferível a empurrar a
  // coluna de ações para fora da tela.
  // A coluna de 26px é da CAIXA DE SELEÇÃO. Ela existe SEMPRE: fora do modo
  // seleção a caixa é a porta de entrada para ele, e antes dividia os mesmos
  // 20px com a seta — empilhadas, a seta sumindo no hover para a caixa tomar
  // o lugar. Quem mirava a seta via o alvo trocar de função debaixo do cursor.
  // Duas coisas clicáveis, duas células.
  /**
   * O GRID DA TABELA — a ordem do desenho, da esquerda para a direita.
   *
   *   26px  caixa de seleção
   *   20px  chevron (expandir)
   *   68px  EAP — mono, largura fixa: código alinhado é o que deixa a árvore
   *         legível de relance, e `1fr` faria `1.1` e `1.1.10.2` começarem em
   *         pontos diferentes
   *   58px  TIPO — cabe "ATIVIDADE" em 9px; MARCO é mais curto
   *   1fr   NOME — o que sobra, porque é o que a pessoa lê
   *   …     as opcionais (responsável, previsto, esforço, GUT)
   *   32px  o "⋯" das ações
   */
  const backlogGrid = `26px 20px 68px 58px minmax(120px,1fr) ${activeCols.map((c) => c.width).join(" ")} 32px`;

  /**
   * A caixa aparece no HOVER — mas na coluna dela, não por cima da seta.
   *
   * Duas correções seguidas, e o meio-termo é este. Primeiro a caixa vivia
   * empilhada sobre a seta e a substituía no hover: mirar o expandir fazia o
   * alvo trocar de função debaixo do cursor. Aí eu as separei em colunas e
   * deixei as duas sempre visíveis — e a tela virou uma fileira de quadrados
   * azuis descendo a lateral inteira, disputando atenção com o título, que é
   * o que a pessoa lê.
   *
   * O que causava a armadilha era a SOBREPOSIÇÃO, não o hover. Com célula
   * própria, a caixa some sem mexer na seta: o expandir fica firme no lugar,
   * a linha continua dizendo se está aberta, e a lateral fica limpa.
   *
   * `focus-visible` mantém o teclado: quem navega por Tab precisa ver onde
   * está, e ninguém dá hover com teclado.
   */
  const caixaNoHover =
    "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity";

  useEffect(() => {
    const ids = activities.map((a) => a.id);
    if (ids.length === 0) {
      setDependencyCounts(new Map());
      return;
    }
    // Em lotes de 50: a lista de ids na URL estoura o limite do proxy e volta
    // 502 com projeto grande (ver lib/chunkedIn). Dedup por id porque uma
    // dependência pode casar em dois lotes.
    selectInChunks<{ id: string; predecessor_id: string; successor_id: string }>(ids, (batch) =>
      supabase
        .from("task_dependencies")
        .select("id, predecessor_id, successor_id")
        .or(`predecessor_id.in.(${batch.join(",")}),successor_id.in.(${batch.join(",")})`),
      // 2: o `.or` acima repete o lote em DOIS filtros, entao cada id custa o
      // dobro na URL. Sem isto o lote de 50 vira 3.742 chars, o proxy devolve
      // 502, e a tela abre dizendo que as dependencias nao carregaram.
      2,
    )
      .then((linhas) => {
        const vistos = new Set<string>();
        const data = linhas.filter((d) => (vistos.has(d.id) ? false : (vistos.add(d.id), true)));
        const map = new Map<string, { pred: number; succ: number }>();
        data.forEach((d) => {
          const p = map.get(d.successor_id) || { pred: 0, succ: 0 };
          p.pred += 1;
          map.set(d.successor_id, p);
          const s = map.get(d.predecessor_id) || { pred: 0, succ: 0 };
          s.succ += 1;
          map.set(d.predecessor_id, s);
        });
        setDependencyCounts(map);
      })
      .catch((err) => {
        console.error("task_dependencies (backlog):", err);
        toast({ title: "Dependências não carregaram", description: "Os contadores de dependência podem faltar. Recarregue a página.", variant: "destructive" });
      });
  }, [activities, toast]);

  useEffect(() => {
    const fetchProfiles = async () => {
      const [{ data: profilesData }, { data: adminRoles }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, avatar_url, sector, role_title").eq("is_active", true).order("full_name"),
        supabase.from("user_roles").select("user_id").eq("role", "admin"),
      ]);
      if (profilesData) {
        const adminIds = new Set((adminRoles || []).map((r: any) => r.user_id));
        const filteredProfiles = profilesData.filter((p) => !adminIds.has(p.id));
        setProfiles(filteredProfiles);
        const nextNameMap: Record<string, string> = {};
        filteredProfiles.forEach((profile) => {
          const fullName = typeof profile.full_name === "string" ? profile.full_name.trim() : "";
          const email = typeof profile.email === "string" ? profile.email.trim() : "";
          if (fullName && profile.id) nextNameMap[profile.id] = fullName;
          if (fullName) nextNameMap[fullName] = fullName;
          if (email && fullName) nextNameMap[email] = fullName;
        });
        setProfileNameMap(nextNameMap);
        setProfileAvatarMap(buildAvatarLookupMap(filteredProfiles));
      }
    };
    fetchProfiles();
  }, []);

  useEffect(() => {
    const fetchStages = async () => {
      const { data } = await supabase
        .from("workflow_stages")
        // `*` em vez da lista de campos: a coluna `categoria` não está nos
        // tipos gerados até a migration rodar, e nomeá-la aqui quebraria o
        // typecheck. Ela decide se o item está NA FILA — é o que separa o
        // backlog do trabalho em curso.
        .select("*")
        .eq("project_id", projectId)
        .order("display_order");
      if (data) {
        // `ehBacklog` (categoria, com o nome de fallback) e NÃO
        // `display_order === 0`: em projeto novo a posição 0 é do "Não
        // iniciado" — a coluna de ENTRADA do quadro. Pela regra antiga, item
        // criado aqui nascia no Kanban em vez de ficar na fila.
        setBacklogStageId(data.find((s) => ehBacklog(s as never))?.id ?? null);
        setAllStages(data);
      }
    };
    fetchStages();
  }, [projectId]);

  const fetchTrashedActivities = async () => {
    const { data } = await (supabase
      .from("activities").select("*").eq("project_id", projectId) as any).eq("is_trashed", true)
      .order("trashed_at", { ascending: false });
    setTrashedActivities(data || []);
  };

  useEffect(() => { if (showTrash) fetchTrashedActivities(); }, [showTrash, projectId]);

  /**
   * A FASE VOLTA COM A TAREFA.
   *
   * Arquivar a última tarefa de uma fase leva a fase junto (ver
   * `aplicarEmLote`), então restaurar só a tarefa a devolveria para uma fase
   * arquivada: ela reapareceria em "Sem fase", com o vínculo intacto no banco
   * mas invisível na tela — o pior dos dois mundos.
   *
   * Desarquiva sem perguntar: a fase é o contêiner, e ninguém restaura uma
   * tarefa querendo que ela caia fora do lugar de onde saiu.
   */
  const restaurarFaseDe = async (activityId: string) => {
    const alvo = trashedActivities.find((a) => a.id === activityId);
    if (!alvo?.phase_id) return;
    await supabase
      .from("phases")
      .update({ is_trashed: false, trashed_at: null } as never)
      .eq("id", alvo.phase_id)
      .eq("is_trashed", true);
  };

  /**
   * SUCESSO SEM ESCRITA NAO E SUCESSO.
   *
   * Estes quatro caminhos gravavam sem olhar o retorno: a RLS recusava, o
   *  vinha preenchido e a tela anunciava "restaurada!" do mesmo jeito.
   * Um UPDATE/DELETE que nao casa nenhuma linha tambem nao e erro no
   * PostgREST, entao ler so o  nao basta -- por isso .
   */
  /**
   * SUCESSO SEM ESCRITA NÃO É SUCESSO.
   *
   * Os quatro caminhos da lixeira gravavam sem olhar o retorno: a RLS recusava,
   * o `error` vinha preenchido, e a tela anunciava "excluída permanentemente!"
   * do mesmo jeito. `handlePermanentDelete` e `handleEmptyTrash` sequer
   * checavam permissão — qualquer um que enxergasse a lixeira via o botão.
   *
   * Ler só o `error` não basta: no PostgREST, um UPDATE/DELETE que não casa
   * nenhuma linha volta SEM erro. Por isso `count: "exact"` — zero linha
   * afetada é uma recusa silenciosa da RLS, e precisa aparecer como recusa.
   *
   * Ver a memória do projeto: "erro do banco chega como silêncio".
   */
  const handleRestore = async (activityId: string) => {
    const { error, count } = await (supabase
      .from("activities")
      .update({ is_trashed: false, trashed_at: null } as never, { count: "exact" }))
      .eq("id", activityId);
    if (error || !count) {
      toast({
        title: "Não foi possível restaurar",
        description: error?.message || "Você não tem permissão para restaurar esta atividade.",
        variant: "destructive",
      });
      return;
    }
    await restaurarFaseDe(activityId);
    toast({ title: "Atividade restaurada!" });
    fetchTrashedActivities();
    onDataChanged();
  };
  const handlePermanentDelete = async () => {
    if (!permanentDeleteId) return;
    if (!isAdmin) {
      toast({
        title: "Sem permissão",
        description: "Só quem gerencia o projeto exclui definitivamente.",
        variant: "destructive",
      });
      setPermanentDeleteId(null);
      return;
    }
    const { error, count } = await (supabase
      .from("activities")
      .delete({ count: "exact" }) as any)
      .eq("id", permanentDeleteId);
    setPermanentDeleteId(null);
    if (error || !count) {
      toast({
        title: "Não foi possível excluir",
        description: error?.message || "O banco recusou a exclusão desta atividade.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Atividade excluída permanentemente!" });
    fetchTrashedActivities();
  };
  const handleRestoreAll = async () => {
    const ok = await appConfirm({
      title: "Restaurar atividades",
      description: `Restaurar todas as ${trashedActivities.length} atividades da lixeira?`,
      confirmText: "Restaurar",
    });
    if (!ok) return;
    // As fases das tarefas restauradas voltam junto — mesma razão de
    // `restaurarFaseDe`, aplicada ao lote inteiro de uma vez.
    const fases = [...new Set(trashedActivities.map((a) => a.phase_id).filter(Boolean))] as string[];
    const { error: erroRestaurar, count } = await (supabase
      .from("activities")
      .update({ is_trashed: false, trashed_at: null } as any, { count: "exact" })
      .eq("project_id", projectId) as any)
      .eq("is_trashed", true);
    if (erroRestaurar || !count) {
      toast({
        title: "Não foi possível restaurar",
        description: erroRestaurar?.message || "Você não tem permissão para restaurar estas atividades.",
        variant: "destructive",
      });
      return;
    }
    if (fases.length > 0) {
      await mutateInChunks(fases, (batch) =>
        supabase
          .from("phases")
          .update({ is_trashed: false, trashed_at: null } as never)
          .in("id", batch)
          .eq("is_trashed", true),
      );
    }
    toast({ title: "Todas as atividades restauradas!" });
    fetchTrashedActivities();
    onDataChanged();
  };
  const handleEmptyTrash = async () => {
    if (!isAdmin) {
      toast({
        title: "Sem permissão",
        description: "Só quem gerencia o projeto esvazia a lixeira.",
        variant: "destructive",
      });
      return;
    }
    const ok = await appConfirm({
      title: "Esvaziar lixeira",
      description: `Excluir PERMANENTEMENTE todas as ${trashedActivities.length} atividades? Esta ação é irreversível.`,
      confirmText: "Excluir tudo",
      destructive: true,
    });
    if (!ok) return;
    const { error, count } = await (supabase
      .from("activities")
      .delete({ count: "exact" })
      .eq("project_id", projectId) as any)
      .eq("is_trashed", true);
    if (error || !count) {
      toast({
        title: "Não foi possível esvaziar",
        description: error?.message || "O banco recusou a exclusão destas atividades.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Lixeira esvaziada!" });
    fetchTrashedActivities();
  };

  // Lista completa: TODAS as tarefas do projeto (modelo "uma coleção, várias visões").
  // O status é exibido como atributo (badge), não como filtro de tela.
  //
  // ARQUIVADAS FORA: a lixeira tem tela própria (showTrash). Sem este filtro, um
  // item arquivado continuava na árvore e no contador de filhos do pai — daí o
  // "Receber demanda da Diretoria (3)" com três subatividades excluídas
  // aparecendo aqui, enquanto a aba Subatividades do diálogo, que filtra
  // corretamente, mostrava vazio. As duas telas liam a mesma coisa e discordavam.
  /**
   * O item ainda está NA FILA?
   *
   * Categoria `backlog` ou `a_iniciar` = não começou. Qualquer outra (andamento,
   * espera, revisão, concluída, cancelada) significa que o trabalho já anda no
   * quadro.
   *
   * Item SEM coluna conta como fila: foi criado e ainda não foi posicionado.
   *
   * Serve só ao RECORTE OPCIONAL "ver só o que não começou" — a aba mostra o
   * projeto inteiro por padrão, e nada some daqui por ter ido para o quadro.
   */
  /**
   * Quantos de um grupo ainda estão NA FILA — para a faixa dizer "4 de 6".
   *
   * Usa a categoria `backlog` da coluna, não o helper `naFila` abaixo: aquele
   * conta "a_iniciar" como fila porque responde outra pergunta ("o que ainda
   * não começou"). "Não iniciado" é coluna do quadro.
   */
  const contarNaFila = (itens: { workflow_stage_id?: string | null }[]): number =>
    itens.filter((a) => {
      const col = allStages.find((s2) => s2.id === a.workflow_stage_id);
      if (!col) return true;
      const cat = parseWorkflowCategory((col as { categoria?: string }).categoria)
        ?? categoryFromLegacyFlags(col as never);
      return cat === "backlog";
    }).length;

  const naFila = (a: Activity): boolean => {
    if (!a.workflow_stage_id) return true;
    const col = allStages.find((s) => s.id === a.workflow_stage_id);
    if (!col) return true; // coluna desconhecida: não esconde o item
    const cat = parseWorkflowCategory((col as { categoria?: string }).categoria)
      ?? categoryFromLegacyFlags(col as never);
    return cat === "backlog" || cat === "a_iniciar";
  };

  /**
   * A aba mostra SÓ A FILA — o que ainda não começou.
   *
   * Antes exibia `activities.filter(a => !a.is_trashed)`: tudo que não estava
   * na lixeira, inclusive concluídas e em andamento. Uma tarefa arrastada no
   * Kanban continuava aqui como se ainda esperasse, e a fila deixava de
   * responder "o que vem primeiro?" — priorizar 200 itens dos quais 150 já
   * saíram é trabalho jogado fora. Pior: os números do topo ("prontas para
   * executar", "falta responsável em 16") mediam o projeto inteiro.
   *
   * Jira, Azure DevOps e Linear separam pelo ESTADO do item, e sair do estado
   * tira da fila automaticamente. O Trello e o contraexemplo — tudo convive, e
   * a lista cresce sem fim.
   *
   * AGRUPADOR fica enquanto tiver descendente na fila: a estrutura existe para
   * segurar o conteúdo, não sozinha.
   */
  const soAFila = (lista: Activity[]): Activity[] => {
    // SÓ AS FOLHAS decidem. Agrupador não tem coluna própria (é rollup), então
    // `naFila` o aprovaria por si mesmo — e uma fase com todos os filhos
    // concluídos continuaria na lista, vazia. Ele entra depois, pelo caminho de
    // volta, quando algum descendente estiver na fila.
    const temFilho = new Set(lista.filter((a) => a.parent_id).map((a) => a.parent_id as string));
    const folhasNaFila = new Set(
      lista.filter((a) => !temFilho.has(a.id) && naFila(a)).map((a) => a.id),
    );
    const porId = new Map(lista.map((a) => [a.id, a]));
    // Sobe de cada item da fila até a raiz, mantendo os ancestrais no caminho.
    const manter = new Set(folhasNaFila);
    for (const id of folhasNaFila) {
      let atual = porId.get(id);
      const visto = new Set<string>([id]);
      while (atual?.parent_id && !visto.has(atual.parent_id)) {
        visto.add(atual.parent_id);
        manter.add(atual.parent_id);
        atual = porId.get(atual.parent_id);
      }
    }
    return lista.filter((a) => manter.has(a.id));
  };

  /**
   * Quantas FOLHAS saíram da fila — o número do aviso.
   *
   * Só folhas: agrupador não "sai", ele acompanha os filhos. Contá-lo inflaria
   * o aviso com estrutura, não com trabalho.
   */
  const foraDaFila = useMemo(() => {
    const temFilho = new Set(
      activities.filter((a) => !a.is_trashed && a.parent_id).map((a) => a.parent_id as string),
    );
    return activities.filter((a) => !a.is_trashed && !temFilho.has(a.id) && !naFila(a)).length;
    // `naFila` depende de allStages; sem ele na lista o número congelaria no
    // primeiro render, antes de as colunas chegarem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities, allStages]);

  const backlogActs = (() => {
    const semLixeira = activities.filter((a) => !a.is_trashed);
    let vivas = mostrarTudo ? semLixeira : soAFila(semLixeira);

    /* FILTRO "MINHAS" — preserva os ancestrais, como todos os outros filtros
       desta tela. Sem isso a atividade que casa vira órfã e some, embora tenha
       passado: a lista é desenhada por fase, e sem o pai não há onde pendurar. */
    if (soMinhas && ehMinha) {
      const minhas = vivas.filter(ehMinha);
      const porId = new Map(vivas.map((a) => [a.id, a]));
      const manter = new Set(minhas.map((a) => a.id));
      for (const a of minhas) {
        let atual: Activity | undefined = a;
        const visto = new Set<string>([a.id]);
        while (atual?.parent_id && !visto.has(atual.parent_id)) {
          visto.add(atual.parent_id);
          manter.add(atual.parent_id);
          atual = porId.get(atual.parent_id);
        }
      }
      vivas = vivas.filter((a) => manter.has(a.id));
    }

    /**
     * OS CHIPS DE RECORTE — `Minhas`, `Sem responsável`, `Sem data`.
     *
     * Combinam por E: ligar dois pede o que satisfaz os dois. É o que a pessoa
     * espera de dois botões apertados ao mesmo tempo, e "minhas E sem data" é
     * justamente o recorte útil.
     *
     * Só ATIVIDADE é testada. Agrupador não tem responsável nem data próprios
     * (são rollup) e marco não tem responsável — julgá-los por um campo que
     * não lhes pertence os tiraria da lista sempre. Eles seguem pela regra de
     * ancestral logo abaixo: aparecem se alguma filha passou.
     */
    if (recortesAtivos.size > 0) {
      const comFilho = new Set(vivas.filter((a) => a.parent_id).map((a) => a.parent_id as string));
      const atende = (a: Activity) => {
        if (comFilho.has(a.id)) return false;      // agrupador: decide pelas filhas
        if (recortesAtivos.has("minhas") && !(ehMinha?.(a) ?? true)) return false;
        if (recortesAtivos.has("sem-resp")) {
          if (a.is_milestone) return false;        // marco não tem responsável
          if ((a.assigned_to ?? "").trim()) return false;
        }
        if (recortesAtivos.has("sem-data") && a.end_date) return false;
        // "No quadro": o que já foi promovido. Deriva da coluna, como a coluna
        // SITUAÇÃO — e pela mesma razão não usa o helper `naFila`, que conta
        // "a_iniciar" como fila.
        if (recortesAtivos.has("no-quadro")) {
          const col = allStages.find((s2) => s2.id === a.workflow_stage_id);
          if (!col) return false;
          const cat = parseWorkflowCategory((col as { categoria?: string }).categoria)
            ?? categoryFromLegacyFlags(col as never);
          if (cat === "backlog") return false;
        }
        return true;
      };
      const passaram = new Set(vivas.filter(atende).map((a) => a.id));
      const idx = new Map(vivas.map((a) => [a.id, a]));
      const manterR = new Set(passaram);
      for (const id of passaram) {
        let atual = idx.get(id);
        while (atual?.parent_id && !manterR.has(atual.parent_id)) {
          manterR.add(atual.parent_id);
          atual = idx.get(atual.parent_id);
        }
      }
      vivas = vivas.filter((a) => manterR.has(a.id));
    }

    if (prontidaoFilter === "all") return vivas;

    // Quem tem filhos não é avaliado (horas e datas são rollup), mas precisa
    // continuar visível quando algum descendente passa no filtro — senão o
    // ramo inteiro sumiria e o item filtrado iria junto. A montagem da árvore
    // logo abaixo já promove a raiz quem perdeu o pai; aqui só garantimos que
    // o agrupador não seja descartado por não ter avaliação própria.
    const temFilho = new Set(vivas.filter((a) => a.parent_id).map((a) => a.parent_id as string));
    const passa = (a: Activity) => {
      const r = avaliarProntidao(a, temFilho.has(a.id));
      if (!r.avaliavel) return null; // agrupador ou concluída: decide pelos filhos
      return prontidaoFilter === "ready" ? r.pronta : !r.pronta;
    };

    const diretos = new Set(vivas.filter((a) => passa(a) === true).map((a) => a.id));
    // Sobe dos itens que passaram até a raiz, mantendo os ancestrais.
    const porId = new Map(vivas.map((a) => [a.id, a]));
    const manter = new Set(diretos);
    for (const id of diretos) {
      let atual = porId.get(id);
      const visto = new Set<string>([id]);
      while (atual?.parent_id && !visto.has(atual.parent_id)) {
        visto.add(atual.parent_id);
        manter.add(atual.parent_id);
        atual = porId.get(atual.parent_id);
      }
    }
    return vivas.filter((a) => manter.has(a.id));
  })();

  // Mapa de stage_id → {title, color} para badges
  const stageById = new Map<string, WorkflowStage>();
  allStages.forEach((s) => stageById.set(s.id, s));

  // Build hierarchy. Quando filtros (busca/status/prioridade) escondem o PAI mas
  // mantêm um FILHO, o filho seria órfão (nem raiz, nem sob o pai) e sumiria da
  // tela. Para evitar isso, um item cujo parent_id não está no conjunto visível
  // é promovido a raiz.
  const visibleIds = new Set(backlogActs.map((a) => a.id));
  /* As fases que a tela REALMENTE desenha. `phases` já chega sem as arquivadas
     (a consulta filtra `is_trashed = false`), então isto é exatamente o
     conjunto de grupos possíveis — o resto vira "Sem fase". */
  const phaseIds = new Set(phases.map((p) => p.id));
  const childrenByParent = new Map<string, Activity[]>();
  const topLevelByPhase = new Map<string | "none", Activity[]>();
  backlogActs.forEach((a) => {
    const parentVisible = a.parent_id ? visibleIds.has(a.parent_id) : false;
    if (a.parent_id && parentVisible) {
      const arr = childrenByParent.get(a.parent_id) || [];
      arr.push(a);
      childrenByParent.set(a.parent_id, arr);
    } else {
      /**
       * FASE ÓRFÃ CAI EM "SEM FASE" — mesma proteção que a linha acima dá ao
       * `parent_id`, que faltava aqui.
       *
       * A lista é desenhada POR FASE: só existem os grupos de `phases`, os das
       * atividades-fase e o "none". Uma tarefa cujo `phase_id` não está em
       * nenhum deles ia para um grupo que ninguém renderiza — some da tela sem
       * aviso, embora continue contada no cabeçalho ("56 atividades" com uma
       * linha visível) e no filtro.
       *
       * Acontece o tempo todo: `phases` é buscada com `is_trashed = false`,
       * mas as atividades da fase arquivada continuam vindo com o vínculo
       * intacto. Também cobre vínculo para fase de outro projeto ou apagada.
       *
       * Aparecer no lugar errado é ruim; sumir é pior — em "Sem fase" a pessoa
       * vê o que tem e pode reatribuir.
       */
      const fase = a.phase_id && phaseIds.has(a.phase_id) ? a.phase_id : "none";
      const arr = topLevelByPhase.get(fase) || [];
      arr.push(a);
      topLevelByPhase.set(fase, arr);
    }
  });
  // Sort children/top-level by display_order
  const sortByOrder = (arr: Activity[]) =>
    arr.sort((x, y) => (x.display_order ?? 9999) - (y.display_order ?? 9999));
  childrenByParent.forEach(sortByOrder);
  topLevelByPhase.forEach(sortByOrder);

  // Helper: uma atividade marcada como "É uma fase" vira card-fase virtual.
  const isPhaseLikeActivity = (a: Activity) => a.item_type === "fase";

  // Coleta TODAS as atividades-fase (item_type='fase') em qualquer nível top-level
  // (independente de phase_id) e as remove dos grupos normais para serem renderizadas
  // como cards-fase virtuais.
  // Só o agrupador SEM fase vira card virtual. Antes todo item_type='fase' era
  // arrancado do grupo, então uma Entrega ("1.1 Formalização", com phase_id
  // preenchido) era renderizada solta no topo enquanto a fase 1 a que ela
  // pertence exibia "Nenhuma tarefa" — a fase parecia vazia tendo uma entrega
  // inteira dentro.
  const virtualPhaseActs: Activity[] = [];
  topLevelByPhase.forEach((arr, key) => {
    const filtered: Activity[] = [];
    for (const a of arr) {
      /**
       * Agrupador de TOPO vira card de fase.
       *
       * Era `!a.phase_id`: só o item sem fase virava card, para não arrancar
       * uma Entrega de dentro do grupo dela. Com as fases migradas para
       * `activities` (14/08/2026), a fase migrada TEM `phase_id` — aponta para
       * a fase de origem — e ficava presa dentro da própria faixa.
       *
       * `!a.parent_id` NÃO basta. O comentário anterior supunha que "a Entrega
       * continua no lugar, porque ela tem pai" — e não tem: na Revitalização
       * Tasy as entregas 1.2.2, 1.2.3 e 1.2.4 são agrupadores de topo, sem
       * `parent_id`. Elas viravam card de fase virtual e roubavam a faixa da
       * fase 1.2, que sumia da lista embora existisse em `phases`.
       *
       * O que define a atividade-fase é o CÓDIGO no nível da fase (1.1, 1.2),
       * não a ausência de pai. Sem código, vale o teste antigo — é o
       * comportamento das bases sem numeração.
       */
      /**
       * O ITEM SOME QUANDO NENHUM DOS DOIS RAMOS O RECEBE.
       *
       * Era um `if` externo (`item_type === 'fase' && !parent_id`) com o teste
       * de nível DENTRO. Um agrupador de nível 3 entrava no `if`, falhava no
       * teste interno e não caía no `else`: sumia da lista inteira.
       *
       * Foi o relato de "importei e ficou só fase e marco". Depois que o nível
       * 3 passou a ser pacote por posição (`item_type = 'fase'`), TODO pacote
       * de topo caiu nesse buraco — 23 dos 25 itens do projeto.
       *
       * Agora a condição é uma só, e quem não vira fase virtual continua no
       * grupo, como sempre deveria.
       */
      const nivel = eapLevel((a as { wbs_code?: string | null }).wbs_code);
      const ehFaseVirtual =
        isPhaseLikeActivity(a) && !a.parent_id && (nivel === null || eapIsFaseLevel(nivel));
      if (ehFaseVirtual) virtualPhaseActs.push(a);
      else filtered.push(a);
    }
    topLevelByPhase.set(key, filtered);
  });
  sortByOrder(virtualPhaseActs);

  // ------------------------------------------------------------------
  // Raias (modo "Agrupar por" ≠ fase): grupos PLANOS por dimensão.
  // Cada raia = { id, label, items[] }. Todos os itens (pais e filhos)
  // entram planos — sem árvore — para a dimensão escolhida.
  // ------------------------------------------------------------------
  const buildLanes = (): { id: string; label: string; items: Activity[] }[] => {
    const acts = backlogActs.filter((a) => !isPhaseLikeActivity(a));
    if (groupBy === "assignee") {
      const map = new Map<string, Activity[]>();
      acts.forEach((a) => {
        const who = a.assigned_to || "";
        (map.get(who) || map.set(who, []).get(who)!).push(a);
      });
      const named = Array.from(map.entries())
        .filter(([k]) => k)
        .map(([k, items]) => ({ id: k, label: profileNameMap[k] || k, items }))
        .sort((x, y) => x.label.localeCompare(y.label));
      if (map.has("")) named.push({ id: "__none__", label: "Sem responsável", items: map.get("")! });
      return named;
    }
    if (groupBy === "priority") {
      const order: GutLevel[] = ["urgente", "critica", "alta", "media", "baixa", "pendente"];
      return order
        .map((level) => ({ id: level, label: GUT_META[level].label, items: acts.filter((a) => normalizeGut(a.priority) === level) }))
        .filter((l) => l.items.length > 0);
    }
    if (groupBy === "status") {
      const lanes = allStages.map((s) => ({ id: s.id, label: s.title, items: acts.filter((a) => a.workflow_stage_id === s.id) }));
      const noStage = acts.filter((a) => !a.workflow_stage_id);
      if (noStage.length) lanes.push({ id: "__none__", label: "Sem status", items: noStage });
      return lanes.filter((l) => l.items.length > 0);
    }
    if (groupBy === "type") {
      const kindOf = (a: Activity) => resolveEapKind(a, (childrenByParent.get(a.id)?.length || 0) > 0);
      const order: { id: string; label: string; match: (a: Activity) => boolean }[] = [
        { id: "fase", label: "Fases/Entregas", match: (a) => kindOf(a) === "fase" },
        { id: "atividade", label: "Atividades", match: (a) => kindOf(a) === "atividade" },
        { id: "marco", label: "Marcos", match: (a) => kindOf(a) === "marco" },
      ];
      const used = new Set<string>();
      const lanes: { id: string; label: string; items: Activity[] }[] = [];
      order.forEach((o) => {
        const items = acts.filter((a) => !used.has(a.id) && o.match(a));
        items.forEach((a) => used.add(a.id));
        if (items.length) lanes.push({ id: o.id, label: o.label, items });
      });
      return lanes;
    }
    return [];
  };
  const lanes = groupBy === "phase" ? [] : buildLanes();

  // Fase aberta para edição. Guarda o objeto inteiro (vem da prop `phases`),
  // para o diálogo já abrir preenchido sem uma segunda consulta.
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null);
  const openPhase = (id: string, _titulo: string) => {
    const p = phases.find((x) => x.id === id);
    if (p) setEditingPhase(p);
  };

  const togglePhase = (id: string) => {
    setCollapsedPhases((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleParent = (id: string) => {
    setCollapsedParents((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  /**
   * Marcar um agrupador marca o que está DENTRO dele — e desmarcar, idem.
   *
   * Sem a cascata, escolher "Fase 1" pegava só a linha do título: arquivar
   * deixaria as atividades órfãs, visíveis e sem raiz. É o comportamento de
   * árvore do Explorer, do Finder e da EAP do MS Project.
   *
   * Anda pelos DESCENDENTES, não só pelos filhos diretos — Fase → Entrega →
   * Atividade tem três níveis, e parar no primeiro deixaria os netos de fora.
   * Alcança ramo RECOLHIDO de propósito: o resultado não pode depender de a
   * fase estar aberta na hora do clique.
   */
  const descendentesDe = (id: string): string[] => {
    const out: string[] = [];
    const fila = [id];
    while (fila.length) {
      const atual = fila.pop()!;
      for (const f of childrenByParent.get(atual) || []) {
        out.push(f.id);
        fila.push(f.id);
      }
    }
    return out;
  };

  /**
   * Todos os ANCESTRAIS de um item, do pai para cima.
   *
   * Necessário para o pai não continuar marcado depois que um filho sai: a
   * marca dele quer dizer "isto e tudo que está dentro", e isso deixa de ser
   * verdade no instante em que um descendente é desmarcado.
   */
  const ancestraisDe = (id: string): string[] => {
    const out: string[] = [];
    let atual = backlogActs.find((a) => a.id === id)?.parent_id ?? null;
    while (atual) {
      out.push(atual);
      atual = backlogActs.find((a) => a.id === atual)?.parent_id ?? null;
    }
    return out;
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    const familia = [id, ...descendentesDe(id)];
    // O clique no PAI manda: marcando, entra a família toda; desmarcando, sai
    // toda. Alternar item a item deixaria o pai marcado com filhos fora.
    if (next.has(id)) {
      familia.forEach((x) => next.delete(x));
      // E OS ANCESTRAIS SAEM JUNTO. Sem isto, desmarcar dois filhos de uma
      // fase que estava inteira selecionada deixava a fase marcada em sólido:
      // a caixa dizia "tudo aqui dentro" enquanto dois itens estavam fora, e
      // arquivar levaria a fase como se estivesse completa.
      ancestraisDe(id).forEach((x) => next.delete(x));
    } else {
      familia.forEach((x) => next.add(x));
      // Marcar o ÚLTIMO filho que faltava completa o pai — e o avô, se for o
      // caso. `estadoDaCaixa` já mostraria o sólido pelo cálculo, mas o id do
      // pai precisa entrar no conjunto para as ações em lote o alcançarem.
      for (const anc of ancestraisDe(id)) {
        const filhos = descendentesDe(anc);
        if (filhos.length > 0 && filhos.every((f) => next.has(f))) next.add(anc);
      }
    }
    setSelectedIds(next);
    // Desmarcar a ÚLTIMA sai do modo. Sem isto a coluna das caixas continuava
    // reservada com zero itens marcados — o usuário via o marcador na lateral
    // de cada linha sem ter selecionado nada e sem saber como voltar.
    // Calculado fora do updater: chamar outro setState lá dentro é efeito
    // colateral durante o render.
    if (next.size === 0) setSelectMode(false);
  };

  /**
   * Estado da caixa de um agrupador: marcado, vazio, ou o traço do meio-termo.
   *
   * Sem o traço, um pai com metade dos filhos marcados apareceria desmarcado —
   * e o contador do rodapé diria um número que a tela não confirma.
   */
  const estadoDaCaixa = (id: string): boolean | "indeterminate" => {
    const filhos = descendentesDe(id);
    // FOLHA: só o próprio id decide.
    if (filhos.length === 0) return selectedIds.has(id);
    // AGRUPADOR: quem manda são os FILHOS, não o id dele.
    //
    // Antes começava com `if (selectedIds.has(id)) return true`, e o id do pai
    // ficava no conjunto depois de desmarcar um filho: a fase aparecia sólida
    // com dois itens em branco embaixo. O `toggleSelect` agora tira o pai nesse
    // caso, e este cálculo deixa de depender disso para acertar.
    const marcados = filhos.filter((f) => selectedIds.has(f)).length;
    if (marcados === 0) return false;
    return marcados === filhos.length ? true : "indeterminate";
  };

  /**
   * As FOLHAS da seleção — o que de fato executa trabalho.
   *
   * Agrupador (Fase, Entrega, ou qualquer item com subitens) tem horas, datas,
   * responsável e status DERIVADOS dos filhos. Gravar neles produziria um valor
   * que discorda do próprio conteúdo — e "mudar status" chegaria a empurrar uma
   * Fase para uma coluna do Kanban, onde ela não vive.
   *
   * A regra que separa as ações:
   *   ESTRUTURAL (arquivar, excluir, mover) → a seleção inteira, agrupador junto
   *   EXECUÇÃO (status, responsável, prazo, prioridade, dependência) → só folhas
   */
  const idsFolhaSelecionados = (): string[] =>
    Array.from(selectedIds).filter((id) => (childrenByParent.get(id) || []).length === 0);

  /** Quantos agrupadores há na seleção — para a barra dizer o que vai acontecer. */
  const totalAgrupadoresSelecionados = Array.from(selectedIds)
    .filter((id) => (childrenByParent.get(id) || []).length > 0).length;

  /**
   * O que "levar as subatividades junto" levaria — o número da pergunta.
   *
   * Conta a subárvore dos itens selecionados, DESCONTANDO o que já está na
   * seleção: se a pessoa marcou o pacote e duas filhas, a pergunta é sobre as
   * outras, não sobre as que ela já escolheu.
   *
   * A mesma separação de `lib/quadroDeExecucao`: atividade × agrupador, marco
   * fora — só que aqui contada sobre os PENDENTES, não sobre a subárvore toda.
   */
  const subatividadesDaSelecao = useMemo(() => {
    // Os descendentes de TODOS os selecionados, sem repetir e sem contar quem
    // já está na seleção — esses vão de qualquer jeito, e contá-los faria a
    // pergunta prometer mais do que ela decide.
    const pendentes = new Set<string>();
    for (const id of selectedIds) {
      for (const d of descendentesDe(id)) {
        if (!selectedIds.has(d)) pendentes.add(d);
      }
    }
    let atividades = 0;
    let agrupadores = 0;
    for (const id of pendentes) {
      const item = activities.find((a) => a.id === id);
      if (!item || item.is_milestone) continue;   // marco não é promovível
      if ((childrenByParent.get(id) || []).some((f) => !f.is_milestone)) agrupadores++;
      else atividades++;
    }
    return { atividades, agrupadores };
  }, [selectedIds, activities, childrenByParent, descendentesDe]);

  /**
   * Quantas FASES REAIS ficariam sem nenhuma tarefa se a seleção fosse
   * arquivada — o número que a confirmação precisa mostrar antes do clique.
   *
   * Elas não estão em `selectedIds` (vivem na tabela `phases`, ver abaixo),
   * então não aparecem na contagem de itens: sem este aviso, a fase sumiria da
   * tela sem nunca ter sido mencionada.
   */
  const fasesQueEsvaziam = (() => {
    if (selectedIds.size === 0) return 0;
    const candidatas = new Set(
      activities.filter((a) => selectedIds.has(a.id) && a.phase_id).map((a) => a.phase_id as string),
    );
    return [...candidatas].filter(
      (pid) => !activities.some((a) => a.phase_id === pid && !a.is_trashed && !selectedIds.has(a.id)),
    ).length;
  })();

  /**
   * A FASE REAL (tabela `phases`) é um caso à parte: ela não é uma `activity`,
   * e as ações em lote gravam em `activities`. Guardar o id dela na seleção
   * exigiria que cada ação soubesse ignorá-lo — mais código, para um caso que
   * a maioria dos projetos não usa.
   *
   * Então a caixa dela opera sobre o CONTEÚDO: marcar seleciona as tarefas de
   * dentro (com seus descendentes), desmarcar tira todas. O efeito é o que se
   * espera ao marcar uma fase; só a linha do título fica fora das operações.
   */
  const idsDaFaseReal = (acts: Activity[]): string[] =>
    acts.flatMap((a) => [a.id, ...descendentesDe(a.id)]);

  const estadoDaFaseReal = (acts: Activity[]): boolean | "indeterminate" => {
    const ids = idsDaFaseReal(acts);
    if (ids.length === 0) return false;
    const marcados = ids.filter((x) => selectedIds.has(x)).length;
    if (marcados === 0) return false;
    return marcados === ids.length ? true : "indeterminate";
  };

  const toggleSelecaoDaFaseReal = (acts: Activity[], forcarMarcar = false) => {
    const ids = idsDaFaseReal(acts);
    if (ids.length === 0) return;
    const next = new Set(selectedIds);
    // Meio-termo conta como "marcar": clicar num traço completa a seleção, em
    // vez de zerar o que já estava escolhido.
    const jaTodas = !forcarMarcar && ids.every((x) => next.has(x));
    if (jaTodas) ids.forEach((x) => next.delete(x));
    else ids.forEach((x) => next.add(x));
    setSelectedIds(next);
    if (next.size === 0) setSelectMode(false);
  };

  // `toggleSelectAll` e `allSelected` saíram junto com a caixa duplicada da
  // barra de ações: só existiam para ela. A caixa do cabeçalho faz o mesmo
  // trabalho, no lugar onde ele se lê.

  const handleMoveSelected = async () => {
    if (!targetStageId) {
      toast({ title: "Selecione uma etapa de destino", variant: "destructive" });
      return;
    }
    setIsMoving(true);
    /**
     * O AGRUPADOR VAI JUNTO (13/08/2026).
     *
     * Era `idsFolhaSelecionados()`: a fase/entrega ficava de fora, sob o
     * argumento de que "agrupador não vive numa coluna do Kanban". Só que a
     * decisão de produto mudou — o que é mandado para o quadro aparece no
     * quadro, agrupador inclusive — e o efeito era o relatado: você move uma
     * fase inteira, as tarefas vão e a fase fica para trás no Backlog.
     *
     * O medo antigo (marcar a caixa como "concluída" e discordar dos filhos)
     * já não se aplica: o percentual do agrupador é a média dos filhos e
     * IGNORA a própria coluna — ver `isGrouper` em activityProgress. Mover a
     * caixa não move o conteúdo, e o número não mente.
     */
    /**
     * A SUBÁRVORE SÓ VAI SE FOI PEDIDO.
     *
     * `levarSubatividades` vem do diálogo, desmarcado por padrão. Sem ele, o
     * movimento alcança exatamente o que está selecionado — que é a regra:
     * promover leva só o que foi escolhido.
     */
    const idsBrutos = levarSubatividades
      ? Array.from(new Set(
          Array.from(selectedIds).flatMap((id) => [id, ...descendentesDe(id)]),
        )).filter((id) => {
          // Marco não é promovível: não entra no quadro.
          const a = activities.find((x) => x.id === id);
          return a ? !a.is_milestone : false;
        })
      : Array.from(selectedIds);
    if (idsBrutos.length === 0) {
      setIsMoving(false);
      toast({ title: "Nenhuma tarefa selecionada", variant: "destructive" });
      return;
    }

    /**
     * PERMISSÃO ANTES DE TENTAR.
     *
     * Relato de 25/08: "fiz isso no backlog e permitiu, porém não foi para o
     * kanban". Permitiu na tela e a RLS recusou no banco — e o PostgREST não
     * chama isso de erro: um UPDATE que não casa linha nenhuma volta com
     * sucesso e zero linhas. O `if (!error)` passava, e a tela anunciava um
     * movimento que não aconteceu.
     *
     * O Kanban já barrava (`canMutateActivity`); aqui o gesto ia direto para o
     * banco. Duas telas, o mesmo gesto, comportamentos diferentes.
     *
     * MOVE O QUE PODE e nomeia o resto: recusar as cinco por causa de duas
     * obrigaria a refazer a seleção para conseguir mover as próprias.
     */
    const semPermissao = ehMinha
      ? idsBrutos.filter((id) => {
          const a = activities.find((x) => x.id === id);
          return a ? !ehMinha(a) : false;
        })
      : [];

    /**
     * AGRUPADOR NÃO VAI PARA O QUADRO — a porta fechada (27/08/2026).
     *
     * Promover um agrupador punha no quadro algo que o quadro não desenha como
     * cartão: o item sumia — estava lá, ocupando coluna, e não aparecia. O
     * incidente de 27/08 mediu o estrago: 68 folhas promovidas que ninguém via,
     * em 17 projetos.
     *
     * O arraste do Kanban já recusava; aqui aceitava em silêncio. Mesmo gesto,
     * dois comportamentos — e o usuário descobria pela ausência.
     *
     * Segue o padrão desta função: MOVE O QUE PODE e nomeia o resto. Recusar a
     * seleção inteira por causa de uma fase marcada junto obrigaria a refazer a
     * seleção.
     *
     * A versão boa — promover o pacote e trazer as atividades dele — está na
     * fila. Até lá, recusar explica; aceitar esconde.
     */
    /**
     * RECUSAR PROMOVER NÃO É RECUSAR MOVER — e confundir os dois quebra a tela.
     *
     * Este botão chama-se "Mudar status" e faz DUAS coisas:
     *
     *   PROMOVER  fila → coluna do quadro
     *   MOVER     coluna do quadro → outra coluna, ou de volta para a fila
     *
     * A regra de 27/08 barra a PRIMEIRA: agrupador não vai para o quadro,
     * porque lá ele não vira cartão e some. Ela não diz nada sobre a segunda.
     *
     * A primeira versão desta guarda ignorou a distinção e barrava as duas —
     * e o efeito foi relatado com captura: uma fase que JÁ ESTAVA em "Em
     * Andamento" não podia ser movida nem para outra coluna nem de volta para
     * o backlog. Ficava presa, e o aviso dizia "não vão para o quadro" sobre
     * um item que já estava nele.
     *
     * Pior: era exatamente a via que tira do quadro os 68 itens presos. A
     * guarda trancava a porta de saída.
     */
    const destino = allStages.find((s2) => s2.id === targetStageId);
    const catDestino = destino
      ? parseWorkflowCategory((destino as { categoria?: string }).categoria)
        ?? categoryFromLegacyFlags(destino as never)
      : null;
    const destinoEhQuadro = !!destino && catDestino !== "backlog";

    const naoPromoviveis = !destinoEhQuadro ? [] : idsBrutos.filter((id) => {
      const a = activities.find((x) => x.id === id);
      if (!a) return false;
      // Já está no quadro? Então isto é MOVER, e mover é permitido.
      const atual = allStages.find((s2) => s2.id === a.workflow_stage_id);
      const catAtual = atual
        ? parseWorkflowCategory((atual as { categoria?: string }).categoria)
          ?? categoryFromLegacyFlags(atual as never)
        : null;
      const jaNoQuadro = !!atual && catAtual !== "backlog";
      if (jaNoQuadro) return false;
      return !podePromover(a as never);
    });

    const ids = idsBrutos.filter(
      (id) => !semPermissao.includes(id) && !naoPromoviveis.includes(id),
    );

    // Só agrupador/marco selecionado: não há o que mover, e o motivo vem da
    // fonte única — a mesma frase que o arraste do Kanban usa.
    if (ids.length === 0 && naoPromoviveis.length > 0 && semPermissao.length === 0) {
      const a = activities.find((x) => x.id === naoPromoviveis[0]);
      const motivo = a ? motivoNaoPromove(a as never) : null;
      setIsMoving(false);
      // FECHA O DIÁLOGO. Sem isto o aviso aparece por cima de um formulário que
      // continua aberto, com o botão "Confirmar" convidando a tentar de novo —
      // a tela dizendo "não vai funcionar" e oferecendo o botão ao mesmo tempo.
      setMoveDialogOpen(false);
      toast({
        title: motivo?.titulo ?? "Este item não vai para o quadro",
        description: motivo?.descricao,
        variant: "destructive",
      });
      return;
    }

    if (ids.length === 0) {
      setIsMoving(false);
      toast({
        title: "Você não pode mover essas tarefas",
        description: "Só é possível mover as atividades em que você é responsável, participante ou criador.",
        variant: "destructive",
      });
      return;
    }

    /**
     * A CAIXA NÃO ANDA NA FRENTE DO CONTEÚDO — mesma regra do quadro.
     *
     * O Kanban já barra isso (`filhosForaDaColuna`, em ActivityKanban), mas
     * aqui a caixa ia sozinha: dava para mandar uma fase para "Em Revisão"
     * com as onze tarefas paradas, e a lista anunciava uma fase em revisão sem
     * ninguém ter revisado nada. Duas telas, dois comportamentos, o mesmo
     * gesto.
     *
     * Filho que está NA MESMA SELEÇÃO não bloqueia: ele vai junto, nesta
     * operação, e exigir que já estivesse lá tornaria impossível mover uma
     * fase inteira de uma vez — que é o caso comum.
     *
     * Filho cancelado também não: saiu do escopo, não é trabalho pendente.
     */
    const bloqueios: { pai: Activity; faltam: Activity[] }[] = [];
    for (const id of ids) {
      const filhos = childrenByParent.get(id) || [];
      if (filhos.length === 0) continue;
      const faltam = filhos.filter((f) => {
        if (selectedIds.has(f.id)) return false;
        // Marco não entra no quadro (ver ActivityKanban), então nunca chegaria
        // à coluna de destino — contá-lo travaria o pai para sempre.
        if (f.is_milestone) return false;
        const col = allStages.find((s) => s.id === f.workflow_stage_id);
        const cat = col
          ? parseWorkflowCategory((col as { categoria?: string }).categoria) ?? categoryFromLegacyFlags(col as never)
          : null;
        if (cat === "cancelada") return false;
        return f.workflow_stage_id !== targetStageId;
      });
      const pai = activities.find((a) => a.id === id);
      if (faltam.length > 0 && pai) bloqueios.push({ pai, faltam });
    }

    if (bloqueios.length > 0) {
      setIsMoving(false);
      const destino = allStages.find((s) => s.id === targetStageId)?.title ?? "essa coluna";
      const primeiro = bloqueios[0];
      const n = primeiro.faltam.length;
      toast({
        title: "Mova o que está dentro primeiro",
        description:
          `"${primeiro.pai.title}" tem ${n} ${n === 1 ? "item" : "itens"} fora de "${destino}"` +
          `${bloqueios.length > 1 ? ` (e mais ${bloqueios.length - 1} ${bloqueios.length === 2 ? "fase" : "fases"} na mesma situação)` : ""}. ` +
          "Selecione o conteúdo junto, ou mova-o antes — quando o último chegar, a fase acompanha sozinha.",
        variant: "destructive",
      });
      return;
    }
    const updateData: Database['public']['Tables']['activities']['Update'] = { workflow_stage_id: targetStageId };
    if (assignee && assignee !== "__none__") updateData.assigned_to = assignee;

    // `status` ACOMPANHA a coluna. Sem isto, mover em lote para "Concluída"
    // gravava só o workflow_stage_id e o status ficava "pending" — a tarefa
    // aparecia na coluna final com o título não riscado, e a contagem de
    // concluídas ignorava. Medido em 11/08: 11 atividades nesse estado.
    // O Kanban já fazia esse alinhamento ao arrastar; este caminho não.
    const etapaDestino = allStages.find((s) => s.id === targetStageId);
    const ehFinal = (etapaDestino as { is_final?: boolean } | undefined)?.is_final === true;
    if (etapaDestino) {
      updateData.status = ehFinal ? "completed" : "pending";
      // completed_at só na conclusão; ao reabrir, limpa — manter a data numa
      // tarefa que voltou ao fluxo faz o relatório contar entrega que não houve.
      updateData.completed_at = ehFinal ? new Date().toISOString() : null;
    }

    /**
     * O AGRUPADOR MUDA DE COLUNA, MAS NÃO DE STATUS.
     *
     * Ele acompanha a fase para o quadro (é o que se espera ao mover uma fase
     * inteira), mas quem conclui são as tarefas de dentro. Gravar
     * `status: completed` na caixa criaria uma conclusão que nenhum trabalho
     * sustenta — e que discordaria da média dos filhos, que é o percentual
     * dela. Move-se o continente; o conteúdo responde por si.
     */
    const agrupadores = new Set(
      ids.filter((id) => (childrenByParent.get(id) || []).length > 0),
    );
    const folhas = ids.filter((id) => !agrupadores.has(id));
    const caixas = ids.filter((id) => agrupadores.has(id));

    // EM LOTES: "selecionar todas" numa fase grande manda centenas de uuids
    // numa URL só, que o proxy corta em ~3,7 KB e devolve 502 — o usuário via
    // a ação falhar justamente quando selecionava muito. Ver lib/chunkedIn.
    const { error } = folhas.length > 0
      ? await mutateInChunks(folhas, (batch) =>
          supabase.from("activities").update(updateData).in("id", batch),
        )
      : { error: null };

    let errorCaixas: { message: string } | null = null;
    if (caixas.length > 0) {
      const soAColuna: Database['public']['Tables']['activities']['Update'] = {
        workflow_stage_id: targetStageId,
      };
      if (assignee && assignee !== "__none__") soAColuna.assigned_to = assignee;
      const r = await mutateInChunks(caixas, (batch) =>
        supabase.from("activities").update(soAColuna).in("id", batch),
      );
      errorCaixas = r.error;
    }

    /**
     * O PAI ACOMPANHA QUANDO O ÚLTIMO FILHO CHEGA — mesma regra do quadro.
     *
     * Sem isto a mensagem mentia: o aviso de bloqueio já dizia "quando o
     * último chegar, a fase acompanha sozinha", mas só o Kanban tinha essa
     * lógica (`subirPaisCompletos`). Movendo as cinco tarefas de "1.1.2" daqui
     * pelo Backlog, elas iam para Aprovada e a entrega ficava no Backlog —
     * medido na base: 5 de 5 filhos em Aprovada, pai para trás.
     *
     * Sobe RECURSIVAMENTE, e só quando TODOS os filhos vivos estão na coluna
     * de destino. Cancelado não conta (saiu do escopo). `status` não é
     * gravado: quem conclui são as tarefas.
     */
    /**
     * SUCESSO SEM ESCRITA NÃO É SUCESSO.
     *
     * Um UPDATE recusado pela RLS não vem como erro: o PostgREST devolve
     * sucesso com ZERO linhas afetadas, e o `!error` acima passa. Foi assim
     * que a tela anunciou um movimento que o banco recusou.
     *
     * O gate de permissão acima cobre o caso conhecido. Esta checagem cobre os
     * que ele não previr — política nova, papel alterado no meio da sessão,
     * qualquer recusa que a tela não anteveja. Relê as linhas e confere se
     * chegaram ao destino; se nenhuma chegou, diz a verdade em vez de comemorar.
     */
    if (!error && !errorCaixas && ids.length > 0) {
      const { data: conferencia } = await supabase
        .from("activities")
        .select("id")
        .in("id", ids.slice(0, 50))
        .eq("workflow_stage_id", targetStageId);
      if (Array.isArray(conferencia) && conferencia.length === 0) {
        setIsMoving(false);
        setMoveDialogOpen(false);
        toast({
          title: "Nada foi movido",
          description: "O banco recusou a operação. Você provavelmente não tem permissão sobre essas atividades.",
          variant: "destructive",
        });
        onDataChanged();
        return;
      }
    }

    /*
     * O ANCESTRAL NÃO SOBE MAIS — nem aqui.
     *
     * Esta era a TERCEIRA cópia da mesma regra ("o pai acompanha quando o
     * último filho chega"): uma no arrasto do Kanban, uma no menu de mover, e
     * esta no Backlog. Todas escreviam em quem ninguém tinha selecionado, e
     * juntas produziam o vaivém relatado — a ida levava os filhos, a volta
     * trazia o pai atrás deles.
     *
     * Agora a promoção escreve SÓ o que foi escolhido. O agrupador não precisa
     * acompanhar porque não tem coluna própria no quadro: ele é FAIXA sobre os
     * cartões das filhas, onde quer que elas estejam
     * (ver `lib/quadroDeExecucao`).
     */

    setSelectedIds(new Set());
    setMoveDialogOpen(false);
    setLevarSubatividades(false);   // a pergunta volta desmarcada na proxima vez
    setTargetStageId("");
    setAssignee("");
    setIsMoving(false);
    onDataChanged();
    const falha = error || errorCaixas;
    if (falha) {
      // Não é transacional: os lotes anteriores já gravaram. Por isso o
      // onDataChanged acima roda mesmo no erro — a tela precisa refletir o
      // banco, não o que se esperava dele.
      toast({
        title: "Nem tudo foi movido",
        description: falha.message,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: `${ids.length} ${ids.length === 1 ? "item movido" : "itens movidos"}`,
      description: [
        // Dizer que a caixa foi mas não concluiu: sem isto, mover uma fase para
        // "Concluída" e ver o agrupador sem o status parece falha da operação.
        caixas.length > 0 && ehFinal
          ? `${caixas.length} fase(s)/entrega(s) mudaram de coluna; a conclusão é das tarefas de dentro.`
          : null,
        // O que ficou de fora por permissão: silenciar seria o defeito de
        // antes — a tela anunciando um movimento que não aconteceu.
        semPermissao.length > 0
          ? `${semPermissao.length} não ${semPermissao.length === 1 ? "foi" : "foram"}: você não é responsável nem participante.`
          : null,
        // E o que ficou de fora por ser caixa. Mesmo motivo do anterior:
        // silenciar faria a tela anunciar um movimento que não aconteceu — foi
        // assim que 68 itens foram parar no quadro sem ninguém ver.
        naoPromoviveis.length > 0
          ? `${naoPromoviveis.length} não ${naoPromoviveis.length === 1 ? "foi" : "foram"}: fase, pacote e marco não vão para o quadro.`
          : null,
      ].filter(Boolean).join(" ") || undefined,
    });
  };

  /**
   * Aplica um campo a TODAS as tarefas selecionadas.
   *
   * Existe porque corrigir centenas de tarefas uma a uma não acontece — é por
   * isso que 465 estão sem prazo e 609 sem prioridade. Com o filtro
   * "Incompletas" ao lado, vira uma fila de trabalho: filtra, seleciona,
   * preenche.
   *
   * Em lotes pelo mesmo motivo das outras ações em massa: o proxy corta a URL
   * em ~3,7 KB (ver lib/chunkedIn).
   */
  /**
   * Define o responsável de UMA linha, do botão `+ Sem responsável`.
   *
   * Separado de `aplicarEmLote` de propósito: aquele opera sobre a seleção, e
   * este é um gesto de linha — sem seleção, sem lote.
   *
   * LÊ O RESULTADO antes de dizer que salvou. Um UPDATE que não casa linha
   * nenhuma volta SEM erro no PostgREST, e é assim que a recusa da RLS vira
   * silêncio. `count: "exact"` responde quantas linhas mudaram de verdade.
   */
  const definirResponsavelDaLinha = async (activityId: string, nome: string | null) => {
    const { error, count } = await supabase
      .from("activities")
      .update({ assigned_to: nome } as never, { count: "exact" })
      .eq("id", activityId);

    setOpenAssigneeFor(null);

    if (error) {
      /**
       * O ERRO DO BANCO, DITO PARA GENTE.
       *
       * Este é o ponto exato do relato: definir responsável dispara a sincronia
       * para `activity_assignees`, que dispara a validação de equipe. Quando a
       * pessoa não está na equipe, o que chegava à tela era:
       *
       *   "usuario 0eb3047e-… nao esta na equipe do projeto dcf977e9-… | P0001"
       *
       * Dois UUIDs, um código do Postgres, e nenhum passo seguinte. O tradutor
       * resolve os ids pelos nomes que a tela já tem em mãos.
       */
      const nomes = {
        pessoas: Object.fromEntries(
          Object.entries(profileNameMap).map(([k, v]) => [k, String(v)]),
        ),
        projetos: projectId && projectTitle ? { [projectId]: projectTitle } : {},
      };
      const { titulo, detalhe } = traduzirErroDoBanco(error, nomes);
      toast({ title: titulo, description: detalhe, variant: "destructive" });
      return;
    }
    if (!count) {
      toast({
        title: "Sem permissão",
        description: "O banco recusou a atribuição — você não tem permissão sobre esta atividade.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: nome ? `Responsável: ${nome}` : "Responsável removido" });
    onDataChanged();
  };

  const aplicarEmLote = async (
    patch: Record<string, unknown>,
    descricao: string,
    /**
     * `estrutural` decide quem recebe o patch.
     *
     * ARQUIVAR é estrutural: leva a fase E o conteúdo. Antes arquivava só o que
     * estava marcado — o pai sumia e os filhos ficavam órfãos, visíveis e sem
     * raiz. Já responsável, prazo e prioridade são de EXECUÇÃO: agrupador não
     * tem valor próprio para eles (é rollup dos filhos), então só as folhas.
     */
    estrutural = false,
  ) => {
    const ids = estrutural ? Array.from(selectedIds) : idsFolhaSelecionados();
    if (ids.length === 0) {
      setBulkField(null);
      toast({
        title: "Nenhuma tarefa recebeu a mudança",
        description: "A seleção só tem fases e entregas — o valor delas vem das tarefas de dentro.",
        variant: "destructive",
      });
      return;
    }
    setBulkField(null);

    const { error } = await mutateInChunks(ids, (batch) =>
      (supabase.from("activities").update(patch as never) as any).in("id", batch),
    );

    /**
     * A FASE QUE FICOU VAZIA VAI JUNTO.
     *
     * `selectedIds` só carrega ids de `activities` — a fase real vive na tabela
     * `phases` e não cabe ali. Arquivar tudo mandava as atividades para a
     * lixeira e deixava o cabeçalho da fase na tela, vazio, como se ainda
     * houvesse um plano ali.
     *
     * Só quando a fase fica SEM NENHUMA tarefa viva: uma fase que ainda tem
     * conteúdo continua de pé, mesmo que parte dele tenha sido arquivada.
     *
     * Diferente de `handleDeleteFase`, que solta as tarefas (`phase_id = null`)
     * antes de arquivar a fase: lá o alvo é a fase e o conteúdo sobrevive; aqui
     * o alvo é o conteúdo e a fase é que perde a razão de existir.
     */
    let fasesArquivadas = 0;
    if (!error && (patch as { is_trashed?: boolean }).is_trashed === true) {
      const arquivados = new Set(ids);
      // Fases tocadas pela operação — as demais nem entram na conta.
      const candidatas = new Set(
        activities.filter((a) => arquivados.has(a.id) && a.phase_id).map((a) => a.phase_id as string),
      );
      const vazias = [...candidatas].filter(
        (pid) => !activities.some((a) => a.phase_id === pid && !a.is_trashed && !arquivados.has(a.id)),
      );
      if (vazias.length > 0) {
        const { error: errFase } = await mutateInChunks(vazias, (batch) =>
          supabase
            .from("phases")
            .update({ is_trashed: true, trashed_at: new Date().toISOString() } as never)
            .in("id", batch),
        );
        if (errFase) {
          toast({
            title: "As tarefas foram arquivadas, as fases não",
            description: errFase.message,
            variant: "destructive",
          });
        } else {
          fasesArquivadas = vazias.length;
        }
      }
    }

    // Recarrega mesmo no erro: mutateInChunks não é transacional, então os
    // lotes anteriores já gravaram e a tela precisa refletir o banco.
    onDataChanged();

    if (error) {
      toast({
        title: "Nem todas foram atualizadas",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: descricao,
      description: fasesArquivadas > 0
        // Dizer que a fase foi junto: ela some da tela e some do seletor de
        // fase das outras telas — silêncio aqui vira "sumiu sozinha".
        ? `${ids.length} tarefa(s) e ${fasesArquivadas} fase(s) que ficaram vazias.`
        : `${ids.length} tarefa(s) atualizada(s).`,
    });
  };

  /**
   * Liga as tarefas selecionadas em CADEIA: cada uma depende da anterior.
   *
   * O caminho crítico, a folga e a linha de base já existem no Cronograma, mas
   * quase não têm o que calcular: 41 dependências para 825 atividades. A causa
   * é o custo de criar uma — abrir a tarefa, achar a aba, buscar a outra,
   * escolher o tipo. Quatro passos para uma informação de dois campos.
   *
   * A ordem é a da LISTA, não a de seleção: quem clica em três linhas espera
   * que a sequência siga o que vê na tela, não a ordem dos cliques.
   *
   * `finish_to_start` porque é o que "esta depois daquela" significa, e o que
   * cobre a esmagadora maioria das dependências de projeto.
   */
  const ligarEmSequencia = async () => {
    // SÓ AS FOLHAS. Encadear fases criaria dependência entre coisas que já se
    // relacionam por hierarquia — e a data da fase é rollup dos filhos, então a
    // dependência não teria o que mover.
    const folhas = new Set(idsFolhaSelecionados());
    const ordenadas = backlogActs
      .filter((a) => folhas.has(a.id))
      .sort((a, b) => {
        // Mesma regra da árvore: código EAP quando existe, senão display_order.
        const wa = (a.wbs_code || "").trim(), wb = (b.wbs_code || "").trim();
        if (wa && wb && wa !== wb) {
          return wa.localeCompare(wb, undefined, { numeric: true });
        }
        return (a.display_order ?? 9999) - (b.display_order ?? 9999);
      });

    if (ordenadas.length < 2) return;
    setSequenciando(true);

    try {
      // Pares consecutivos: A→B, B→C, C→D.
      const pares = ordenadas.slice(0, -1).map((a, i) => ({
        predecessor_id: a.id,
        successor_id: ordenadas[i + 1].id,
        dependency_type: "finish_to_start",
        lag_days: 0,
      }));

      // Não recria o que já existe: repetir a ação não deve duplicar o vínculo
      // nem falhar por conflito de chave.
      const { data: existentes } = await supabase
        .from("task_dependencies")
        .select("predecessor_id, successor_id")
        .in("predecessor_id", ordenadas.map((a) => a.id));

      const jaTem = new Set(
        ((existentes || []) as Array<{ predecessor_id: string; successor_id: string }>)
          .map((d) => `${d.predecessor_id}>${d.successor_id}`),
      );
      const novos = pares.filter((p) => !jaTem.has(`${p.predecessor_id}>${p.successor_id}`));

      if (novos.length === 0) {
        toast({ title: "Já estavam ligadas", description: "Nenhuma dependência nova a criar." });
        return;
      }

      const { error } = await supabase.from("task_dependencies").insert(novos as never);
      if (error) throw error;

      toast({
        title: `${novos.length} dependência(s) criada(s)`,
        description: `${ordenadas[0].title} → … → ${ordenadas[ordenadas.length - 1].title}`,
      });
      setSelectedIds(new Set());
      onDataChanged();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Tente novamente";
      toast({ title: "Não foi possível ligar as tarefas", description: msg, variant: "destructive" });
    } finally {
      setSequenciando(false);
    }
  };

  // Quick-add inline: cria tarefa direto na fase ou como filha de outra tarefa
  const handleQuickAddSubmit = async (phaseId: string | null, parentId: string | null) => {
    const title = quickAddTitle.trim();
    if (!title) {
      setQuickAddKey(null);
      setQuickAddTitle("");
      return;
    }
    const parent = parentId ? backlogActs.find((a) => a.id === parentId) : null;
    // EAP: se o pai é folha (atividade/marco), promove a agrupador (Fase/Entrega)
    // antes de inserir. Fase agrupa em qualquer nível. Erro ignorado de propósito:
    // o pai já funciona como agrupador por ter filhos.
    if (parentId && parent) {
      const parentType = parent.item_type || "atividade";
      const parentIsLeaf = parent.is_milestone || (parentType !== "fase" && parentType !== "pacote");
      if (parentIsLeaf) {
        await supabase
          .from("activities")
          .update({ item_type: "fase", is_milestone: false } as any)
          .eq("id", parentId);
      }
    }

    // Herda o stage do pai (fase) em vez do stage fixo "Backlog": uma tarefa
    // criada dentro de uma fase precisa nascer na MESMA coluna do quadro que a
    // fase, senão fica presa no stage 0 (que nunca vira coluna do Kanban) e
    // some visualmente, mesmo aparecendo corretamente aqui no Backlog.
    const inheritedStageId = parent?.workflow_stage_id ?? backlogStageId;

    const { error } = await supabase.from("activities").insert({
      project_id: projectId,
      title,
      phase_id: phaseId,
      parent_id: parentId,
      workflow_stage_id: inheritedStageId,
      status: "pending",
      priority: "pendente",
      item_type: "atividade",
    });
    if (error) {
      toast({ title: "Erro ao criar tarefa", variant: "destructive" });
      return;
    }
    setQuickAddTitle("");
    // mantém o input aberto para criação contínua
    onDataChanged();
  };

  /**
   * CRIAR FASE — como atividade de nível 2, não como linha em `phases`.
   *
   * Criar fase existiu até 31/07 e foi removido (commit 65213ab) com um motivo
   * que já não vale: "fase avulsa só produzia um agrupador vazio que depois não
   * dava para remover". Foi o PRÓPRIO commit que adicionou o arquivar fase — a
   * razão de remover deixou de existir no mesmo instante.
   *
   * Religar o `CreatePhaseDialog` antigo seria pior que não ter: ele grava só
   * em `phases`, sem código EAP, e a fase resultante não se move nem abre a
   * ficha completa — que é exatamente o defeito relatado. Aqui ela nasce em
   * `activities`, o mesmo formato que 60 fases da base já têm.
   *
   * O CÓDIGO é o próximo livre no nível da fase: com 1.1 e 1.2 ocupados, sugere
   * 1.3. Sem código a fase não teria nível, e sem nível ela não recua nem
   * ordena — voltaria a ser um item solto.
   */
  const proximoCodigoDeFase = (): string => {
    const raiz = eapRootCode() ?? "1";
    const usados = new Set(
      activities
        .filter((a) => !a.is_trashed)
        .map((a) => (a as { wbs_code?: string | null }).wbs_code)
        .filter((c): c is string => !!c && eapIsFaseLevel(eapLevel(c))),
    );
    for (let i = 1; i <= 999; i++) {
      const candidato = `${raiz}.${i}`;
      if (!usados.has(candidato)) return candidato;
    }
    return `${raiz}.999`;
  };

  const criarFase = async () => {
    const codigo = proximoCodigoDeFase();
    const { error } = await supabase.from("activities").insert({
      project_id: projectId,
      title: `Nova fase ${codigo}`,
      wbs_code: codigo,
      // `item_type: 'fase'` + código de nível 2 é o que faz `resolveEapKind`
      // devolver "fase" — a mesma leitura que a lista, o quadro e a importação
      // usam. Sem `parent_id`: a fase é de topo por definição.
      item_type: "fase",
      parent_id: null,
      phase_id: null,
      workflow_stage_id: backlogStageId,
      status: "pending",
      priority: "pendente",
    } as never);
    if (error) {
      toast({ title: "Erro ao criar fase", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Fase ${codigo} criada`, description: "Dê um nome a ela e adicione as tarefas." });
    onDataChanged();
  };

  const handleSaveTitle = async (activityId: string) => {
    const newTitle = editingTitleValue.trim();
    if (!newTitle) { setEditingTitleId(null); return; }
    await supabase.from("activities").update({ title: newTitle }).eq("id", activityId);
    setEditingTitleId(null);
    onDataChanged();
  };

  // Papel EAP exibido (fonte única: lib/eapModel). Três papéis: Fase (agrupador,
  // qualquer nível), Atividade (folha), Marco. 'pacote' legado aparece como Fase.
  type Kind = EapKind;
  const resolveKind = (a: Activity, hasChildren: boolean): Kind => resolveEapKind(a, hasChildren);
  /**
   * Níveis oferecidos no preenchimento de prioridade em lote.
   *
   * O GUT é G × U × T (1–5 cada), mas pedir os três fatores para dezenas de
   * tarefas seria o oposto de agilizar. Aqui cada nível tem uma combinação
   * fixa — classificação grossa para tirar a tarefa de "sem prioridade"; quem
   * precisar de precisão ajusta no diálogo.
   *
   * Os fatores foram ESCOLHIDOS PELO SCORE que produzem, não por simetria:
   * aplicar 4/4/4 daria 64, que a escala lê como "crítica", e o botão "Alta"
   * entregaria outro nível do que anuncia. Conferido contra gutLabel:
   *   2·2·2 =   8 → baixa      3·3·3 =  27 → média
   *   4·3·3 =  36 → alta       4·4·4 =  64 → crítica
   *   5·5·4 = 100 → urgente
   */
  const GUT_LOTE: Array<{ label: string; g: number; u: number; t: number; priority: string; dot: string }> = [
    { label: "Baixa", g: 2, u: 2, t: 2, priority: "low", dot: "bg-emerald-500" },
    { label: "Média", g: 3, u: 3, t: 3, priority: "medium", dot: "bg-amber-500" },
    { label: "Alta", g: 4, u: 3, t: 3, priority: "high", dot: "bg-orange-500" },
    { label: "Crítica", g: 4, u: 4, t: 4, priority: "critical", dot: "bg-red-500" },
    { label: "Urgente", g: 5, u: 5, t: 4, priority: "urgent", dot: "bg-fuchsia-500" },
  ];

  const KIND_META: Record<Kind, { label: string; icon: JSX.Element; cls: string }> = {
    // Projeto é a raiz virtual: não deveria aparecer como item, mas o mapa
    // precisa cobrir todos os papéis — e EAP ainda não renumerada tem nível 1.
    projeto: { label: "Projeto", icon: <Layers className="w-3 h-3" />, cls: "text-foreground bg-foreground/10 border-foreground/25" },
    fase: { label: "Fase", icon: <Layers className="w-3 h-3" />, cls: "text-primary bg-primary/10 border-primary/30" },
    // Entrega agrupa como a Fase, mas está DENTRO dela — tom mais discreto para
    // a hierarquia se ler de relance: a fase é o marco visual, a entrega é o
    // que ela contém.
    entrega: { label: "Entrega", icon: <Package className="w-3 h-3" />, cls: "text-primary/80 bg-primary/5 border-primary/20" },
    atividade: { label: "Atividade", icon: <Circle className="w-3 h-3" />, cls: "text-muted-foreground bg-muted border-border" },
    marco: { label: "Marco", icon: <Diamond className="w-3 h-3 fill-amber-500 text-amber-500" />, cls: "text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/40" },
  };
  // A troca de tipo pela linha foi removida junto com o menu do ícone: o papel
  // na EAP não é escolha avulsa, vem do nível do código e de ter filhos. Mudar
  // o tipo é pelo diálogo da atividade, onde o campo fica junto do Código EAP
  // e do "Dentro de" — que são o que determina o papel.

  // Conta itens e concluídos de um grupo (raízes + toda a subárvore visível).
  const groupProgress = (roots: Activity[]): { total: number; done: number } => {
    let total = 0, done = 0;
    const walk = (a: Activity) => {
      total += 1;
      if (a.status === "completed") done += 1;
      (childrenByParent.get(a.id) || []).forEach(walk);
    };
    roots.forEach(walk);
    return { total, done };
  };

  // Cabeçalho de colunas alinhado com o grid das linhas.
  const ColumnHeader = () => (
    <div
      className="grid items-center gap-2 px-3 py-1.5 bg-muted/40 border-b border-border text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground"
      style={{ gridTemplateColumns: backlogGrid }}
    >
      {/* MARCAR TODAS / NENHUMA — e o modo liga sozinho ao primeiro clique.
          Esta caixa passou por dois erros meus. Primeiro pedia dois cliques (um
          para ligar o modo, outro para marcar) com um link "sair" que empurrava
          a coluna. Corrigi fazendo-a marcar TUDO ao ligar — e aí só existia
          "todas ou nada": não dava mais para escolher algumas, porque as caixas
          das linhas só aparecem no modo e o modo já vinha com tudo marcado.

          Agora tem três estados, como qualquer tabela: vazia (nada), traço
          (algumas) e marcada (todas). Clicar com nada marcado seleciona tudo;
          com algo marcado, limpa e sai — e no meio-termo o usuário mexe nas
          caixas das linhas, que é o que faltava.

          FICA NA COLUNA DAS CAIXAS (13/08/2026), não colada ao rótulo "Tarefa".
          Antes ela vivia dentro da célula do título, deslocada uns 30px para a
          direita da coluna que comanda — e por isso não se lia como "todas
          desta coluna". Aqui ela alinha com as caixas das linhas, que é o que a
          torna compreensível sem legenda. */}
      {/* Duas células SEMPRE — [caixa][expandir] —, na mesma ordem das linhas.
          Antes o cabeçalho alternava entre uma e duas conforme o modo, e a
          caixa mudava de coluna ao ligar a seleção. */}
      <span className="flex items-center justify-center">
        <Checkbox
          checked={
            !selectMode ? false
              : selectedIds.size === backlogActs.length ? true
              : "indeterminate"
          }
          onCheckedChange={() => {
            if (!selectMode) {
              setSelectMode(true);
              setSelectedIds(new Set(backlogActs.map((a) => a.id)));
              return;
            }
            setSelectedIds(new Set());
            setSelectMode(false);
          }}
          /* Mesmo tamanho das caixas das linhas (h-4, o padrão do componente).
             Estava em h-3.5 de quando ela era a caixinha discreta do hover:
             empilhada na coluna, ninguém comparava. Lado a lado numa coluna
             própria, a diferença de 2px aparece como desalinho. */
          title={selectMode ? `Limpar seleção (${selectedIds.size})` : `Selecionar todas as ${backlogActs.length}`}
        />
      </span>
      <span />
      <span>EAP</span>
      <span>Tipo</span>
      <span>Nome</span>
      {activeCols.map((c) => (
        // Número alinha à direita no cabeçalho também: título à esquerda com
        // valor à direita faz a coluna parecer torta.
        <span key={c.id} className={c.id === "hours" || c.id === "priority" ? "text-right" : ""}>
          {c.label}
        </span>
      ))}
      <span className="flex justify-end">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="h-5 w-5 inline-flex items-center justify-center rounded border border-muted-foreground/30 text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
              title="Escolher colunas"
            >
              <Plus className="w-3 h-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2" align="end">
            <div className="text-[11px] font-semibold text-muted-foreground mb-1.5 normal-case">
              Colunas visíveis
            </div>
            <div className="space-y-0.5">
              {BACKLOG_COLS.map((col) => (
                <label
                  key={col.id}
                  className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted cursor-pointer text-xs normal-case font-normal"
                >
                  <Checkbox checked={visibleCols.includes(col.id)} onCheckedChange={() => toggleCol(col.id)} />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>

            {/* DENSIDADE — dois níveis, guardada por usuário.
                Fica aqui, junto das colunas, porque é a mesma pergunta ("como
                eu quero ver esta lista") e a regra dos três não deixa nascer um
                quarto controle no topo. */}
            <div className="mt-2 pt-2 border-t">
              <div className="text-[11px] font-semibold text-muted-foreground mb-1.5 normal-case">
                Densidade
              </div>
              <div className="flex gap-1">
                {([
                  { id: "compacto" as const, label: "Compacto" },
                  { id: "confortavel" as const, label: "Confortável" },
                ]).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setPrefs({ ...prefs, densidadeBacklog: d.id })}
                    className={cn(
                      "flex-1 h-7 rounded text-[11px] normal-case font-normal border transition-colors",
                      densidade === d.id
                        ? "bg-primary/10 border-primary/40 text-primary font-medium"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </span>
    </div>
  );

  /**
   * O RECUO VEM DO CÓDIGO EAP, não do vínculo de pai.
   *
   * `depth` conta saltos de `parent_id`, e na EAP importada isso não descreve
   * a hierarquia: pacote de topo (1.1.1, 1.2.1) chega com `parent_id` nulo,
   * então `depth = 0` — a mesma margem de uma atividade de nível 4 dentro de
   * outro pacote. A lista mostrava dois níveis de uma estrutura de quatro.
   *
   * O código sabe onde o item está: `eapLevel("1.1.1")` é 3. A fase (nível 2)
   * é a régua — ela desenha a própria faixa, então o que está sob ela começa
   * em zero e cresce dali.
   *
   * `depth` continua valendo como FALLBACK para item sem código (criado à mão
   * no Kanban ou no Backlog): ali não há nível a ler, e o vínculo de pai é a
   * única hierarquia que existe.
   *
   * TETO de 4 níveis: além disso o título perde a tela em largura estreita, e
   * o código continua dizendo a profundidade real de quem quiser conferir.
   */
  const recuoDaLinha = (a: Activity, depth: number, flat: boolean): number => {
    // Raia plana (agrupar por responsável, prioridade…): não há árvore para
    // representar — todos os itens são irmãos naquela dimensão.
    if (flat) return 0;
    const nivel = eapLevel((a as { wbs_code?: string | null }).wbs_code);
    if (nivel === null) return depth * 18;
    // Nível 2 é a fase, que já tem faixa própria: o conteúdo dela começa em 0.
    const passos = Math.max(0, nivel - (EAP_FASE_LEVEL + 1));
    return Math.min(passos, 4) * 18;
  };

  const renderActivityRow = (activity: Activity, depth: number = 0, flat: boolean = false) => {
    const isSelected = selectedIds.has(activity.id);
    const gutLevel = normalizeGut(activity.priority);
    // O SCORE (1–125), não o rótulo: é ele que a coluna mostra e a faixa de cor
    // consome. Mesma fonte do KanbanCard — `priority_score`.
    const gutScore = activity.priority_score ?? null;
    const subs = flat ? [] : (childrenByParent.get(activity.id) || []);
    const hasChildren = subs.length > 0;
    const isCollapsed = collapsedParents.has(activity.id);
    const isEditingTitle = editingTitleId === activity.id;
    const quickAddOpen = quickAddKey === `parent:${activity.id}`;

    const kind = resolveKind(activity, hasChildren);
    const kindMeta = KIND_META[kind];
    // Prontidão: o que falta para esta tarefa ser executável. Agrupador não
    // entra (horas e datas dele são rollup dos filhos) nem concluída.
    const prontidao = avaliarProntidao(activity, hasChildren);
    const stg = activity.workflow_stage_id ? stageById.get(activity.workflow_stage_id) : null;
    const dc = dependencyCounts.get(activity.id);
    const hasDeps = !!dc && (dc.pred > 0 || dc.succ > 0);

    const renderCol = (colId: string) => {
      // ── Decisão 3 — o GUT mostra o NÚMERO, e só colore a partir de 60 ────
      //
      // Era uma pílula com borda, fundo e ponto colorido, exibindo o rótulo
      // ("Alta") em toda faixa. Duas perdas: o score — que é o diferencial do
      // produto — ficava invisível, e com tudo colorido nada chamava atenção.
      //
      // Agora: número à direita, cinza abaixo de 60, âmbar de 60 a 99,
      // vermelho de 100 em diante. A faixa vem de lib/mesaDePlanejamento, a
      // mesma que o KanbanCard consome — não há segunda régua.
      //
      // MARCO não tem GUT: a célula fica literalmente vazia (decisão 5).
      if (colId === "priority") {
        const vazio = comoMostrarVazio(gutScore, "gut", !!activity.is_milestone);
        if (vazio.tipo === "nao-se-aplica") return <span key="priority" />;
        if (vazio.tipo === "a-definir") {
          return (
            <span key="priority" className={`${CLASSE_NUMERO} text-[12px] text-muted-foreground/40 italic`} title={ROTULO_GUT_VAZIO}>
              a definir
            </span>
          );
        }
        const faixa = faixaDoGut(gutScore);
        return (
          <span
            key="priority"
            className={`${CLASSE_NUMERO} text-[12px] ${corDoGut(faixa)}`}
            title={`GUT ${gutScore} — ${GUT_META[gutLevel].label}`}
          >
            {gutScore}
          </span>
        );
      }
      /**
       * SITUAÇÃO — vazia na fila, ponto + palavra no quadro.
       *
       * A pergunta que ela responde é "isto já está sendo feito?". Para quem
       * está na fila a resposta é "não", e o VAZIO já diz isso: é o estado
       * normal desta tela, e um traço em 136 de 141 linhas seria ruído.
       *
       * O estágio deriva da COLUNA, via `ehColunaDeBacklog` — nunca do campo
       * `estagio`, que existe no banco mas nasceu como espelho e ninguém lê.
       * Ler dois lugares recria a divergência.
       *
       * O ponto é o mesmo de 7px do status, com a cor da coluna; a palavra é o
       * título real da coluna do projeto ("Não iniciado", "Em Andamento",
       * "Pendências", "Concluída"), não um enum traduzido no componente.
       */
      if (colId === "situacao") {
        // NÃO usa o helper `naFila` daqui de cima: ele conta "a_iniciar" como
        // fila, porque responde "o que ainda não começou" — outra pergunta.
        // "Não iniciado" É coluna do quadro, e um item lá foi promovido.
        // Só a categoria `backlog` significa fila.
        const cat = stg
          ? parseWorkflowCategory((stg as { categoria?: string }).categoria)
            ?? categoryFromLegacyFlags(stg as never)
          : null;
        const estaNaFila = !stg || cat === "backlog";
        if (estaNaFila) return <span key="situacao" aria-hidden="true" />;
        return (
          <span key="situacao" className="min-w-0 flex items-center gap-1.5">
            <span
              className="w-[7px] h-[7px] rounded-full shrink-0"
              style={{ backgroundColor: stg.color }}
              aria-hidden="true"
            />
            <span className="truncate text-muted-foreground" title={`No quadro: ${stg.title}`}>
              {stg.title}
            </span>
          </span>
        );
      }
      // ── Decisão 2 — status é um ponto de 7px, não uma pílula ─────────────
      //
      // Em 200 linhas, pílula colorida vira listra: a cor deixa de destacar e
      // passa a ser o fundo da tela. O ponto guarda a mesma informação (a cor
      // da coluna) no menor espaço que ainda a comunica, e o nome da coluna
      // vai para o title — que é onde se pergunta "qual é mesmo o status?".
      if (colId === "status") {
        return (
          <span key="status" className="min-w-0 flex items-center">
            {stg ? (
              <span
                className="w-[7px] h-[7px] rounded-full shrink-0"
                style={{ backgroundColor: stg.color }}
                title={`Status: ${stg.title}`}
                aria-label={`Status: ${stg.title}`}
              />
            ) : (
              <span
                className="w-[7px] h-[7px] rounded-full shrink-0 border border-muted-foreground/30"
                title="Sem status"
                aria-label="Sem status"
              />
            )}
          </span>
        );
      }
      if (colId === "assigned_to") {
        return (
          <span key="assigned_to" className="flex items-center gap-2 min-w-0">
            {activity.assigned_to ? (() => {
              const rawAssignee = activity.assigned_to || "";
              const resolvedName = profileNameMap[rawAssignee] || rawAssignee;
              const avatar = resolveAvatarFromLookup(rawAssignee, resolvedName, profileAvatarMap);
              return (
                <>
                  <Avatar className="h-5 w-5 shrink-0">
                    {avatar ? <AvatarImage src={avatar} alt={resolvedName} /> : null}
                    <AvatarFallback className="text-[8px] font-semibold">{getAvatarInitials(resolvedName)}</AvatarFallback>
                  </Avatar>
                  <span className="text-[12px] text-foreground/90 truncate">{resolvedName}</span>
                </>
              );
            })() : (() => {
              /**
               * O VAZIO É UM BOTÃO, não um rótulo.
               *
               * Era o texto "a definir" — que descrevia a pendência e parava
               * aí: para resolver, a pessoa abria a atividade. Numa lista com
               * 103 sem responsável, isso é 103 idas e voltas.
               *
               * Agora `+ Sem responsável` abre o seletor na própria linha. A
               * contagem do que falta já vive na faixa do topo, então o texto
               * repetido em cada linha era ruído; o botão é ação.
               *
               * No MARCO a célula fica literalmente VAZIA — não é lacuna,
               * marco não tem responsável (`comoMostrarVazio` → não-se-aplica).
               */
              const vazio = comoMostrarVazio(activity.assigned_to, "responsavel", !!activity.is_milestone);
              if (vazio.tipo === "nao-se-aplica") return null;
              // Sem permissão sobre a atividade, o campo vazio FICA QUIETO —
              // um botão que abre um seletor e depois falha é pior que nada.
              // `ehMinha` indefinido = a pessoa edita tudo (ver a prop).
              if (ehMinha && !ehMinha(activity)) return null;
              return (
                <Popover
                  open={openAssigneeFor === activity.id}
                  onOpenChange={(o) => setOpenAssigneeFor(o ? activity.id : null)}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[12px] text-muted-foreground/50 hover:text-primary transition-colors"
                      title="Definir responsável"
                    >
                      <Plus className="w-3 h-3 shrink-0" />
                      Sem responsável
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-2" align="start" onClick={(e) => e.stopPropagation()}>
                    {/* O MESMO seletor da edição e do Cronograma: busca por
                        nome, setor e função, e marca homônimo com o e-mail
                        (ver lib/homonimos). Uma lista de nomes soltos aqui
                        seria a quinta implementação da mesma coisa. */}
                    <PersonCombobox
                      people={profiles.map((p) => ({
                        id: p.id,
                        full_name: p.full_name || p.email || "Sem nome",
                        sector: (p as { sector?: string | null }).sector ?? null,
                        role_title: (p as { role_title?: string | null }).role_title ?? null,
                        email: (p as { email?: string | null }).email ?? null,
                        avatar_url: resolveAvatarFromLookup(p.id, p.full_name || p.id, profileAvatarMap) ?? null,
                      }))}
                      value={null}
                      placeholder="Quem responde por isto?"
                      onSelect={(p) => definirResponsavelDaLinha(activity.id, p.full_name)}
                    />
                  </PopoverContent>
                </Popover>
              );
            })()}
          </span>
        );
      }
      if (colId === "end_date") {
        const overdue = activity.status !== "completed" && estaAtrasado(activity.end_date);
        // Atraso: a data fica vermelha COM os dias ao lado — "vermelho" diz
        // que atrasou, o número diz o quanto, e é o quanto que prioriza.
        // `diasAte` devolve negativo quando a data passou — e por dentro usa
        // `parseDataLocal`, que é o caminho seguro: coluna `date` não pode
        // virar `new Date()`, senão o fuso desloca o dia para quem está a
        // oeste de UTC (ver lib/dataLocal).
        const atraso = overdue ? Math.abs(diasAte(activity.end_date) ?? 0) : 0;

        /**
         * PREVISTO é a JANELA — `08/09 → 09/09`, não só o prazo.
         *
         * Planejar é decidir quando começa E quando termina; mostrar só o fim
         * esconde metade da decisão, e era o que a coluna "Prazo" fazia.
         *
         * Só o dia e o mês (`dd/MM`): o ano cabe no title, e repetir "2026"
         * 141 vezes gasta a largura que o nome precisa. `tabular-nums` para as
         * datas alinharem em coluna.
         *
         * O AGRUPADOR mostra a janela DERIVADA — `derived_start`/`derived_end`,
         * somados no servidor sobre todas as filhas. Ele não tem data própria:
         * a fase vai de quando a primeira filha começa até quando a última
         * termina.
         */
        const ehPaiData = hasChildren || (activity.derived_children ?? 0) > 0;
        const ini = ehPaiData ? (activity.derived_start ?? activity.start_date) : activity.start_date;
        const fim = ehPaiData ? (activity.derived_end ?? activity.end_date) : activity.end_date;
        const dm = (d?: string | null) => (d ? formatarDataBR(d).slice(0, 5) : null);

        return (
          <span
            key="end_date"
            className={`text-[12px] font-mono tabular-nums ${overdue ? "text-destructive font-semibold" : "text-foreground/80"}`}
            title={ehPaiData ? "Janela somada a partir das subatividades" : undefined}
          >
            {ini || fim ? (
              <>
                {dm(ini) ?? "—"}
                <span className="mx-0.5 text-muted-foreground/50">→</span>
                {dm(fim) ?? "—"}
                {atraso > 0 && <span className="ml-1 font-normal">+{atraso}d</span>}
              </>
            ) : (
              // Data é o único campo que o marco TEM — por isso "sem data"
              // vale para ele também.
              <span className="text-muted-foreground/40">— sem data</span>
            )}
          </span>
        );
      }
      // ── Decisão 4 — número à direita, com tabular-nums ───────────────────
      //
      // Esforço e custo existem para serem comparados de relance. À esquerda,
      // e com dígito de largura variável, não comparam nada: 8h e 120h começam
      // no mesmo ponto e terminam em lugares diferentes.
      //
      // O ESFORÇO DO PAI vem do servidor (`derived_hours`), não de soma no
      // cliente — ver a fase 09. Ausência é ausência: pai sem derivação mostra
      // "—" acinzentado, nunca as horas próprias dele no lugar do total.
      if (colId === "hours") {
        const ehPai = hasChildren || (activity.derived_children ?? 0) > 0;
        const derivado = activity.derived_hours;
        const h = ehPai
          ? (derivado === null || derivado === undefined ? null : Number(derivado) || 0)
          : (Number(activity.hours) || 0);

        if (ehPai && h === null) {
          return (
            <span key="hours" className={`${CLASSE_NUMERO} text-[12px] text-muted-foreground/40`} title="As horas das subatividades ainda não foram somadas pelo servidor.">
              —
            </span>
          );
        }
        const vazio = comoMostrarVazio(h, "esforco", !!activity.is_milestone);
        if (vazio.tipo === "nao-se-aplica") return <span key="hours" />;
        return (
          <span
            key="hours"
            className={`${CLASSE_NUMERO} text-[12px] text-foreground/80`}
            title={ehPai ? "Somado no servidor a partir das subatividades" : undefined}
          >
            {vazio.tipo === "preenchido"
              ? formatarHoras(h ?? 0)
              : <span className="text-muted-foreground/40 italic">a definir</span>}
          </span>
        );
      }
      if (colId === "cost") {
        const ehPai = hasChildren || (activity.derived_children ?? 0) > 0;
        const derivado = activity.derived_cost;
        const c = ehPai
          ? (derivado === null || derivado === undefined ? null : Number(derivado) || 0)
          : (Number(activity.cost) || 0);

        if (ehPai && c === null) {
          return (
            <span key="cost" className={`${CLASSE_NUMERO} text-[12px] text-muted-foreground/40`} title="O custo das subatividades ainda não foi somado pelo servidor.">
              —
            </span>
          );
        }
        const vazio = comoMostrarVazio(c, "custo", !!activity.is_milestone);
        if (vazio.tipo === "nao-se-aplica") return <span key="cost" />;
        return (
          <span
            key="cost"
            className={`${CLASSE_NUMERO} text-[12px] text-foreground/80`}
            title={ehPai ? "Somado no servidor a partir das subatividades" : undefined}
          >
            {vazio.tipo === "preenchido"
              ? formatarCusto(c ?? 0)
              : <span className="text-muted-foreground/40 italic">a definir</span>}
          </span>
        );
      }
      return <span key={colId} />;
    };

    return (
      <div key={activity.id}>
        <div
          // A altura da linha vem da DENSIDADE (30px compacto / 36px
          // confortável), no `style` abaixo, em vez do `py-1.5` fixo de antes.
          className={`grid items-center gap-2 border-b px-3 hover:bg-muted/40 transition-colors cursor-pointer group ${
            isSelected ? "bg-primary/5" : ""
          } ${
            /* MARCA DO QUE É SEU — uma barra fina na borda esquerda, só para
               quem edita um subconjunto. Sem cor de alarme e sem ocupar
               coluna: a linha já é disputada, e a informação aqui é "isto é
               seu", não "isto está errado".
               Só com o filtro DESLIGADO: ligado, todas as linhas seriam suas e
               a barra viraria enfeite em todas. */
            !soMinhas && ehMinha?.(activity) ? "border-l-2 border-l-primary" : ""
          }`}
          // O recuo de profundidade NÃO vai aqui: padding na linha encolhe a
          // área do grid e empurra TODAS as colunas para a direita, tanto mais
          // quanto mais fundo o item — era o que desalinhava as linhas do
          // cabeçalho. O recuo é aplicado só na coluna do título, abaixo.
          //
          // `minHeight` e não `height`: título que quebra em duas linhas
          // continua cabendo. Cortar texto para respeitar a densidade seria
          // trocar informação por alinhamento.
          style={{ gridTemplateColumns: backlogGrid, minHeight: alturaDaLinha }}
          // No modo seleção a linha ALTERNA a marcação em vez de abrir a
          // edição: quem está escolhendo várias tarefas quer clicar rápido, e
          // mirar na caixinha de 14px a cada item é trabalho desnecessário.
          onClick={() => {
            if (isEditingTitle) return;
            if (selectMode) { toggleSelect(activity.id); return; }
            onEditActivity(activity);
          }}
        >
          {/* col: CAIXA — sempre à vista, na coluna dela.
              ENTRAR NA SELEÇÃO PELA LINHA. Antes o modo só ligava pelo
              cabeçalho, e ligá-lo marcava tudo: para escolher três tarefas era
              preciso marcar as 718 e desmarcar 715. O primeiro clique na caixa
              liga o modo já com aquela tarefa marcada — o gesto natural de
              "quero estas" — e, em agrupador, com a família junto.

              `estadoDaCaixa` traz o traço do meio-termo: pai com ALGUNS filhos
              marcados. Sem ele o pai pareceria desmarcado e o contador do
              rodapé diria um número que a tela não confirma. */}
          <Checkbox
            checked={selectMode ? estadoDaCaixa(activity.id) : false}
            onCheckedChange={() => {
              if (!selectMode) {
                setSelectMode(true);
                // A FAMÍLIA VAI JUNTO SÓ EM AGRUPADOR.
                //
                // Quem clica na caixa de uma Fase ou Entrega quer o conjunto:
                // a caixa é um contêiner, e mandá-la ao quadro sem o conteúdo
                // deixa a fase para trás — o defeito relatado em 13/08.
                //
                // Mas ATIVIDADE não é contêiner. Antes o `descendentesDe` valia
                // para qualquer linha, então marcar uma atividade com
                // subatividades arrastava a subárvore inteira: mudar o status
                // de uma tarefa mudava o das filhas, sem pedir. Promover move
                // só a atividade escolhida — nunca ancestrais, nunca a
                // subárvore (docs/atividade-v2/DIVERGENCIAS.md item 7).
                //
                // Quem quiser a subárvore continua conseguindo: marca as
                // filhas, ou usa a caixa do agrupador que as contém.
                const levaAFamilia = eapCanGroup(kind);
                setSelectedIds(
                  new Set(levaAFamilia ? [activity.id, ...descendentesDe(activity.id)] : [activity.id]),
                );
                return;
              }
              toggleSelect(activity.id);
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Selecionar ${activity.title}`}
            // O texto segue o comportamento: só o agrupador leva o conteúdo.
            // Prometer "e o que está dentro" numa atividade seria mentir agora
            // que ela vai sozinha.
            title={eapCanGroup(kind) && hasChildren ? "Seleciona esta fase e o que está dentro" : "Selecionar esta tarefa"}
            className={cn("shrink-0", !selectMode && caixaNoHover)}
          />
          {hasChildren ? (
            <button
              type="button"
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground shrink-0"
              onClick={(e) => { e.stopPropagation(); toggleParent(activity.id); }}
              title={isCollapsed ? "Expandir" : "Recolher"}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}

          {/* ── col EAP ────────────────────────────────────────────────────
              Coluna PRÓPRIA, não mais um selo dentro do título. Alinhado à
              direita e em `tabular-nums`: "1.1" e "1.1.10.2" têm contagens de
              dígitos diferentes, e é o comprimento do número que deixa o nível
              legível de relance.

              Marco NÃO TEM wbs_code (decisão de 11/08: ele é do cronograma,
              não da EAP). `codigoParaExibir` devolve a âncora do pai — nunca um
              código inventado. */}
          <span
            className="text-[10.5px] font-mono tabular-nums text-muted-foreground text-right pr-1 truncate"
            title={activity.is_milestone ? "Marco não tem código EAP — mostra a âncora do pai" : "Código EAP"}
          >
            {codigoParaExibir(
              activity,
              activity.parent_id
                ? (activities.find((a) => a.id === activity.parent_id)?.wbs_code ?? null)
                : null,
            )}
          </span>

          {/* ── col TIPO ───────────────────────────────────────────────────
              ATIVIDADE apagado até quase sumir; MARCO em âmbar.
              O contraste é a informação: numa lista onde 133 de 141 linhas são
              atividade, o que precisa saltar são os 4 marcos. Escrever
              "ATIVIDADE" com o mesmo peso 133 vezes seria repetir o óbvio em
              destaque — e foi por isso que a decisão 1 tirou o badge. Aqui ele
              volta como TEXTO, não como pastilha, e quase invisível. */}
          <span className="text-[9px] font-semibold uppercase tracking-wider truncate">
            {activity.is_milestone ? (
              <span className="text-amber-600 dark:text-amber-400">Marco</span>
            ) : eapCanGroup(kind) ? (
              <span className="text-muted-foreground/50">{kindMeta.label}</span>
            ) : (
              <span className="text-muted-foreground/25">Atividade</span>
            )}
          </span>

          {/* col: ícone de tipo (clicável) + título + deps.
              O recuo por profundidade vive AQUI, dentro da coluna do título:
              assim a hierarquia continua legível sem deslocar as demais
              colunas, que permanecem alinhadas com o cabeçalho. */}
          {/* `gap-0` no contêiner e `gap-2` só no conteúdo: com o gap no pai, as
              guias herdariam 8px de folga entre si e o recuo deixaria de ser
              múltiplo exato de 18px — os fios não alinhariam entre linhas. */}
          <div className="flex items-center gap-0 min-w-0">
            {/* GUIAS: uma linha fina por nível de recuo, em vez de espaço vazio.
                Só o padding deixava o olho contar margens para saber a que
                pacote a atividade pertence; a guia liga visualmente o filho ao
                bloco acima. `self-stretch` + offsets negativos fazem os traços
                se encontrarem entre linhas vizinhas, formando um fio contínuo. */}
            {Array.from({ length: recuoDaLinha(activity, depth, flat) / 18 }).map((_, i) => (
              <span key={i} aria-hidden className="relative w-[18px] shrink-0 self-stretch">
                <span className="absolute left-[8px] -top-2 -bottom-2 border-l border-border" />
              </span>
            ))}
            <span className="flex items-center gap-2 min-w-0">
            {/* INDICADOR, não menu. Era um dropdown para trocar o tipo aqui na
                linha, mas o papel na EAP não é escolha avulsa: vem do nível do
                código e de o item ter filhos ou não. Oferecer a troca solta
                deixava opções sem sentido no contexto — "Entrega" para um item
                sem código EAP, que não tem nível nenhum. Quem precisa mudar o
                tipo faz pelo diálogo da atividade, onde o campo aparece junto do
                Código EAP e do "Dentro de", que são o que de fato determinam o
                papel. */}
            {/* ── Decisão 1 — sem badge de tipo em ATIVIDADE ───────────────
                Fase e Entrega já viram faixa de grupo; Marco se identifica
                sozinho pelo losango. O que sobra numa linha *é* atividade — o
                badge repetia o que a indentação e o código EAP já diziam, e era
                90% dos badges da tela.

                A regra vem de `mostrarBadgeDeTipo`, testada: agrupador não,
                marco sim, atividade não. O espaçador continua para o título das
                atividades alinhar com o dos marcos. */}
            {mostrarBadgeDeTipo(activity, eapCanGroup(kind)) ? (
              <span
                title={`Tipo: ${kindMeta.label}`}
                aria-label={`Tipo: ${kindMeta.label}`}
                className={`shrink-0 inline-flex items-center justify-center w-5 h-5 rounded border bg-muted/60 ${kindMeta.cls}`}
              >
                {kindMeta.icon}
              </span>
            ) : (
              <span className="w-5 shrink-0" aria-hidden />
            )}

            {isEditingTitle ? (
              <Input
                autoFocus
                value={editingTitleValue}
                onChange={(e) => setEditingTitleValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => handleSaveTitle(activity.id)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") handleSaveTitle(activity.id);
                  if (e.key === "Escape") setEditingTitleId(null);
                }}
                className="h-7 text-[13px]"
              />
            ) : (
              <span className="min-w-0 flex items-center gap-2">
                {/* O código EAP saiu daqui: virou COLUNA própria, à esquerda.
                    Dentro do título ele empurrava o nome para a direita numa
                    distância que variava com o número de dígitos — e o nome é
                    o que a pessoa lê. */}
                <span
                  className={`text-[13px] font-normal truncate ${activity.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingTitleId(activity.id);
                    setEditingTitleValue(activity.title);
                  }}
                  title={activity.description || "Duplo-clique para editar"}
                >
                  {activity.title}
                </span>
                {hasChildren && <span className="text-[11px] text-muted-foreground font-normal shrink-0">({subs.length})</span>}
                {/* O QUE FALTA para esta tarefa virar trabalho. Sem isto, um
                    rascunho sem responsável nem prazo tinha exatamente a mesma
                    aparência de uma tarefa pronta — e só abrindo dava para
                    saber. Medido: 406 das 471 avaliáveis estão incompletas.
                    Concluídas e agrupadores não recebem chip (não se avaliam). */}
                {/* ÍCONE, NÃO CHIP VERMELHO (25/08/2026).
                    Era "falta responsável · prazo +3" em vermelho, e a medição
                    explica por que incomodava: 2.135 das 2.798 atividades vivas
                    não têm responsável, 2.177 não têm prazo. O alerta aparecia
                    em TRÊS DE CADA QUATRO linhas — e um alerta que marca a
                    maioria deixa de alertar: vira o padrão visual da tela.
                    Pior, consumia a coluna de prioridade e empurrava o título.
                    A informação não se perde: as colunas RESPONSÁVEL e PRAZO já
                    dizem "Sem responsável" e "—", o contador do topo mede, e o
                    filtro "Incompletas" continua servindo. O que sai é o
                    alarme. Numa EAP recém-importada estar incompleta é o estado
                    normal do planejamento, não um defeito a denunciar. */}
                {prontidao.avaliavel && !prontidao.pronta && (
                  <span
                    className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                    title={`Falta preencher: ${prontidao.faltando.map((r) => PRONTIDAO_LABELS[r]).join(", ")}. Clique na tarefa para completar.`}
                    aria-label={`Incompleta — falta ${prontidao.faltando.map((r) => PRONTIDAO_LABELS[r]).join(", ")}`}
                  >
                    <CircleDashed className="w-3.5 h-3.5" />
                  </span>
                )}
                {hasDeps && (
                  <span
                    className="shrink-0 text-[11px] text-primary/80"
                    title={`${dc!.pred} predecessora(s) · ${dc!.succ} sucessora(s)`}
                  >
                    🔗{dc!.pred > 0 ? `←${dc!.pred}` : ""}{dc!.succ > 0 ? `→${dc!.succ}` : ""}
                  </span>
                )}
              </span>
            )}
            </span>
          </div>

          {/* colunas selecionáveis, na ordem de BACKLOG_COLS */}
          {activeCols.map((c) => renderCol(c.id))}

          {/* col: ações — um "⋯" em vez de ícones soltos. Dois ícones por linha
              viravam ruído numa lista longa, e o menu acomoda ações novas sem
              alargar a coluna. O gatilho fica sempre visível (atenuado em
              repouso): escondê-lo no hover deixava a ação indescobrível. */}
          <span className="flex items-center justify-end shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-opacity opacity-45 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 data-[state=open]:bg-muted"
                  title="Ações da tarefa"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {/* Concluir/reabrir — PRIMEIRO item por ser a ação mais frequente
                    numa lista de tarefas. Veio do botão redondo que ficava no
                    começo da linha e disputava leitura com o ícone de tipo. */}
                <DropdownMenuItem
                  onSelect={() => onToggleActivity(activity.id, activity.status)}
                  className={activity.status === "completed" ? "" : "text-success focus:text-success focus:bg-success/10"}
                >
                  {/* MARCO tem vocabulário próprio: ele não se "conclui", é
                      ATINGIDO — e desde que saiu do quadro (14/08/2026), este é
                      o gesto principal, não mais o arrasto para a coluna final.
                      Chamar de "concluir tarefa" sugeriria trabalho onde há um
                      ponto de controle. */}
                  {activity.is_milestone ? (
                    activity.status === "completed" ? (
                      <><Diamond className="w-3.5 h-3.5 mr-2" /> Desfazer marco atingido</>
                    ) : (
                      <><Diamond className="w-3.5 h-3.5 mr-2 fill-current" /> Marcar como atingido</>
                    )
                  ) : activity.status === "completed" ? (
                    <><Circle className="w-3.5 h-3.5 mr-2" /> Reabrir tarefa</>
                  ) : (
                    <><CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Concluir tarefa</>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    setQuickAddKey(`parent:${activity.id}`);
                    setQuickAddTitle("");
                    setCollapsedParents((prev) => { const n = new Set(prev); n.delete(activity.id); return n; });
                  }}
                >
                  <Plus className="w-3.5 h-3.5 mr-2" /> Adicionar subitem
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onEditActivity(activity)}>
                  <Pencil className="w-3.5 h-3.5 mr-2" /> Abrir detalhes
                </DropdownMenuItem>
                {/* Reorganizar a EAP é ação estrutural: mesma régua do Kanban
                    (isAdmin). Desabilitado COM o motivo em vez de oculto —
                    sumir vira "não consigo mover" sem pista do porquê. */}
                <DropdownMenuItem
                  disabled={!isAdmin}
                  title={isAdmin ? undefined : "Você não tem permissão para reorganizar a EAP deste projeto"}
                  onSelect={() => {
                    if (!isAdmin) return;
                    setMoveIntoIds([activity.id]);
                    setMoveIntoCurrentParent(activity.parent_id ?? null);
                  }}
                >
                  <IndentIncrease className="w-3.5 h-3.5 mr-2" /> Mover para dentro de…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* Desabilitado COM o motivo em vez de oculto: sumir levava a
                    "não consigo excluir" sem pista nenhuma do porquê. */}
                <DropdownMenuItem
                  disabled={!isAdmin}
                  className={isAdmin ? "text-destructive focus:text-destructive focus:bg-destructive/10" : ""}
                  title={isAdmin ? undefined : (deleteBlockedReason || "Você não tem permissão para arquivar esta atividade")}
                  // preventDefault: sem ele o menu fecha e leva o foco junto,
                  // brigando com o diálogo de confirmação que abre em seguida.
                  onSelect={(e) => { e.preventDefault(); if (isAdmin) onDeleteActivity(activity.id); }}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Arquivar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </div>

        {hasChildren && !isCollapsed && (
          <div>
            {subs.map((sub) => renderActivityRow(sub, depth + 1))}
          </div>
        )}

        {/* Recuo igual ao das linhas (12 + depth*22), um nível abaixo do pai:
            o campo cai sob os irmãos que vai criar, não deslocado deles. */}
        {quickAddOpen && (
          <div style={{ paddingLeft: 12 + (depth + 1) * 22 }} className="flex items-center gap-2 pr-3 py-1.5 border-b bg-primary/5">
            <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
            <Input
              autoFocus
              placeholder="Título do subitem — Enter cria · Esc fecha"
              value={quickAddTitle}
              onChange={(e) => setQuickAddTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleQuickAddSubmit(activity.phase_id, activity.id);
                if (e.key === "Escape") { setQuickAddKey(null); setQuickAddTitle(""); }
              }}
              onBlur={() => { if (!quickAddTitle.trim()) { setQuickAddKey(null); } }}
              className="h-8 text-sm"
            />
          </div>
        )}
      </div>
    );
  };

  /**
   * Arquiva UMA fase (soft-delete, igual ao resto do sistema).
   *
   * Faltava: o cabeçalho da fase real só tinha "+ Tarefa", enquanto a fase
   * virtual (atividade com item_type='fase') já tinha o botão de arquivar. Quem
   * criasse uma fase ficava sem saída — a única opção era "Arquivar todas as
   * fases", que é tudo ou nada.
   *
   * As atividades da fase NÃO são apagadas: perdem o vínculo e caem em
   * "Sem fase", que é reversível. Apagar tarefa junto com o agrupador seria
   * destrutivo demais para uma ação de um clique.
   */
  const handleDeletePhase = async (phaseId: string, phaseTitle: string) => {
    const acts = topLevelByPhase.get(phaseId) || [];
    const ok = await appConfirm({
      title: `Arquivar a fase "${phaseTitle}"?`,
      description: acts.length > 0
        ? `${acts.length} ${acts.length === 1 ? "tarefa vai" : "tarefas vão"} para "Sem fase". Nada é excluído — dá para restaurar em Arquivo.`
        : "A fase vai para o Arquivo e pode ser restaurada de lá.",
      confirmText: "Arquivar fase",
      destructive: true,
    });
    if (!ok) return;

    // Solta as tarefas antes de arquivar: se a fase sumir com elas ainda
    // apontando, elas somem da tela sem estarem arquivadas.
    if (acts.length > 0) {
      const { error: unlinkError } = await supabase
        .from("activities").update({ phase_id: null } as any).eq("phase_id", phaseId);
      if (unlinkError) {
        toast({ title: "Erro ao soltar as tarefas da fase", description: unlinkError.message, variant: "destructive" });
        return;
      }
    }

    const { error } = await supabase
      .from("phases")
      .update({ is_trashed: true, trashed_at: new Date().toISOString() } as any)
      .eq("id", phaseId);
    if (error) {
      toast({ title: "Erro ao arquivar a fase", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Fase arquivada", description: "Pode ser restaurada em Arquivo." });
    onDataChanged();
  };

  const renderPhaseGroup = (phaseId: string | null, phaseTitle: string) => {
    const key = phaseId || "none";
    const acts = topLevelByPhase.get(key) || [];
    const isCollapsed = phaseId ? collapsedPhases.has(phaseId) : false;
    const quickAddPhaseKey = `phase:${key}`;
    const quickAddOpen = quickAddKey === quickAddPhaseKey;
    const { total: progTotal, done: progDone } = groupProgress(acts);
    const progPct = progTotal > 0 ? Math.round((progDone / progTotal) * 100) : 0;

    return (
      <div key={key}>
        {/* Mesmo gesto da linha de atividade: o CLIQUE abre a fase, o CHEVRON
            colapsa. Antes só o chevron respondia (alvo de 20px) e não havia
            como abrir a fase — ela nem tinha tela própria. */}
        <div
          className={cn(
            "group flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/50",
            phaseId && "cursor-pointer hover:bg-muted/70 transition-colors",
          )}
          onClick={() => {
            if (selectMode && phaseId) { toggleSelecaoDaFaseReal(acts); return; }
            if (phaseId) openPhase(phaseId, phaseTitle);
          }}
        >
          {/* A FASE REAL seleciona o CONTEÚDO, não a si mesma.
              Ela vive na tabela `phases`, e as ações em lote gravam em
              `activities` — o id dela não caberia em `selectedIds`. Marcar
              pega as atividades de dentro, que é o efeito que se espera; a
              linha da fase em si não entra em nenhuma operação.

              CAIXA E SETA LADO A LADO, SEMPRE. Antes, fora do modo seleção,
              as duas dividiam os mesmos 20px empilhadas: a seta sumia no
              hover e a caixa tomava o lugar dela. Quem mirava a seta para
              expandir via o alvo desaparecer debaixo do cursor e clicava em
              "selecionar". Alvo que troca de função ao ser mirado não é
              affordance, é armadilha — e some com a leitura da linha, que
              deixa de dizer se a fase está aberta ou fechada. */}
          {phaseId ? (
            <>
              {acts.length > 0 ? (
                <Checkbox
                  checked={selectMode ? estadoDaFaseReal(acts) : false}
                  onCheckedChange={() => {
                    if (!selectMode) { setSelectMode(true); toggleSelecaoDaFaseReal(acts, true); return; }
                    toggleSelecaoDaFaseReal(acts);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Selecionar as tarefas de ${phaseTitle}`}
                  title="Seleciona as tarefas desta fase"
                  className={cn("shrink-0", !selectMode && caixaNoHover)}
                />
              ) : (
                /* Fase vazia não tem o que selecionar, mas o espaçador fica:
                   sem ele o título desta linha sai do prumo com o das outras. */
                <span className="w-4 shrink-0" />
              )}
              <button
                type="button"
                className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground shrink-0"
                title={isCollapsed ? "Expandir" : "Recolher"}
                onClick={(e) => { e.stopPropagation(); togglePhase(phaseId); }}
              >
                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </>
          ) : (
            /* Fase virtual (agrupador sem linha em `phases`): não tem o que
               colapsar nem o que selecionar — só o espaçador, para o título
               alinhar com o das fases reais. */
            <span className="w-5 shrink-0" />
          )}
          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-primary/10 text-primary shrink-0">
            {phaseId ? <Layers className="w-3 h-3" /> : <FolderOpen className="w-3 h-3 text-muted-foreground" />}
          </span>
          <h4 className="text-[13px] font-semibold text-foreground truncate">{phaseTitle}</h4>
          {/* gap-2 (não 3) para o "⋯" cair sobre a coluna de ações das linhas.
              stopPropagation: a faixa toda colapsa a fase, então sem isto
              clicar em "+ Tarefa" fecharia o grupo junto. */}
          <div className="flex items-center gap-2 ml-auto shrink-0" onClick={(e) => e.stopPropagation()}>
            {/* ── Decisão 7 — a faixa carrega o subtotal ────────────────────
                Planejar é somar. Saber as horas de uma fase exigia contar na
                mão ou exportar. A faixa separa (o que a zebra faria) E informa
                (o que a zebra não faz): contagem, horas e janela.

                O número vem de `resumoDoGrupo`, que consome o agregado do
                servidor — NÃO é uma soma nova. Somar aqui seria a quarta
                fórmula viva, e para quem enxerga uma fatia o subtotal mostraria
                menos do que a fase realmente tem. Nada disto é persistido. */}
            {(() => {
              const resumo = resumoDoGrupo(acts as never);
              const horas = formatarHoras(resumo.horas);
              if (resumo.itens === 0) return null;
              /**
               * `N no backlog · Xh` — e RECOLHIDA a faixa continua dizendo.
               *
               * É o único momento em que o resumo é indispensável: com o grupo
               * fechado, ele é a única informação sobre o que há ali dentro.
               * Sumir justo aí seria esconder o que a faixa existe para mostrar.
               *
               * A janela saiu daqui: cada linha já mostra a dela na coluna
               * PREVISTO, e repetir no cabeçalho gasta a largura que o nome da
               * fase precisa.
               */
              return (
                <span
                  className="text-[11px] text-muted-foreground tabular-nums"
                  title="Somado no servidor a partir das subatividades"
                >
                  {textoDaFaixa(resumo.itens, contarNaFila(acts))}
                  {horas && <> · {horas}</>}
                  {isCollapsed && <span className="text-muted-foreground/60"> · recolhido</span>}
                </span>
              );
            })()}
            {/* A BARRA DE PROGRESSO SAIU DA FAIXA.
                O backlog inteiro está no backlog: uma barra que marca 0% em
                todas as fases não distingue nada, e ocupa a largura onde o
                subtotal — que distingue — precisa caber. Progresso é do quadro,
                onde o trabalho anda. */}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1"
              onClick={() => { setQuickAddKey(quickAddPhaseKey); setQuickAddTitle(""); }}
            >
              <Plus className="w-3.5 h-3.5" /> Tarefa
            </Button>
            {/* Só na fase real: "Sem fase" é grupo virtual, não existe no banco
                e portanto não há o que arquivar. */}
            {phaseId && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted data-[state=open]:bg-muted"
                    title="Ações da fase"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem onSelect={() => openPhase(phaseId, phaseTitle)}>
                    <Pencil className="w-3.5 h-3.5 mr-2" /> Abrir fase
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={!isAdmin}
                    className={isAdmin ? "text-destructive focus:text-destructive focus:bg-destructive/10" : ""}
                    title={isAdmin ? undefined : (deleteBlockedReason || "Você não tem permissão para arquivar esta fase")}
                    onSelect={(e) => { e.preventDefault(); if (isAdmin) handleDeletePhase(phaseId, phaseTitle); }}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Arquivar fase
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {!isCollapsed && (
          <div>
            {acts.length === 0 && !quickAddOpen ? (
              <p className="text-xs text-muted-foreground/70 italic px-2 py-3 text-center">
                {hasActiveFilters ? "Nenhuma tarefa visível com os filtros atuais." : "Nenhuma tarefa. Clique em \"+ Tarefa\" para começar."}
              </p>
            ) : (
              acts.map((a) => renderActivityRow(a, 0))
            )}
            {quickAddOpen && (
              // Mesmo grid das linhas de tarefa: o campo cai exatamente sob a
              // coluna "Tarefa". Antes era um flex com margem própria, então o
              // input começava num ponto e as tarefas em outro.
              <div
                className="grid items-center gap-2 border-b px-3 py-1.5 bg-primary/5"
                style={{ gridTemplateColumns: backlogGrid }}
              >
                {/* As duas células do começo da linha — caixa e expandir —
                    vazias aqui. O ícone Plus vive dentro da célula do título,
                    ao lado do campo. */}
                <span />
                <span />
                <div className="flex items-center gap-2 min-w-0">
                  <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                  <Input
                    autoFocus
                    placeholder="Título — Enter cria · Esc fecha"
                    value={quickAddTitle}
                    onChange={(e) => setQuickAddTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleQuickAddSubmit(phaseId, null);
                      if (e.key === "Escape") { setQuickAddKey(null); setQuickAddTitle(""); }
                    }}
                    onBlur={() => { if (!quickAddTitle.trim()) { setQuickAddKey(null); } }}
                    className="h-7 text-[13px]"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Renderiza uma activity-fase (item_type='fase' ou com filhas) como card de fase virtual
  const renderVirtualPhase = (phaseAct: Activity) => {
    const subs = childrenByParent.get(phaseAct.id) || [];
    const isCollapsed = collapsedParents.has(phaseAct.id);
    const quickAddPhaseKey = `parent:${phaseAct.id}`;
    const quickAddOpen = quickAddKey === quickAddPhaseKey;
    const isEditingTitle = editingTitleId === phaseAct.id;
    const { total: progTotal, done: progDone } = groupProgress(subs);
    const progPct = progTotal > 0 ? Math.round((progDone / progTotal) * 100) : 0;
    // A linha do agrupador desenhava Layers fixo, sem perguntar o papel — por
    // isso Fase e Entrega ficavam visualmente idênticas mesmo depois de o
    // modelo já as separar. Aqui ela passa a consultar resolveEapKind.
    const groupKind = resolveEapKind(phaseAct, subs.length > 0);
    const isEntrega = groupKind === "entrega";

    return (
      <div key={phaseAct.id}>
        {/* Mesmo gesto da fase real: clique abre, chevron colapsa. */}
        <div
          className="group flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors"
          onClick={() => {
            if (selectMode) { toggleSelect(phaseAct.id); return; }
            onEditActivity(phaseAct);
          }}
        >
          {/* A CAIXA QUE FALTAVA. Esta linha desenha as Fases e Entregas de
              topo e nunca emitiu checkbox nenhum — nem no modo seleção. Ela é
              uma `activity` de verdade, com id real: todas as ações em lote já
              funcionariam sobre ela, só não havia como marcá-la.
              Caixa e seta LADO A LADO, sempre — ver o comentário do grid. */}
          <Checkbox
            checked={selectMode ? estadoDaCaixa(phaseAct.id) : false}
            onCheckedChange={() => {
              if (!selectMode) {
                setSelectMode(true);
                setSelectedIds(new Set([phaseAct.id, ...descendentesDe(phaseAct.id)]));
                return;
              }
              toggleSelect(phaseAct.id);
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Selecionar ${phaseAct.title}`}
            title="Seleciona esta fase e o que está dentro"
            className={cn("shrink-0", !selectMode && caixaNoHover)}
          />
          <button
            type="button"
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground shrink-0"
            onClick={(e) => { e.stopPropagation(); toggleParent(phaseAct.id); }}
            title={isCollapsed ? "Expandir" : "Recolher"}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {/* Fase = camadas empilhadas; Entrega = pacote, em tom mais discreto.
              A entrega está DENTRO da fase, e o peso visual precisa dizer isso. */}
          <span className={cn(
            "inline-flex items-center justify-center w-5 h-5 rounded shrink-0",
            isEntrega ? "bg-primary/5 text-primary/75" : "bg-primary/10 text-primary",
          )}>
            {isEntrega ? <Package className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
          </span>
          {/* Código EAP: estava gravado e não era exibido nesta linha — só nas
              de atividade. "1.1 Formalização" aparecia como "Formalização", e a
              posição do item na EAP sumia justo onde a hierarquia é lida. */}
          {/* Mesma caixa das linhas comuns (`min-w` + `tabular-nums`): sem
              isso o código da faixa começava num ponto e o das linhas de
              baixo em outro, quebrando a coluna logo no topo do grupo. */}
          {!!(phaseAct as any).wbs_code && (
            <span className="inline-flex items-center justify-end h-[18px] px-1.5 rounded border border-border bg-background/60 text-[10.5px] font-mono tabular-nums text-muted-foreground shrink-0 min-w-[3.6rem]" title="Código EAP">
              {(phaseAct as any).wbs_code}
            </span>
          )}
          <div className="min-w-0">
            {isEditingTitle ? (
              <Input
                autoFocus
                value={editingTitleValue}
                onChange={(e) => setEditingTitleValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => handleSaveTitle(phaseAct.id)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") handleSaveTitle(phaseAct.id);
                  if (e.key === "Escape") setEditingTitleId(null);
                }}
                className="h-7 text-[13px] font-semibold"
              />
            ) : (
              <h4
                className="text-[13px] font-semibold text-foreground cursor-pointer truncate"
                // stopPropagation: a faixa colapsa, o título abre os detalhes.
                onClick={(e) => { e.stopPropagation(); onEditActivity(phaseAct); }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingTitleId(phaseAct.id);
                  setEditingTitleValue(phaseAct.title);
                }}
                title="Clique para editar · duplo-clique para renomear"
              >
                {phaseAct.title}
              </h4>
            )}
          </div>
          {/* gap-2: mesmo alinhamento do cabeçalho de fase real.
              stopPropagation: a faixa colapsa; os botões daqui não devem. */}
          <div className="flex items-center gap-2 ml-auto shrink-0" onClick={(e) => e.stopPropagation()}>
            {/* A PASTILHA "Backlog" E A BARRA SAÍRAM daqui também — esta é a
                faixa da fase VIRTUAL (agrupador sem linha em `phases`), e ela
                tem de dizer a mesma coisa que a faixa da fase real.

                A pastilha existia porque o agrupador acompanhava o conteúdo
                para o quadro e era a única linha que não dizia onde estava.
                Agora ele não vai a coluna nenhuma — é faixa —, então a
                pastilha anunciaria "Backlog" em todas as fases de um backlog.

                No lugar, o subtotal: `N no backlog · Xh`, e "recolhido" quando
                fechada. */}
            {(() => {
              const resumo = resumoDoGrupo(subs as never);
              const horas = formatarHoras(resumo.horas);
              if (resumo.itens === 0) return null;
              return (
                <span
                  className="text-[11px] text-muted-foreground tabular-nums"
                  title="Somado no servidor a partir das subatividades"
                >
                  {textoDaFaixa(resumo.itens, contarNaFila(subs))}
                  {horas && <> · {horas}</>}
                  {isCollapsed && <span className="text-muted-foreground/60"> · recolhido</span>}
                </span>
              );
            })()}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1"
              onClick={() => {
                setQuickAddKey(quickAddPhaseKey);
                setQuickAddTitle("");
                setCollapsedParents((prev) => { const n = new Set(prev); n.delete(phaseAct.id); return n; });
              }}
            >
              <Plus className="w-3.5 h-3.5" /> Tarefa
            </Button>
            {/* "+ Tarefa" continua exposto (é a ação principal da fase); o
                resto vai para o menu, como nas linhas. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted data-[state=open]:bg-muted"
                  title="Ações da fase"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onSelect={() => onEditActivity(phaseAct)}>
                  <Pencil className="w-3.5 h-3.5 mr-2" /> Abrir detalhes
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!isAdmin}
                  className={isAdmin ? "text-destructive focus:text-destructive focus:bg-destructive/10" : ""}
                  title={isAdmin ? undefined : (deleteBlockedReason || "Você não tem permissão para arquivar esta fase")}
                  onSelect={(e) => { e.preventDefault(); if (isAdmin) onDeleteActivity(phaseAct.id); }}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Arquivar fase
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {!isCollapsed && (
          <div>
            {subs.length === 0 && !quickAddOpen ? (
              <p className="text-xs text-muted-foreground/70 italic px-2 py-3 text-center">
                {hasActiveFilters ? "Nenhuma tarefa visível com os filtros atuais." : "Nenhuma tarefa nesta fase. Clique em \"+ Tarefa\" para começar."}
              </p>
            ) : (
              subs.map((s) => renderActivityRow(s, 0))
            )}
            {quickAddOpen && (
              // Mesmo grid das linhas: o campo alinha com a coluna "Tarefa".
              <div
                className="grid items-center gap-2 border-b px-3 py-1.5 bg-primary/5"
                style={{ gridTemplateColumns: backlogGrid }}
              >
                {/* As duas células do começo da linha — caixa e expandir —
                    vazias aqui. O ícone Plus vive dentro da célula do título,
                    ao lado do campo. */}
                <span />
                <span />
                <div className="flex items-center gap-2 min-w-0">
                  <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                  <Input
                    autoFocus
                    placeholder="Título — Enter cria · Esc fecha"
                    value={quickAddTitle}
                    onChange={(e) => setQuickAddTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleQuickAddSubmit(phaseAct.phase_id, phaseAct.id);
                      if (e.key === "Escape") { setQuickAddKey(null); setQuickAddTitle(""); }
                    }}
                    onBlur={() => { if (!quickAddTitle.trim()) { setQuickAddKey(null); } }}
                    className="h-7 text-[13px]"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Contagem por tipo para a legenda de contexto (informação útil, não fantasma).
  const typeCounts = (() => {
    const real = backlogActs;
    let fase = 0, marco = 0, atividade = 0;
    real.forEach((a) => {
      const hasKids = (childrenByParent.get(a.id)?.length || 0) > 0;
      const k = resolveEapKind(a, hasKids);
      if (k === "fase") fase++;
      else if (k === "marco") marco++;
      else atividade++;
    });
    return { total: real.length, fase, marco, atividade };
  })();

  // PRONTIDÃO do backlog: quantas tarefas têm o mínimo para virar trabalho.
  // Sem isto, "718 tarefas" soava como 718 coisas prontas para fazer — quando
  // a maioria é rascunho sem responsável, prazo ou prioridade.
  //
  // Calculado sobre TODAS as tarefas vivas, não sobre `backlogActs`: este já
  // vem recortado pelo filtro, e o resumo passaria a descrever o recorte em vez
  // do backlog — clicar em "Incompletas" mostraria "0 prontas", que é verdade
  // sobre a tela e mentira sobre o projeto.
  /**
   * Os números dos chips — contados sobre as ATIVIDADES do backlog.
   *
   * Agrupador fora: responsável e data dele são rollup das filhas, então
   * "sem responsável" nele não é falta, é derivação. Marco fora de
   * "sem responsável" pelo mesmo motivo — ele não tem esse campo —, mas DENTRO
   * de "sem data", que é a única coisa que se cobra dele.
   *
   * É a mesma separação que faz a faixa do topo dizer "falta prazo em 107 ·
   * falta responsável em 103": 107 inclui os 4 marcos, 103 não.
   */
  const recortes = (() => {
    const comFilho = new Set(activities.filter((a) => a.parent_id).map((a) => a.parent_id as string));
    const folhas = activities.filter((a) => !a.is_trashed && !comFilho.has(a.id));
    return {
      minhas: ehMinha ? folhas.filter((a) => ehMinha(a)).length : 0,
      semResponsavel: folhas.filter((a) => !a.is_milestone && !(a.assigned_to ?? "").trim()).length,
      semData: folhas.filter((a) => !a.end_date).length,
      // Promovidos: o que já saiu da fila. Conta folhas, como os outros
      // recortes — um agrupador no quadro é faixa, não trabalho promovido.
      noQuadro: folhas.filter((a) => {
        const col = allStages.find((s2) => s2.id === a.workflow_stage_id);
        if (!col) return false;
        const cat = parseWorkflowCategory((col as { categoria?: string }).categoria)
          ?? categoryFromLegacyFlags(col as never);
        return cat !== "backlog";
      }).length,
    };
  })();

  const prontidaoResumo = (() => {
    // A MESMA FILA que a lista mostra. Antes contava TODAS as vivas do projeto,
    // e o resultado era um contador que falava de outra coisa: a tela dizia
    // "Todas 16 · Incompletas 16" com a fila VAZIA na frente, porque as 16
    // estavam no quadro, não no backlog. Contador tem de contar o que está à
    // vista — senão vira número sem referente.
    const semLixeira = activities.filter((a) => !a.is_trashed);
    const vivas = mostrarTudo ? semLixeira : soAFila(semLixeira);
    const temFilho = new Set(vivas.filter((a) => a.parent_id).map((a) => a.parent_id as string));
    return resumirProntidao(vivas.map((a) => ({ tarefa: a, temFilhos: temFilho.has(a.id) })));
  })();
  const carencias = principaisCarencias(prontidaoResumo);

  // Quantos recortes estão ativos DENTRO do painel — evita abrir só para
  // descobrir se a lista está inteira. A prontidão não entra: ela tem os
  // segmentos, que já mostram qual está ligado sem precisar de contador.
  const filtrosAtivos =
    (statusFilter !== "all" ? 1 : 0) +
    (priorityFilter !== "all" ? 1 : 0);

  return (
    <div className="space-y-2.5">
      {/* ===== LINHA DE ESTADO — o que está filtrado e o que falta =====
          Antes isto era uma faixa cheia, empilhada sobre a de contagem: duas
          linhas falando da mesma lista, com "12" repetido cinco vezes e um
          segmentado de filtro longe dos outros filtros.

          Agora segue a ordem canônica do Helios (filtros → filtros aplicados →
          dados): o filtro em si mora nos controles abaixo, e AQUI fica só o
          estado. A faixa SOME quando não há filtro ativo nem carência — na
          maior parte do tempo a tela tem uma linha a menos.

          A chip resolve o alerta do Groto sobre segmentado-como-filtro: sem um
          estado explícito de "filtro ativo", o usuário não percebe que está
          vendo dados recortados. Aqui ela diz o que é e o ✕ desfaz. */}
      {/* A LINHA DE PRONTIDÃO SAIU DAQUI.
          A prontidão aparecia TRÊS vezes na mesma tela: as carências num texto
          próprio, o "N / N prontas" com barra à direita, e os números dentro do
          seletor "Todas N / Prontas N / Incompletas N". Foi preciso inventar um
          "(N avaliáveis)" só para explicar por que dois desses totais
          discordavam — remendo sobre a duplicação.
          A carência virou um LINK na linha de contexto, e o chip de filtro
          ativo deixou de ser necessário: os SEGMENTOS abaixo mostram qual
          recorte está ligado, com o número de cada um. */}

      {/* ===== SEGMENTOS + BARRA DE PRONTIDÃO =====
          Os três recortes com SEUS NÚMEROS, visíveis sem clicar. Escondê-los
          num painel obrigava a abrir para responder "quantas estão prontas?",
          que é a pergunta que se faz ao abrir o Backlog.

          A barra abaixo voltou. Eu a tinha removido alegando que duplicava o
          "Progresso: 0/16" do topo da página — mas são medidas DIFERENTES:
          aquela conta CONCLUÍDAS, esta conta PRONTAS PARA COMEÇAR. Tirar foi
          erro meu. Agora ela não repete os segmentos: eles têm os números, ela
          tem a proporção e as carências.

          Some inteira quando tudo está pronto — faixa verde dizendo o óbvio é
          ruído, e "Incompletas 0" não é opção, é lixo visual. */}
      {/* LINHA 1: busca + segmentos + painel. Os três recortes ficam ao lado
          do campo de busca, como na referência — é a primeira coisa que se lê
          ao abrir o Backlog, e responde "quantas estão prontas?" sem clique.
          A busca mora AQUI e não na barra da página porque os segmentos
          dependem da prontidão, que é estado deste componente: separá-los
          deixaria metade da linha num arquivo e metade no outro. */}
      {(acoes || onSearchChange || prontidaoResumo.total > 0) && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* UMA LINHA SÓ: ações, busca, segmentos e painel.
              Estavam em duas — os botões numa faixa da página, o resto noutra
              do componente — e a divisão era acidente de arquitetura, não
              decisão de layout: quem olha a tela vê uma barra de trabalho, não
              dois donos de código.
              A busca vem por prop: recorta `activities` ANTES de chegar aqui, e
              um segundo campo daria duas buscas sobre a mesma lista.
              A linha não depende dos segmentos — com tudo pronto eles somem, e
              busca e ações continuam. */}
          {acoes}
          {onSearchChange ? (
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Buscar na EAP…"
                className="pl-8 h-8 text-[13px]"
              />
            </div>
          ) : (
            <span className="flex-1" />
          )}

          {/* SEGMENTOS — os números na cara, sem clicar. Cada um mostra QUANTOS
              caem nele: é a diferença entre "16 sem responsável" (16 de
              quanto?) e "Incompletas 16" ao lado de "Todas 16".
              "Incompletas 0" não é renderizado: segmento vazio não é opção que
              se escolhe, é ruído. */}
          {/* ── CHIPS DE RECORTE RÁPIDO ─────────────────────────────────────
              `Minhas · Sem responsável · Sem data`, no lugar do segmentado
              `Todas / Prontas / Incompletas`.

              Por que a troca: o segmentado respondia "quantas estão prontas?",
              e essa pergunta já é respondida — melhor — pela faixa de prontidão
              logo abaixo, que diz O QUE falta em vez de só contar. O que faltava
              era o recorte ACIONÁVEL: "me mostre as que não têm responsável,
              para eu atribuir".

              Cada chip LIGA E DESLIGA por conta própria — não são exclusivos
              entre si, porque as perguntas não são: "minhas e sem data" é um
              recorte legítimo. O ativo fica marcado, que é o alerta do Groto
              sobre segmentado-como-filtro: sem estado explícito, ninguém percebe
              que está vendo dados recortados.

              Chip com zero não aparece: "Sem data 0" não é opção que se
              escolhe. Some sozinho quando o problema acaba. */}
          <div className="inline-flex items-center gap-1.5 shrink-0">
            {([
              ehMinha ? { id: "minhas" as const, lab: "Minhas", n: recortes.minhas } : null,
              { id: "sem-resp" as const, lab: "Sem responsável", n: recortes.semResponsavel },
              { id: "sem-data" as const, lab: "Sem data", n: recortes.semData },
              { id: "no-quadro" as const, lab: "No quadro", n: recortes.noQuadro },
            ].filter(Boolean) as { id: RecorteRapido; lab: string; n: number }[])
              .filter((c) => c.n > 0)
              .map((c) => {
                const ativo = recortesAtivos.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => alternarRecorte(c.id)}
                    aria-pressed={ativo}
                    className={cn(
                      "h-8 px-2.5 rounded-md border text-[12.5px] transition-colors whitespace-nowrap",
                      ativo
                        ? "bg-primary text-primary-foreground border-primary font-semibold"
                        : "border-border text-muted-foreground hover:bg-muted/60",
                    )}
                    title={ativo ? "Clique para desligar este recorte" : `Ver só ${c.lab.toLowerCase()}`}
                  >
                    {c.lab} <span className="tabular-nums">{c.n}</span>
                  </button>
                );
              })}
          </div>

          {/* O painel guarda o que NÃO cabe como segmento: Status e Prioridade
              têm cinco e seis valores cada — abertos, viram uma barra inteira.
              O número no botão diz quantos recortes estão ativos sem abrir. */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className={cn(
                  "h-8 gap-1.5 text-[13px] px-2.5 shrink-0",
                  filtrosAtivos > 0 && "border-primary/50 text-primary",
                )}
                title="Status e prioridade"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {filtrosAtivos > 0 && (
                  <span className="min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold inline-flex items-center justify-center tabular-nums">
                    {filtrosAtivos}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[248px] p-3 space-y-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</label>
                <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange?.(v)}>
                  <SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="in_progress">Em andamento</SelectItem>
                    <SelectItem value="completed">Concluída</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Prioridade</label>
                <Select value={priorityFilter} onValueChange={(v) => onPriorityFilterChange?.(v)}>
                  <SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                    <SelectItem value="critica">Crítica</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="baixa">Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {filtrosAtivos > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full h-8 text-[13px] gap-1.5"
                  onClick={() => {
                    onStatusFilterChange?.("all");
                    onPriorityFilterChange?.("all");
                  }}
                >
                  <X className="w-3.5 h-3.5" /> Limpar filtros
                </Button>
              )}
            </PopoverContent>
          </Popover>
        </div>
      )}

      {prontidaoResumo.total > 0 && prontidaoResumo.prontas < prontidaoResumo.total && (
        <div className="flex items-center gap-3 flex-wrap px-0.5 text-[12px] text-muted-foreground">
          <span className="shrink-0">
            <span className="text-foreground font-semibold tabular-nums">{prontidaoResumo.prontas}</span>
            {" "}pronta{prontidaoResumo.prontas === 1 ? "" : "s"} para executar
          </span>
          <span className="flex-1 min-w-[100px] h-[7px] rounded-full overflow-hidden flex border border-border/60">
            {[
              { n: prontidaoResumo.prontas, cls: "bg-success", lab: "prontas" },
              { n: prontidaoResumo.quaseProntas, cls: "bg-warning", lab: "falta 1 campo" },
              { n: prontidaoResumo.incompletas, cls: "bg-destructive", lab: "falta mais de 1" },
            ].map((f) => f.n > 0 && (
              <span
                key={f.lab}
                className={f.cls}
                style={{ width: `${(f.n / prontidaoResumo.total) * 100}%` }}
                title={`${f.n} ${f.lab}`}
              />
            ))}
          </span>
          {carencias.length > 0 && (
            <span className="shrink-0">
              {carencias
                .map((c) => `${PRONTIDAO_LABELS_LONGOS[c.requisito].replace("sem ", "falta ")} em ${c.quantidade}`)
                .join(" · ")}
            </span>
          )}
        </div>
      )}

      {/* Barra de visão: legenda de contexto (esq.) + controles (dir.)
          Aparece também com a lista VAZIA quando o modo é EAP — o segmento
          Lista/EAP mora aqui, e escondê-lo deixaria a pessoa sem caminho de
          volta se um filtro zerasse a lista. Recarregar resolve (a tela abre
          sempre em Lista), mas exigir isso seria dizer que a saída é sair. */}
      {(backlogActs.length > 0 || modo === "eap") && (
        <div className="flex items-center justify-between gap-3 flex-wrap px-0.5">
          {/* Legenda de contexto — total + quebra por tipo */}
          <p className="text-[13px] text-muted-foreground flex items-center gap-2 flex-wrap">
            {/* No modo seleção, separa fases de tarefas: as ações tratam os
                dois de forma diferente (fase entra em arquivar, fica fora de
                status e prazo), e um número único escondia isso. */}
            {selectMode && selectedIds.size > 0 ? (
              <span className="text-foreground font-medium">
                {totalAgrupadoresSelecionados > 0
                  ? `${totalAgrupadoresSelecionados} ${totalAgrupadoresSelecionados === 1 ? "fase" : "fases"} e ${selectedIds.size - totalAgrupadoresSelecionados} ${selectedIds.size - totalAgrupadoresSelecionados === 1 ? "tarefa" : "tarefas"}`
                  : `${selectedIds.size} de ${typeCounts.total} selecionada(s)`}
              </span>
            ) : (
              /* SEM O TOTAL. "16 tarefas · 15 atividades · 1 marco" lia como
                 16 mais 15 mais 1, quando 15 + 1 É o 16 — a palavra "tarefas"
                 fazia dois papéis, o todo e uma categoria irmã das outras. E
                 marco não é tarefa: foi separado da EAP por não ser trabalho,
                 e seguia somado no total do que há para fazer.
                 Cada palavra passa a nomear uma coisa só; a soma se faz de
                 cabeça. */
              <>
                <span className="text-muted-foreground/90">
                  {[
                    typeCounts.fase && `${typeCounts.fase} fase${typeCounts.fase > 1 ? "s" : ""}`,
                    typeCounts.atividade && `${typeCounts.atividade} atividade${typeCounts.atividade > 1 ? "s" : ""}`,
                    typeCounts.marco && `${typeCounts.marco} marco${typeCounts.marco > 1 ? "s" : ""}`,
                  ].filter(Boolean).join(" · ")}
                </span>
                {/* A lista está inteira: o interruptor RECORTA, não expande.
                    Antes era o contrário — a aba abria filtrada e o link servia
                    para revelar o que faltava. Com o Backlog como lista
                    completa, o texto tem de dizer o que o clique ESCONDE. */}
                {mostrarTudo && foraDaFila > 0 && (
                  <button
                    type="button"
                    onClick={() => setMostrarTudo(false)}
                    className="text-muted-foreground/80 hover:text-foreground underline decoration-dotted underline-offset-2 transition-colors"
                    title="Esconder o que já está em andamento e ver só o que não começou"
                  >
                    · ver só o que não começou
                  </button>
                )}
                {!mostrarTudo && (
                  <button
                    type="button"
                    onClick={() => setMostrarTudo(true)}
                    className="text-muted-foreground/80 hover:text-foreground underline decoration-dotted underline-offset-2 transition-colors"
                    title="Voltar a mostrar o projeto inteiro"
                  >
                    · {foraDaFila} em andamento ocultas, ver tudo
                  </button>
                )}
              </>
            )}
            {/* O link de carência saiu daqui: a barra de prontidão acima já
                traz "falta responsável em 16 · prioridade em 16", com as DUAS
                maiores carências em vez de uma, e o segmento "Incompletas" ao
                lado faz o filtro. Manter os dois era dizer a mesma coisa duas
                vezes na mesma tela. */}
          </p>

          {/* Controles de visão */}
          <div className="flex items-center gap-1.5">
            {selectMode && selectedIds.size > 0 && (
              <>
                {/* A caixa de "selecionar todas" SAIU daqui (13/08/2026): era a
                    segunda na tela fazendo a mesma coisa que a do cabeçalho da
                    tabela, a poucos pixels dela. Duas caixas idênticas lado a
                    lado não se distinguem — o usuário perguntou qual era qual.
                    Ficou a do cabeçalho, que está na coluna das caixas das
                    linhas e por isso se lê como "todas desta coluna". */}
                <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => setMoveDialogOpen(true)}>
                  <ArrowRight className="w-3.5 h-3.5" /> Mudar status ({selectedIds.size})
                </Button>
                {/* Mover em lote: o diálogo já valida o conjunto inteiro de uma
                    vez (o destino não pode estar dentro de NENHUM selecionado). */}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!isAdmin}
                  title={isAdmin ? undefined : "Você não tem permissão para reorganizar a EAP deste projeto"}
                  className="h-7 text-xs gap-1.5"
                  onClick={() => { setMoveIntoIds([...selectedIds]); setMoveIntoCurrentParent(null); }}
                >
                  <IndentIncrease className="w-3.5 h-3.5" /> Mover para dentro de…
                </Button>

                {/* PREENCHER EM LOTE — o que faltava para o filtro
                    "Incompletas" servir de fila de trabalho. Medido: faltam
                    responsável em 332 tarefas, prazo em 465 e prioridade em
                    609. Corrigir uma por uma não acontece; é por isso que elas
                    estão assim. Cada botão abre um seletor e aplica ao conjunto
                    inteiro de uma vez. */}
                <Popover open={bulkField === "assigned_to"} onOpenChange={(o) => setBulkField(o ? "assigned_to" : null)}>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
                      <User className="w-3.5 h-3.5" /> Responsável
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[260px] p-0" align="end">
                    <div className="max-h-[280px] overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => aplicarEmLote({ assigned_to: null }, "Responsável removido")}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted border-b text-muted-foreground"
                      >
                        Sem responsável
                      </button>
                      {profiles.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => aplicarEmLote({ assigned_to: p.full_name }, `Responsável: ${p.full_name}`)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
                        >
                          <Avatar className="h-5 w-5 shrink-0">
                            {p.avatar_url ? <AvatarImage src={p.avatar_url} alt={p.full_name || ""} /> : null}
                            <AvatarFallback className="text-[8px]">{getAvatarInitials(p.full_name)}</AvatarFallback>
                          </Avatar>
                          <span className="truncate">{p.full_name}</span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                <Popover open={bulkField === "end_date"} onOpenChange={(o) => setBulkField(o ? "end_date" : null)}>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
                      <CalendarIcon className="w-3.5 h-3.5" /> Prazo
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <CalendarPicker
                      mode="single"
                      locale={ptBR}
                      onSelect={(d) => {
                        if (!d) return;
                        // Fuso LOCAL: toISOString à noite em UTC-3 já é o dia
                        // seguinte, e o prazo sairia um dia à frente.
                        const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                        aplicarEmLote({ end_date: ymd }, `Prazo: ${d.toLocaleDateString("pt-BR")}`);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => aplicarEmLote({ end_date: null }, "Prazo removido")}
                      className="w-full px-3 py-2 text-xs text-muted-foreground hover:bg-muted border-t text-left"
                    >
                      Remover prazo
                    </button>
                  </PopoverContent>
                </Popover>

                {/* LIGAR EM SEQUÊNCIA — cria a cadeia de dependências de uma
                    vez. Medido: 41 dependências para 825 atividades, e é por
                    isso que o caminho crítico não diz nada. Criar uma hoje
                    custa 4 passos (abrir a tarefa, achar a aba, buscar a outra,
                    escolher o tipo); sequenciar uma fase de 10 leva ~10 min.
                    Aqui é um clique para toda a cadeia. */}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedIds.size < 2 || sequenciando}
                  title={
                    selectedIds.size < 2
                      ? "Selecione ao menos duas tarefas, na ordem em que devem acontecer"
                      : "Cada tarefa passa a depender da anterior, na ordem da lista"
                  }
                  className="h-7 text-xs gap-1.5"
                  onClick={ligarEmSequencia}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  {sequenciando ? "Ligando…" : "Ligar em sequência"}
                </Button>

                <Popover open={bulkField === "priority"} onOpenChange={(o) => setBulkField(o ? "priority" : null)}>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5">
                      <Flag className="w-3.5 h-3.5" /> Prioridade
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-1" align="end">
                    {/* Grava gravity/urgency/tendency, não o texto: é o GUT que
                        marca a prioridade como definida (ver lib/prontidao). */}
                    {GUT_LOTE.map((g) => (
                      <button
                        key={g.label}
                        type="button"
                        onClick={() => aplicarEmLote(
                          { gravity: g.g, urgency: g.u, tendency: g.t, priority: g.priority },
                          `Prioridade: ${g.label}`,
                        )}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted"
                      >
                        <span className={cn("w-2 h-2 rounded-full shrink-0", g.dot)} />
                        {g.label}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>

                {/* ARQUIVAR EM LOTE — estava faltando.
                    Ao remover "Arquivar todas as fases/atividades" do menu, eu
                    disse que a seleção em lote resolvia. Não resolvia: dava
                    para selecionar e mudar status, responsável, prazo e
                    prioridade, mas NÃO para arquivar. Tirei a saída ruim sem
                    conferir se a boa existia. */}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                  // `isAdmin` MANDA, não `deleteBlockedReason`. A página envia
                  // esse texto SEMPRE — o último ramo é um padrão ("você não
                  // tem permissão") que chega mesmo com permissão. Ele existe
                  // para EXPLICAR o bloqueio, não para causá-lo: os outros
                  // botões de arquivar do arquivo já testam `isAdmin` e só usam
                  // o texto no tooltip. O meu testava o texto, então o botão
                  // nascia desabilitado para todo mundo.
                  disabled={!isAdmin}
                  title={isAdmin ? "Arquivar as selecionadas" : (deleteBlockedReason || "Você não tem permissão para arquivar")}
                  onClick={async () => {
                    const n = selectedIds.size;
                    const g = totalAgrupadoresSelecionados;
                    const ok = await appConfirm({
                      title: `Arquivar ${n} ${n === 1 ? "item" : "itens"}?`,
                      // Diz que a fase leva o conteúdo junto: arquivar um
                      // agrupador sozinho deixaria os filhos órfãos, e a
                      // seleção em cascata já os incluiu — a confirmação
                      // precisa mostrar isso antes, não depois.
                      //
                      // E avisa da fase que ESVAZIA: ela é o cabeçalho azul da
                      // tabela `phases`, não entra em `selectedIds` e por isso
                      // não aparece na contagem — mas some da tela junto.
                      description: [
                        g > 0
                          ? `Inclui ${g} ${g === 1 ? "fase/entrega" : "fases/entregas"} e o que está dentro.`
                          : null,
                        fasesQueEsvaziam > 0
                          ? `${fasesQueEsvaziam} ${fasesQueEsvaziam === 1 ? "fase fica" : "fases ficam"} sem nenhuma tarefa e ${fasesQueEsvaziam === 1 ? "vai" : "vão"} junto.`
                          : null,
                        "Tudo pode ser restaurado na Lixeira, aqui embaixo.",
                      ].filter(Boolean).join(" "),
                      confirmText: "Arquivar",
                      destructive: true,
                    });
                    if (!ok) return;
                    await aplicarEmLote(
                      { is_trashed: true, trashed_at: new Date().toISOString() },
                      `${n} ${n === 1 ? "item arquivado" : "itens arquivados"}`,
                      true, // estrutural: a fase vai junto com o conteúdo
                    );
                    setSelectedIds(new Set());
                    setSelectMode(false);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Arquivar
                </Button>
              </>
            )}
            {/* O painel "Filtros" SUBIU para a linha da busca e dos segmentos:
                filtrar é uma coisa só e mora num lugar só. Aqui ficam os
                controles de VISÃO — agrupar, expandir, recolher —, que não
                recortam a lista, apenas reorganizam o que sobrou dela. */}

            {/* LISTA ↔ EAP. A lista responde "o que falta fazer"; a EAP
                responde "como o projeto se decompõe". São perguntas
                diferentes sobre os mesmos itens, e é por isso que dividem
                busca e filtros em vez de virarem telas separadas. */}
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              {([
                { id: "lista" as const, label: "Lista", Icon: Rows3 },
                { id: "eap" as const, label: "EAP", Icon: Network },
              ]).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => changeModo(id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] transition-colors",
                    modo === id
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* CRIAR FASE. Ficou sem gesto nenhum desde 31/07 — a única forma
                de ter fase era importar uma EAP. Fica ao lado do modo de
                exibição, não junto de "Nova Atividade": aquele grupo vem da
                página e trata do item comum; este é estrutura da EAP.
                Só no modo Fase — nas outras raias não há fase a criar. */}
            {/* SÓ AS MINHAS — mesmo gesto do `onlyMine` no Kanban. Aparece só
                para quem edita um subconjunto: quem edita tudo não tem o que
                distinguir. */}
            {ehMinha && (
              <Button
                type="button"
                variant={soMinhas ? "default" : "outline"}
                size="sm"
                className="h-7 gap-1.5 text-[13px]"
                onClick={() => setSoMinhas((v) => !v)}
                aria-pressed={soMinhas}
                title={soMinhas
                  ? "Mostrando só as atividades que você pode editar"
                  : "Ver só as atividades em que você é responsável, participante ou criador"}
              >
                <UserCheck className="w-3.5 h-3.5" /> Minhas
              </Button>
            )}

            {groupBy === "phase" && isAdmin && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-[13px]"
                onClick={criarFase}
                title="Cria uma fase de nível 2, já com o próximo código EAP livre"
              >
                <Layers className="w-3.5 h-3.5" /> Fase
              </Button>
            )}

            {/* Agrupar em raias — mesmo modelo do Kanban. Só faz sentido na
                lista: a EAP é sempre a árvore da decomposição. */}
            {modo === "lista" && (
            <Select value={groupBy} onValueChange={(v) => changeGroupBy(v as GroupBy)}>
              <SelectTrigger className="h-7 w-[136px] text-[13px] gap-1.5">
                <Rows3 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="phase">Fase</SelectItem>
                <SelectItem value="assignee">Responsável</SelectItem>
                <SelectItem value="priority">Prioridade</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="type">Tipo</SelectItem>
              </SelectContent>
            </Select>
            )}
            {modo === "lista" && (
            <>
            <Button
              size="icon" variant="ghost"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => {
                if (groupBy === "phase") { setCollapsedPhases(new Set()); setCollapsedParents(new Set()); }
                else setCollapsedLanes(new Set());
              }}
              title="Expandir tudo"
            >
              <ChevronsUpDown className="w-4 h-4" />
            </Button>
            <Button
              size="icon" variant="ghost"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => {
                if (groupBy === "phase") {
                  const allPhaseIds = phases.map(p => p.id);
                  const parentIds = backlogActs.filter(a => (childrenByParent.get(a.id) || []).length > 0).map(a => a.id);
                  setCollapsedPhases(new Set(allPhaseIds));
                  setCollapsedParents(new Set(parentIds));
                } else {
                  setCollapsedLanes(new Set(lanes.map((l) => l.id)));
                }
              }}
              title="Recolher tudo"
            >
              <ChevronsDownUp className="w-4 h-4" />
            </Button>
            </>
            )}
            {/* O menu "⋯" saiu: tinha um item só — "Selecionar em lote" —, que
                virou a caixa ao lado de "Tarefa" no cabeçalho da tabela. Um
                dropdown para uma ação escondia justamente o que precisava ser
                sugestivo. */}
          </div>
        </div>
      )}

      {/* EAP VISUAL — os mesmos `backlogActs`, desenhados como árvore.
          Recebe a lista JÁ FILTRADA de propósito: busca e filtros continuam
          valendo, e recortar o backlog recorta a árvore junto. */}
      {modo === "eap" && (
        <EapVisual
          projectTitle={projectTitle || "Projeto"}
          items={backlogActs.map((a) => ({
            id: a.id,
            title: a.title,
            wbs_code: (a as { wbs_code?: string | null }).wbs_code ?? null,
            parent_id: a.parent_id ?? null,
            is_milestone: a.is_milestone ?? null,
            item_type: a.item_type ?? null,
            // O progresso do agrupador é a média dos filhos — a mesma conta que
            // a lista mostra, vinda da fonte única em activityProgress.
            /**
             * Percentual do agrupador = proporção de filhos concluídos.
             *
             * É a mesma regra que `activityProgress` aplica a agrupador ("não
             * é trabalho, é caixa: vale a média dos filhos"), mas calculada a
             * partir do `status`, que o Backlog já tem em mãos — sem depender
             * das colunas do quadro, que esta tela não carrega.
             *
             * Folha não recebe barra: um número em cada caixa polui a árvore
             * sem dizer nada que o próprio quadro não diga melhor.
             */
            progresso: (() => {
              const filhos = childrenByParent.get(a.id) ?? [];
              if (filhos.length === 0) return null;
              const vivos = filhos.filter((f) => !f.is_milestone);
              if (vivos.length === 0) return null;
              const feitos = vivos.filter((f) => f.status === "completed").length;
              return Math.round((feitos / vivos.length) * 100);
            })(),
          }))}
          onSelect={(id) => {
            const alvo = backlogActs.find((x) => x.id === id);
            if (alvo) onEditActivity?.(alvo as never);
          }}
        />
      )}

      {/* Phase groups — tabela única com cabeçalho de colunas no topo */}
      {/* Sem rolagem lateral: as colunas são elásticas (minmax em BACKLOG_COLS)
          e encolhem até caber. Antes as larguras eram fixas e somavam ~760px,
          então a coluna de AÇÕES — a última — saía da tela e o botão de
          arquivar ficava inalcançável. */}
      <div ref={tableRef} className={cn("rounded-lg border border-border bg-card overflow-hidden", modo === "eap" && "hidden")}>
        {/* Sem botão de criar fase aqui: a entrada do backlog é "Nova
            Atividade" (ou importar a EAP, que já cria as fases). Fase avulsa
            criada antes de existir qualquer tarefa só produzia um agrupador
            vazio que o usuário depois não sabia como remover. */}
        {phases.length === 0 && backlogActs.length === 0 && prontidaoFilter === "all" && (
          <div className="p-8 text-center">
            <Inbox className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">Nenhuma atividade ainda</p>
            <p className="text-muted-foreground/60 text-xs mt-1">
              Use <span className="font-medium">Nova Atividade</span> para começar, ou <span className="font-medium">Importar EAP</span> para trazer a estrutura pronta.
            </p>
          </div>
        )}

        {/* Vazio POR CAUSA DO FILTRO — mensagem diferente da de projeto vazio.
            "Nenhuma atividade ainda" num projeto com 718 tarefas seria mentira,
            e esconderia que basta desligar o recorte. */}
        {backlogActs.length === 0 && prontidaoFilter !== "all" && (
          <div className="p-8 text-center">
            <Inbox className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">
              {prontidaoFilter === "ready"
                ? "Nenhuma tarefa pronta para executar"
                : "Nenhuma tarefa incompleta"}
            </p>
            <p className="text-muted-foreground/60 text-xs mt-1">
              {prontidaoFilter === "ready"
                ? "Complete responsável, prazo, prioridade e estimativa para uma tarefa aparecer aqui."
                : "Todas as tarefas têm o mínimo preenchido."}
            </p>
            <Button size="sm" variant="outline" className="h-7 text-xs mt-3" onClick={() => setProntidaoFilter("all")}>
              Ver todas
            </Button>
          </div>
        )}

        {backlogActs.length > 0 && <ColumnHeader />}

        {/* Modo raia (Agrupar por ≠ Fase): grupos planos por dimensão */}
        {groupBy !== "phase" && lanes.map((lane) => {
          const isCollapsed = collapsedLanes.has(lane.id);
          // Modo raia: itens já são planos — conta direto, sem recursão.
          const progTotal = lane.items.length;
          const progDone = lane.items.filter((a) => a.status === "completed").length;
          const progPct = progTotal > 0 ? Math.round((progDone / progTotal) * 100) : 0;
          return (
            <div key={lane.id}>
              {/* Faixa inteira colapsa, igual às fases. */}
              <div
                className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors"
                onClick={() => toggleLane(lane.id)}
              >
                <span className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground shrink-0">
                  {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
                <h4 className="text-[13px] font-semibold text-foreground truncate">{lane.label}</h4>
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{lane.items.length}</span>
                {/* A RAIA segue a mesma regra da faixa de fase: subtotal, não
                    barra. Agrupar por responsável ou por prioridade não muda a
                    natureza do backlog — continua sendo a fila, e uma barra em
                    0% em todas as raias não distingue nada. */}
                <div className="flex items-center gap-3 ml-auto" onClick={(e) => e.stopPropagation()}>
                  {(() => {
                    const resumo = resumoDoGrupo(lane.items as never);
                    const horas = formatarHoras(resumo.horas);
                    if (resumo.itens === 0) return null;
                    return (
                      <span
                        className="text-[11px] text-muted-foreground tabular-nums"
                        title="Somado no servidor a partir das subatividades"
                      >
                        {textoDaFaixa(resumo.itens, contarNaFila(lane.items))}
                        {horas && <> · {horas}</>}
                        {isCollapsed && <span className="text-muted-foreground/60"> · recolhido</span>}
                      </span>
                    );
                  })()}
                </div>
              </div>
              {!isCollapsed && (
                <div>
                  {lane.items.map((a) => renderActivityRow(a, 0, true))}
                </div>
              )}
            </div>
          );
        })}
        {groupBy !== "phase" && lanes.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {hasActiveFilters ? "Nenhuma tarefa visível com os filtros atuais." : "Nenhuma tarefa para agrupar por esta dimensão."}
          </div>
        )}

        {/* Modo Fase (padrão): árvore EAP completa.
            A FAIXA CEDE O LUGAR À ATIVIDADE-FASE. Desde que as fases viraram
            `activities` (14/08/2026), cada uma existe nas duas tabelas: a faixa
            vinha de `phases` e o card de `activities`, com o mesmo nome, um
            dentro do outro — um nível a mais que não significa nada.
            A faixa só é desenhada para fase que AINDA não migrou; quando a
            atividade-fase existe, ela manda, e traz junto o que a faixa nunca
            teve: coluna, percentual e a seleção em lote. */}
        {groupBy === "phase" && phases
          /**
           * A FAIXA SÓ CEDE O LUGAR PARA A PRÓPRIA FASE, não para o que está
           * dentro dela.
           *
           * O teste era `item_type === 'fase' && !parent_id` — qualquer
           * agrupador de topo dentro da fase satisfazia isso, e a faixa
           * desaparecia. Na Revitalização Tasy a fase "1.2 2ª. Fase - Cadastros
           * e funções essenciais" sumiu porque três ENTREGAS suas (1.2.2, 1.2.3
           * e 1.2.4) são agrupadores sem pai. A pré-visualização da importação
           * mostrava a fase 1.2; a lista, não.
           *
           * O que caracteriza a atividade-fase que substitui a faixa é o
           * CÓDIGO no nível da fase (1.1, 1.2 — `eapIsFaseLevel`), não o fato
           * de agrupar. Uma entrega tem código mais fundo e continua sendo
           * desenhada DENTRO da faixa, que é onde ela pertence.
           *
           * Sem código não dá para decidir pelo nível; aí vale o teste antigo,
           * que é o comportamento das bases sem numeração.
           */
          .filter((p) => !backlogActs.some((a) => {
            if (a.item_type !== "fase" || a.phase_id !== p.id || a.parent_id) return false;
            const nivel = eapLevel((a as { wbs_code?: string | null }).wbs_code);
            return nivel === null || eapIsFaseLevel(nivel);
          }))
          /**
           * COM FILTRO ATIVO, A FASE VAZIA NÃO APARECE.
           *
           * `phases` vem por prop, direto da página, e NÃO passa pelo filtro —
           * só o conteúdo passa. Buscando "Cadastros de transações", a lista
           * achava 1 item e desenhava as 4 fases: uma com o resultado e três
           * dizendo "Nenhuma tarefa visível com os filtros atuais".
           *
           * Três faixas anunciando o próprio vazio é ruído — quem buscou quer
           * o que casou, não o índice do projeto inteiro.
           *
           * SEM filtro a fase vazia CONTINUA visível: ali ela é a estrutura da
           * EAP, e o "+ Tarefa" dela é o caminho para preenchê-la. Some só
           * enquanto há um recorte, e volta quando ele sai.
           */
          .filter((p) => {
            if (!hasActiveFilters) return true;
            const dentro = topLevelByPhase.get(p.id) || [];
            return dentro.length > 0 || virtualPhaseActs.some((v) => v.phase_id === p.id);
          })
          .map((p) => renderPhaseGroup(p.id, p.title))}

        {/* Atividades-fase (item_type='fase') em qualquer nível top-level viram cards de fase virtuais */}
        {groupBy === "phase" && virtualPhaseActs.map((vp) => renderVirtualPhase(vp))}

        {/* "Sem fase" só aparece quando REALMENTE tem tarefa solta: um grupo
            vazio permanente é ruído, ainda mais num backlog organizado por fases.
            Ele existia sempre porque era o único "+ Tarefa" para criar item sem
            fase — mas isso já é coberto pelo "Nova Atividade" no topo, que
            cria no nível principal. */}
        {groupBy === "phase" && (topLevelByPhase.get("none") || []).length > 0 &&
          renderPhaseGroup(null, "Sem fase")}
      </div>

      {/* ── Decisão 7 — O TOTAL DO PROJETO, FIXO NO RODAPÉ ──────────────────
          "Planejar é somar", e até aqui saber o total exigia exportar. Fica
          FIXO (sticky) porque o número que importa não pode depender de rolar
          até o fim de 700 linhas.

          Consome `totalDoProjeto`, que lê o agregado do servidor — não é uma
          soma nova, e nada disto é persistido. Some quando não há o que somar:
          um rodapé com "0h · R$ 0" é ruído. */}
      {(() => {
        const raizes = [
          ...(topLevelByPhase.get("none") || []),
          ...phases.flatMap((p) => topLevelByPhase.get(p.id) || []),
          ...virtualPhaseActs,
        ];
        if (raizes.length === 0) return null;
        const total = totalDoProjeto(raizes as never);
        const horas = formatarHoras(total.horas);
        const custo = formatarCusto(total.custo);

        /**
         * O RODAPÉ ACOMPANHA O FILTRO.
         *
         * `raizes` vem de `topLevelByPhase`, que já é a lista RECORTADA — então
         * ligar um chip muda o topo e o rodapé juntos, sem código extra. É a
         * propriedade que o desenho pede, e ela sai de graça por o rodapé
         * consumir a mesma fonte que a tabela.
         *
         * A CONTAGEM E OS AGREGADOS VÊM DE FONTES DIFERENTES, de propósito
         * (corrigido em 27/08/2026).
         *
         * Era `total.itens` para os dois, e o rótulo dizia "Total do projeto"
         * enquanto o número contava só as RAÍZES — "6 no backlog" num projeto
         * com 141 itens. Quem lia via um total que não era total.
         *
         * Mas somar horas sobre a árvore inteira DUPLICARIA: `derived_hours`
         * do pai já contém as das filhas. As duas coisas não saem da mesma
         * lista, e é por isso que agora são duas:
         *
         *   contagem  → toda a lista visível (`itensVisiveis`)
         *   horas/custo → só as raízes, via `derived_*` do servidor
         *
         * O rótulo de cada número diz de onde ele vem, no `title`.
         *
         * Não some mais quando não há horas: com filtro ligado e zero horas, um
         * rodapé ausente parece tela quebrada. Some só quando não há nada.
         */
        /**
         * Todos os itens à vista, não só as raízes — e sem contar agrupador:
         * faixa não é trabalho, e somá-la ao número faria a mesma inflação que
         * o Kanban evita ao não desenhá-la como cartão.
         */
        const folhasVisiveis = (() => {
          const comFilho = new Set(
            activities.filter((a) => a.parent_id).map((a) => a.parent_id as string),
          );
          const vivas = activities.filter((a) => !a.is_trashed);
          const naLista = mostrarTudo ? vivas : soAFila(vivas);
          return naLista.filter((a) => !comFilho.has(a.id));
        })();

        const recorteLigado = recortesAtivos.size > 0 || prontidaoFilter !== "all";
        return (
          <div className="sticky bottom-0 z-10 flex items-center gap-4 px-3 py-2 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {recorteLigado ? "Total do recorte" : "Total do projeto"}
            </span>
            <span className="ml-auto flex items-center gap-4 text-[12px] tabular-nums text-foreground/80">
              <span title="Itens de trabalho na lista atual (agrupadores não contam: faixa não é trabalho)">
                {/* Os dois números saem da MESMA lista: contar o total numa e
                    a fila noutra faria "4 de 6" com 6 que não é o 6 exibido. */}
                {textoDaFaixa(folhasVisiveis.length, contarNaFila(folhasVisiveis))}
              </span>
              {horas && <span title="Somado no servidor a partir das subatividades">{horas}</span>}
              {custo && <span title="Somado no servidor a partir das subatividades">{custo}</span>}
            </span>
          </div>
        );
      })()}

      {/* Trash Section */}
      <div className="border-t pt-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => { setShowTrash(!showTrash); if (!showTrash) fetchTrashedActivities(); }}
        >
          <Trash2 className="w-4 h-4" />
          Lixeira
          {showTrash ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </Button>

        {showTrash && (
          <div className="mt-3 space-y-2">
            {trashedActivities.length === 0 ? (
              <Card className="p-6 text-center">
                <Trash2 className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-sm">Lixeira vazia</p>
              </Card>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">{trashedActivities.length} atividade(s) na lixeira</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleRestoreAll}>
                      <RotateCcw className="w-3.5 h-3.5" /> Restaurar todas
                    </Button>
                    {isAdmin && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-destructive hover:bg-destructive/10" onClick={handleEmptyTrash}>
                        <Trash2 className="w-3.5 h-3.5" /> Esvaziar lixeira
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid gap-2">
                  {trashedActivities.map((activity: any) => {
                    const phase = phases.find((p) => p.id === activity.phase_id);
                    const trashedDate = activity.trashed_at
                      ? new Date(activity.trashed_at).toLocaleDateString("pt-BR") : "";
                    return (
                      <div key={activity.id} className="flex items-center gap-3 bg-muted/50 border border-dashed rounded-lg px-4 py-3 group">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-muted-foreground line-through">{activity.title}</p>
                          {activity.description && (
                            <p className="text-xs text-muted-foreground/60 line-clamp-1 mt-0.5">{activity.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {phase && <Badge variant="outline" className="text-[10px] opacity-60">{phase.title}</Badge>}
                          {trashedDate && (
                            <span className="text-[10px] text-muted-foreground/60">Excluída em {trashedDate}</span>
                          )}
                          <Button size="sm" variant="outline" className="h-6 text-xs gap-1 px-2" onClick={() => handleRestore(activity.id)}>
                            <RotateCcw className="w-3 h-3" /> Restaurar
                          </Button>
                          {isAdmin && (
                            <Button
                              size="icon" variant="ghost"
                              className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => setPermanentDeleteId(activity.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Move Dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="sm:max-w-2xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>
              Mover {selectedIds.size} {selectedIds.size === 1 ? "item" : "itens"}
            </DialogTitle>
            {/* "Tarefa(s)" escondia que fase e entrega vão junto — e é
                justamente o que faltava antes: elas ficavam para trás. */}
            {totalAgrupadoresSelecionados > 0 && (
              <p className="text-[13px] text-muted-foreground">
                Inclui {totalAgrupadoresSelecionados}{" "}
                {totalAgrupadoresSelecionados === 1 ? "fase/entrega" : "fases/entregas"}.
                {" "}O percentual delas continua sendo a média do que está dentro.
              </p>
            )}
          </DialogHeader>

          {/* ── PROMOVER ≠ ASSUMIR: a pergunta que não pode ser automática ──
              Promover é decisão de ESCOPO — o que entra no quadro. Levar as
              subatividades junto é outra decisão, e é de quem promove.

              Era automática das duas formas erradas, em momentos diferentes:
              a seleção puxava a subárvore inteira sem pedir, e o arrasto do
              quadro cascateava para os descendentes. As duas somadas
              produziam o vaivém (ver lib/quadroDeExecucao).

              Agora: PERGUNTADA, desmarcada por padrão, e o número que ela
              mostra conta só o que VIRARIA cartão — marco fora, agrupador
              intermediário contado à parte. Dizer "levar 20 junto" para um
              pacote com 12 atividades e 8 caixas seria número inventado. */}
          {subatividadesDaSelecao.atividades > 0 && (
            <label className="flex items-start gap-2.5 px-3 py-2.5 rounded-md border bg-muted/30 cursor-pointer">
              <Checkbox
                checked={levarSubatividades}
                onCheckedChange={(v) => setLevarSubatividades(v === true)}
                className="mt-0.5 shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-foreground">
                  Levar as subatividades junto
                </span>
                <span className="block text-[12px] text-muted-foreground leading-snug">
                  {subatividadesDaSelecao.atividades}{" "}
                  {subatividadesDaSelecao.atividades === 1 ? "atividade" : "atividades"} dentro
                  {subatividadesDaSelecao.agrupadores > 0 && (
                    <>, em {subatividadesDaSelecao.agrupadores}{" "}
                    {subatividadesDaSelecao.agrupadores === 1 ? "caixa" : "caixas"}</>
                  )}
                  {". "}
                  {levarSubatividades
                    ? "Vão para a mesma coluna."
                    : "Ficam onde estão — só o que você marcou é movido."}
                </span>
              </span>
            </label>
          )}
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Novo status *</Label>
              {/* COLUNA OCULTA SE ANUNCIA. A lista era sete nomes soltos:
                  mover para "Backlog" fazia a tarefa sumir do quadro, e nada
                  avisava. Duas seções resolvem sem tirar opção — esconder as
                  ocultas seria pior, porque mandar algo para fora do quadro é
                  uso legítimo. O dado é o `is_visible`, o mesmo interruptor
                  "No quadro" da tela de colunas; aqui ele só passa a ser lido. */}
              <Select value={targetStageId} onValueChange={setTargetStageId}>
                <SelectTrigger><SelectValue placeholder="Selecione o status" /></SelectTrigger>
                <SelectContent>
                  {(() => {
                    const noQuadro = allStages.filter((s) => (s as { is_visible?: boolean }).is_visible !== false);
                    const fora = allStages.filter((s) => (s as { is_visible?: boolean }).is_visible === false);
                    return (
                      <>
                        {noQuadro.map((s) => (<SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>))}
                        {fora.length > 0 && (
                          <>
                            <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Fora do quadro
                            </div>
                            {fora.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                <span className="inline-flex items-center gap-2">
                                  <EyeOff className="w-3 h-3 shrink-0 text-muted-foreground" />
                                  {s.title}
                                </span>
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </>
                    );
                  })()}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Responsável (opcional)</Label>
              {/* Era um `Select` com dezenas de nomes em ordem alfabética, sem
                  busca: "Antonio Carlos" e "Antonio Ventura" apareciam
                  seguidos e nada os distinguia. O `PersonCombobox` — o mesmo da
                  edição da atividade e das células do Cronograma — busca por
                  nome, setor E função, e mostra os três. */}
              <PersonCombobox
                people={profiles.map((p) => ({
                  id: p.id,
                  full_name: p.full_name || p.email || "Sem nome",
                  sector: (p as { sector?: string | null }).sector ?? null,
                  role_title: (p as { role_title?: string | null }).role_title ?? null,
                  avatar_url: resolveAvatarFromLookup(p.id, p.full_name || p.email || p.id, profileAvatarMap) ?? null,
                }))}
                value={profiles.find((p) => (p.full_name || p.id) === assignee)?.id ?? null}
                placeholder="Selecione o responsável"
                onSelect={(p) => setAssignee(p.full_name)}
                onClear={() => setAssignee("__none__")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleMoveSelected} disabled={!targetStageId || isMoving}>
              {isMoving ? "Movendo..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edição da fase — o resumo compara o planejado da fase com o que as
          atividades dela de fato somam. */}
      <EditPhaseDialog
        phase={editingPhase}
        open={!!editingPhase}
        onOpenChange={(o) => { if (!o) setEditingPhase(null); }}
        onSaved={onDataChanged}
        canEdit={isAdmin}
        resumo={(() => {
          if (!editingPhase) return undefined;
          const acts = (topLevelByPhase.get(editingPhase.id) || []);
          const todas: Activity[] = [];
          const coletar = (list: Activity[]) => list.forEach((a) => {
            todas.push(a);
            coletar(childrenByParent.get(a.id) || []);
          });
          coletar(acts);
          const datas = todas.flatMap((a) => [a.start_date, a.end_date]).filter(Boolean) as string[];
          return {
            total: todas.length,
            concluidas: todas.filter((a) => a.status === "completed").length,
            horas: todas.reduce((s, a) => s + (Number((a as any).hours) || 0), 0),
            inicio: datas.length ? datas.slice().sort()[0] : null,
            fim: datas.length ? datas.slice().sort().slice(-1)[0] : null,
          };
        })()}
      />

      {/* Mover para dentro de outro item. A validação (ciclo, self, marco,
          profundidade) mora em lib/eapModel — a mesma que o Kanban e a edição
          usam, para as três telas recusarem exatamente as mesmas coisas. */}
      {moveIntoIds && (
        <LinkParentDialog
          open={!!moveIntoIds}
          onOpenChange={(o) => { if (!o) { setMoveIntoIds(null); setMoveIntoCurrentParent(null); } }}
          projectId={projectId}
          activityIds={moveIntoIds}
          currentParentId={moveIntoCurrentParent}
          onLinked={onDataChanged}
        />
      )}

      {/* Permanent Delete Confirmation */}
      <AlertDialog open={!!permanentDeleteId} onOpenChange={(open) => !open && setPermanentDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. A atividade será excluída permanentemente e não poderá ser recuperada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handlePermanentDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};