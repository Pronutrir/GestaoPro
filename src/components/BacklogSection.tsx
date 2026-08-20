'use client';
import { useState, useEffect, useRef, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PersonCombobox } from "@/components/PersonCombobox";
import {
  CheckCircle2, Circle, Trash2, Inbox, ArrowRight, RotateCcw,
  ChevronDown, ChevronUp, ChevronRight, Plus, Layers, FolderOpen,
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
import { eapIsFaseLevel, eapLevel, resolveEapKind, type EapKind } from "@/lib/eapModel";
import { EapVisual } from "@/components/backlog/EapVisual";
import { parseWorkflowCategory, categoryFromLegacyFlags } from "@/lib/workflowCategory";
import {
  avaliarProntidao, resumirProntidao, principaisCarencias,
  PRONTIDAO_LABELS, PRONTIDAO_LABELS_LONGOS,
} from "@/lib/prontidao";
import { LinkParentDialog } from "@/components/LinkParentDialog";
import { mutateInChunks } from "@/lib/chunkedIn";
import { formatarDataBR, estaAtrasado } from "@/lib/dataLocal";
import { GUT_META, normalizeGut, type GutLevel } from "@/lib/gutPriority";

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
}

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
  onDataChanged, isAdmin = false, deleteBlockedReason, hasActiveFilters,
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
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
  const BACKLOG_COLS: { id: string; label: string; width: string; align?: "center" | "left" }[] = [
    { id: "priority", label: "Prioridade", width: "minmax(80px,108px)", align: "left" },
    { id: "status", label: "Status", width: "minmax(88px,124px)", align: "left" },
    { id: "assigned_to", label: "Responsável", width: "minmax(96px,168px)", align: "left" },
    { id: "end_date", label: "Prazo", width: "minmax(64px,96px)", align: "left" },
    { id: "hours", label: "Horas", width: "minmax(48px,68px)", align: "left" },
  ];
  const BACKLOG_COLS_DEFAULT = ["priority", "status", "assigned_to", "end_date"];
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
  const DROP_ORDER = ["hours", "end_date", "assigned_to", "status", "priority"];
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
  const backlogGrid = `26px 20px minmax(120px,1fr) ${activeCols.map((c) => c.width).join(" ")} 32px`;

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
    supabase
      .from("task_dependencies")
      .select("predecessor_id, successor_id")
      .or(`predecessor_id.in.(${ids.join(",")}),successor_id.in.(${ids.join(",")})`)
      .then(({ data }) => {
        const map = new Map<string, { pred: number; succ: number }>();
        (data || []).forEach((d: any) => {
          const p = map.get(d.successor_id) || { pred: 0, succ: 0 };
          p.pred += 1;
          map.set(d.successor_id, p);
          const s = map.get(d.predecessor_id) || { pred: 0, succ: 0 };
          s.succ += 1;
          map.set(d.predecessor_id, s);
        });
        setDependencyCounts(map);
      });
  }, [activities]);

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
        const backlog = data.find((s) => s.display_order === 0);
        setBacklogStageId(backlog?.id ?? null);
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

  const handleRestore = async (activityId: string) => {
    await (supabase.from("activities").update({ is_trashed: false, trashed_at: null } as any) as any).eq("id", activityId);
    await restaurarFaseDe(activityId);
    toast({ title: "Atividade restaurada!" });
    fetchTrashedActivities();
    onDataChanged();
  };
  const handlePermanentDelete = async () => {
    if (!permanentDeleteId) return;
    await supabase.from("activities").delete().eq("id", permanentDeleteId);
    toast({ title: "Atividade excluída permanentemente!" });
    setPermanentDeleteId(null);
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
    await (supabase.from("activities").update({ is_trashed: false, trashed_at: null } as any).eq("project_id", projectId) as any).eq("is_trashed", true);
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
    const ok = await appConfirm({
      title: "Esvaziar lixeira",
      description: `Excluir PERMANENTEMENTE todas as ${trashedActivities.length} atividades? Esta ação é irreversível.`,
      confirmText: "Excluir tudo",
      destructive: true,
    });
    if (!ok) return;
    await (supabase.from("activities").delete().eq("project_id", projectId) as any).eq("is_trashed", true);
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
    const vivas = mostrarTudo ? semLixeira : soAFila(semLixeira);
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
  const childrenByParent = new Map<string, Activity[]>();
  const topLevelByPhase = new Map<string | "none", Activity[]>();
  backlogActs.forEach((a) => {
    const parentVisible = a.parent_id ? visibleIds.has(a.parent_id) : false;
    if (a.parent_id && parentVisible) {
      const arr = childrenByParent.get(a.parent_id) || [];
      arr.push(a);
      childrenByParent.set(a.parent_id, arr);
    } else {
      const key = a.phase_id || "none";
      const arr = topLevelByPhase.get(key) || [];
      arr.push(a);
      topLevelByPhase.set(key, arr);
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
      if (isPhaseLikeActivity(a) && !a.parent_id) {
        const nivel = eapLevel((a as { wbs_code?: string | null }).wbs_code);
        if (nivel === null || eapIsFaseLevel(nivel)) virtualPhaseActs.push(a);
      }
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
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setIsMoving(false);
      toast({ title: "Nenhuma tarefa selecionada", variant: "destructive" });
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
    const subiram: string[] = [];
    if (!error && !errorCaixas) {
      const movidos = new Set(ids);
      const canceladaIds = new Set(
        allStages.filter((s) =>
          (parseWorkflowCategory((s as { categoria?: string }).categoria)
            ?? categoryFromLegacyFlags(s as never)) === "cancelada",
        ).map((s) => s.id),
      );
      const colunaDe = (a: Activity) =>
        movidos.has(a.id) || subiram.includes(a.id) ? targetStageId : a.workflow_stage_id;

      // Candidatos: pais dos itens movidos, subindo nível a nível. `visto`
      // protege contra ciclo em parent_id (dado corrompido).
      const visto = new Set<string>();
      let fronteira = [...new Set(ids.map((id) => activities.find((a) => a.id === id)?.parent_id).filter(Boolean))] as string[];
      while (fronteira.length > 0) {
        const proxima: string[] = [];
        for (const paiId of fronteira) {
          if (visto.has(paiId)) continue;
          visto.add(paiId);
          const pai = activities.find((a) => a.id === paiId);
          if (!pai || movidos.has(paiId) || pai.workflow_stage_id === targetStageId) continue;
          const filhos = (childrenByParent.get(paiId) || [])
            .filter((f) => !f.is_milestone)
            .filter((f) => !(f.workflow_stage_id && canceladaIds.has(f.workflow_stage_id)));
          if (filhos.length === 0) continue;
          if (!filhos.every((f) => colunaDe(f) === targetStageId)) continue;
          subiram.push(paiId);
          if (pai.parent_id) proxima.push(pai.parent_id);
        }
        fronteira = proxima;
      }

      if (subiram.length > 0) {
        await mutateInChunks(subiram, (batch) =>
          supabase.from("activities")
            .update({ workflow_stage_id: targetStageId } as never)
            .in("id", batch),
        );
      }
    }

    setSelectedIds(new Set());
    setMoveDialogOpen(false);
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
        // A fase que subiu sozinha: ela não estava na seleção, então some da
        // coluna antiga sem ter sido pedida — dizer evita o "por que mudou?".
        subiram.length > 0
          ? `${subiram.length} ${subiram.length === 1 ? "fase/entrega acompanhou" : "fases/entregas acompanharam"} — o último item de dentro chegou.`
          : null,
        // Dizer que a caixa foi mas não concluiu: sem isto, mover uma fase para
        // "Concluída" e ver o agrupador sem o status parece falha da operação.
        caixas.length > 0 && ehFinal
          ? `${caixas.length} fase(s)/entrega(s) mudaram de coluna; a conclusão é das tarefas de dentro.`
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
      <span>Tarefa</span>
      {activeCols.map((c) => (
        <span key={c.id}>{c.label}</span>
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
          </PopoverContent>
        </Popover>
      </span>
    </div>
  );

  const renderActivityRow = (activity: Activity, depth: number = 0, flat: boolean = false) => {
    const isSelected = selectedIds.has(activity.id);
    const gutLevel = normalizeGut(activity.priority);
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
      if (colId === "priority") {
        const meta = GUT_META[gutLevel];
        return (
          <span key="priority" className="min-w-0" title={`Prioridade: ${meta.label}`}>
            <span className={`inline-flex items-center gap-1.5 h-5 px-2 rounded border text-[11px] font-medium ${meta.badgeClass}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dotClass}`} aria-hidden />
              {meta.label}
            </span>
          </span>
        );
      }
      if (colId === "status") {
        return (
          <span key="status" className="min-w-0">
            {stg ? (
              <span
                className="inline-flex items-center h-5 max-w-full truncate text-[11px] font-medium px-2 rounded border"
                style={{ borderColor: stg.color, color: stg.color, backgroundColor: `${stg.color}18` }}
                title={`Status: ${stg.title}`}
              >
                {stg.title}
              </span>
            ) : <span className="text-[11px] text-muted-foreground/40">—</span>}
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
            })() : (
              <span className="text-[12px] text-muted-foreground/40">Sem responsável</span>
            )}
          </span>
        );
      }
      if (colId === "end_date") {
        const overdue = activity.status !== "completed" && estaAtrasado(activity.end_date);
        return (
          <span key="end_date" className={`text-[12px] tabular-nums ${overdue ? "text-destructive font-semibold" : "text-foreground/80"}`}>
            {activity.end_date ? formatarDataBR(activity.end_date) : <span className="text-muted-foreground/40">—</span>}
          </span>
        );
      }
      if (colId === "hours") {
        const h = Number(activity.hours) || 0;
        return (
          <span key="hours" className="text-[12px] tabular-nums text-foreground/80">
            {h > 0 ? `${h % 1 === 0 ? h : h.toFixed(1)}h` : <span className="text-muted-foreground/40">—</span>}
          </span>
        );
      }
      return <span key={colId} />;
    };

    return (
      <div key={activity.id}>
        <div
          // py-1.5 (era 2.5): com o texto em 13px e uma coluna de ícone a menos,
          // a linha aperta sem ficar apertada — cabem ~15% mais tarefas na tela.
          className={`grid items-center gap-2 border-b px-3 py-1.5 hover:bg-muted/40 transition-colors cursor-pointer group ${
            isSelected ? "bg-primary/5" : ""
          }`}
          // O recuo de profundidade NÃO vai aqui: padding na linha encolhe a
          // área do grid e empurra TODAS as colunas para a direita, tanto mais
          // quanto mais fundo o item — era o que desalinhava as linhas do
          // cabeçalho. O recuo é aplicado só na coluna do título, abaixo.
          style={{ gridTemplateColumns: backlogGrid }}
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
                // Já entra com a família: quem clica na caixa de um
                // agrupador quer o conjunto, não a linha do título.
                setSelectedIds(new Set([activity.id, ...descendentesDe(activity.id)]));
                return;
              }
              toggleSelect(activity.id);
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Selecionar ${activity.title}`}
            title={hasChildren ? "Seleciona este item e o que está dentro" : "Selecionar esta tarefa"}
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

          {/* col: ícone de tipo (clicável) + título + código EAP + deps.
              O recuo por profundidade vive AQUI, dentro da coluna do título:
              assim a hierarquia continua legível sem deslocar as demais
              colunas, que permanecem alinhadas com o cabeçalho. */}
          <div className="flex items-center gap-2 min-w-0" style={{ paddingLeft: depth * 18 }}>
            {/* INDICADOR, não menu. Era um dropdown para trocar o tipo aqui na
                linha, mas o papel na EAP não é escolha avulsa: vem do nível do
                código e de o item ter filhos ou não. Oferecer a troca solta
                deixava opções sem sentido no contexto — "Entrega" para um item
                sem código EAP, que não tem nível nenhum. Quem precisa mudar o
                tipo faz pelo diálogo da atividade, onde o campo aparece junto do
                Código EAP e do "Dentro de", que são o que de fato determinam o
                papel. */}
            <span
              title={`Tipo: ${kindMeta.label}`}
              aria-label={`Tipo: ${kindMeta.label}`}
              className={`shrink-0 inline-flex items-center justify-center w-5 h-5 rounded border bg-muted/60 ${kindMeta.cls}`}
            >
              {kindMeta.icon}
            </span>

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
                {!!(activity as any).wbs_code && (
                  <span className="inline-flex items-center h-[18px] px-1.5 rounded border border-border bg-muted/50 text-[10.5px] font-mono text-muted-foreground shrink-0" title="Código EAP">
                    {(activity as any).wbs_code}
                  </span>
                )}
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
                {prontidao.avaliavel && !prontidao.pronta && (
                  <span
                    className="shrink-0 inline-flex items-center h-[17px] px-1.5 rounded text-[10px] font-medium border border-destructive/40 bg-destructive/5 text-destructive"
                    title={`Falta preencher: ${prontidao.faltando.map((r) => PRONTIDAO_LABELS[r]).join(", ")}. Clique na tarefa para completar.`}
                  >
                    {/* No máximo dois rótulos: a lista completa vai no tooltip,
                        senão o chip fica maior que o título da tarefa. */}
                    falta {prontidao.faltando.slice(0, 2).map((r) => PRONTIDAO_LABELS[r]).join(" · ")}
                    {prontidao.faltando.length > 2 && ` +${prontidao.faltando.length - 2}`}
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
            {progTotal > 0 && (
              <span className="flex items-center gap-1.5" title={`${progDone} de ${progTotal} concluída(s)`}>
                <span className="w-16 h-1.5 rounded-full bg-border overflow-hidden">
                  <span className="block h-full rounded-full bg-success transition-all" style={{ width: `${progPct}%` }} />
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{progDone}/{progTotal}</span>
              </span>
            )}
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
          {!!(phaseAct as any).wbs_code && (
            <span className="inline-flex items-center h-[18px] px-1.5 rounded border border-border bg-background/60 text-[10.5px] font-mono text-muted-foreground shrink-0" title="Código EAP">
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
            {/* EM QUE COLUNA ESTÁ. As linhas de tarefa sempre mostraram isso;
                a faixa de fase/entrega, não — e desde que o agrupador passou a
                acompanhar o conteúdo para o quadro, era a única linha da tela
                que não dizia onde está. Você movia a fase e não tinha como
                conferir se ela foi. */}
            {(() => {
              const stgFase = phaseAct.workflow_stage_id ? stageById.get(phaseAct.workflow_stage_id) : null;
              if (!stgFase) return null;
              return (
                <span
                  className="inline-flex items-center gap-1.5 h-5 px-2 rounded border text-[11px] font-medium shrink-0"
                  style={{ borderColor: `${stgFase.color}55`, backgroundColor: `${stgFase.color}12`, color: stgFase.color }}
                  title={`Está em "${stgFase.title}"`}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: stgFase.color }} aria-hidden />
                  {stgFase.title}
                </span>
              );
            })()}
            {progTotal > 0 && (
              <span className="flex items-center gap-1.5" title={`${progDone} de ${progTotal} concluída(s)`}>
                <span className="w-16 h-1.5 rounded-full bg-border overflow-hidden">
                  <span className="block h-full rounded-full bg-success transition-all" style={{ width: `${progPct}%` }} />
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{progDone}/{progTotal}</span>
              </span>
            )}
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
                placeholder="Buscar tarefa..."
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
          <div className={cn(
            "inline-flex rounded-md border border-border overflow-hidden h-8 shrink-0",
            // Tudo pronto: não há o que recortar, e três botões dizendo isso
            // seriam ruído. A busca ao lado continua.
            !(prontidaoResumo.total > 0 && prontidaoResumo.prontas < prontidaoResumo.total) && "hidden",
          )}>
            {([
              { v: "all" as const, lab: "Todas", n: prontidaoResumo.total, cls: "" },
              { v: "ready" as const, lab: "Prontas", n: prontidaoResumo.prontas, cls: "text-success" },
              {
                v: "incomplete" as const,
                lab: "Incompletas",
                n: prontidaoResumo.quaseProntas + prontidaoResumo.incompletas,
                cls: "text-destructive",
              },
            ]).filter((s) => s.v === "all" || s.n > 0).map((s, i) => (
              <button
                key={s.v}
                type="button"
                onClick={() => setProntidaoFilter(s.v)}
                className={cn(
                  "px-3 text-[12.5px] transition-colors whitespace-nowrap",
                  i > 0 && "border-l border-border",
                  prontidaoFilter === s.v
                    ? "bg-primary text-primary-foreground font-semibold"
                    : cn("hover:bg-muted/60", s.cls || "text-muted-foreground"),
                )}
              >
                {s.lab} <span className="tabular-nums">{s.n}</span>
              </button>
            ))}
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
                <div className="flex items-center gap-3 ml-auto" onClick={(e) => e.stopPropagation()}>
                  {progTotal > 0 && (
                    <span className="flex items-center gap-1.5" title={`${progDone} de ${progTotal} concluída(s)`}>
                      <span className="w-16 h-1.5 rounded-full bg-border overflow-hidden">
                        <span className="block h-full rounded-full bg-success transition-all" style={{ width: `${progPct}%` }} />
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">{progDone}/{progTotal}</span>
                    </span>
                  )}
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