// Tipos, constantes e helpers compartilhados do Kanban.
// Fonte de medidas visuais: lib/kanbanTokens (a imagem aprovada).
import {
  parseWorkflowCategory, suggestCategoryFromTitle,
  type WorkflowCategory,
} from "@/lib/workflowCategory";

export const formatHours = (hours: number): string => {
  if (!hours || hours <= 0) return "";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
};

export const toHoursNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export const progressLabelFromPercent = (percent: number): string => {
  if (percent >= 100) return "Validada";
  if (percent >= 75) return "Concluída";
  if (percent >= 50) return "Realizada";
  if (percent >= 25) return "Iniciada";
  return "Não iniciada";
};

export const STAGE_PRESET_COLORS = [
  "hsl(220, 15%, 50%)",
  "hsl(38, 92%, 50%)",
  "hsl(220, 90%, 56%)",
  "hsl(199, 89%, 48%)",
  "hsl(270, 70%, 55%)",
  "hsl(142, 76%, 36%)",
  "hsl(0, 84%, 60%)",
  "hsl(340, 82%, 52%)",
];

// Cor estável para uma etiqueta (mesmo texto -> mesma cor). Paleta suave que
// funciona em tema claro e escuro.
export const TAG_TONES = [
  "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
  "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
  "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30",
  "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30",
];
export const tagColorClass = (tag: string) => {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_TONES[h % TAG_TONES.length];
};

export const getProgressBarColor = (percent: number, paused: boolean) => {
  if (paused) return "bg-muted-foreground/30";
  if (percent >= 100) return "bg-emerald-500";
  if (percent >= 75) return "bg-violet-500";
  if (percent >= 50) return "bg-blue-500";
  if (percent >= 25) return "bg-amber-500";
  return "bg-muted-foreground/40";
};

export const getStageDisplayTitle = (title: string) => {
  const normalized = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const lettersOnly = normalized.replace(/[^a-z]/g, "");

  if (
    normalized === "concluida" ||
    normalized === "concluada" ||
    normalized === "concluãda" ||
    lettersOnly === "concluida" ||
    lettersOnly === "concluada" ||
    (lettersOnly.startsWith("conclu") && lettersOnly.endsWith("da"))
  ) {
    return "Concluída";
  }

  return title;
};

// Campos configuráveis do card. O usuário liga/desliga cada um pelo painel
// "⚙ Card". Alguns elementos (título, código EAP, ícone de tipo, bloqueio e
// alerta de subs impedidas) são sinais críticos e NÃO entram aqui — sempre
// aparecem.
export type CardFields = {
  priority: boolean;
  progress: boolean;
  assignee: boolean;
  participants: boolean;
  dueDate: boolean;
  hours: boolean;
  subCount: boolean;
  description: boolean;
  breadcrumb: boolean;
  subSummary: boolean;
  tags: boolean;
  dependencies: boolean;
};

// Defaults = exatamente os campos da imagem aprovada (Fase 1): prioridade,
// barra de progresso, responsável e prazo. participants/hours/subCount
// estavam ligados por padrão e não aparecem na imagem — eram o motivo do
// card acumular "0h/10h · 2 subatividades" ao lado da barra. Continuam
// disponíveis no painel "⚙ Card", só passam a começar desligados.
export const DEFAULT_CARD_FIELDS: CardFields = {
  priority: true,
  progress: true,
  assignee: true,
  participants: false,
  dueDate: true,
  hours: false,
  subCount: false,
  description: false,
  breadcrumb: false,
  /**
   * LIGADO por padrão (14/08/2026).
   *
   * Nascia desligado, escondido em Visões → campos do cartão — e ninguém o
   * encontrava. O resultado na tela: um card com 1 de 5 subatividades
   * concluídas mostrava só "36%", e para saber o que tinha andado era preciso
   * abrir a atividade e ir na aba Subatividades.
   *
   * O percentual é CONSEQUÊNCIA; quantas fecharam é a informação. Quem não
   * quiser, desliga onde sempre esteve.
   */
  subSummary: true,
  tags: false,
  dependencies: false,
};

// Ordem + rótulos + agrupamento para o painel de configuração.
export const CARD_FIELD_GROUPS: { group: string; items: { key: keyof CardFields; label: string }[] }[] = [
  { group: "Conteúdo", items: [
    { key: "description", label: "Descrição" },
    { key: "progress", label: "Barra de progresso" },
    { key: "breadcrumb", label: "Caminho do pai (EAP)" },
  ]},
  { group: "Pessoas", items: [
    { key: "assignee", label: "Responsável" },
    { key: "participants", label: "Participantes" },
  ]},
  { group: "Metadados", items: [
    { key: "priority", label: "Prioridade" },
    { key: "dueDate", label: "Prazo" },
    { key: "hours", label: "Horas" },
    { key: "tags", label: "Tags / etiquetas" },
    { key: "dependencies", label: "Dependências" },
  ]},
  { group: "Subatividades", items: [
    { key: "subCount", label: "Contador de subatividades" },
    { key: "subSummary", label: "Resumo (feitas / abertas)" },
  ]},
];

/**
 * Critérios de ordenação de cards.
 *
 * MANUAL é o padrão, como em Jira, Linear e Trello. O racional do Jira:
 * "rank determina a ordem em que os itens devem ser trabalhados — nem sempre
 * igual à prioridade". Algo pode ser alta prioridade e não urgente; algo de
 * baixa prioridade pode ser feito antes por disponibilidade da equipe. A fila
 * é decisão humana que nenhum campo captura sozinho.
 *
 * Antes o padrão era "updated:desc": o card tocado por último pulava para o
 * topo, e a ordenação por EAP montada em ActivityKanban era descartada logo em
 * seguida — o comentário lá dizia "Default sort by WBS asc", o que não
 * acontecia no resultado final.
 *
 * `travaArrasto`: com qualquer critério automático ativo, reposicionar não faz
 * sentido — a ordem se recalcula sozinha. Jira documenta a mesma limitação; a
 * diferença é que aqui o menu avisa antes de a pessoa tentar.
 */
export const SORT_CRITERIA: { id: string; label: string; defaultDir: "asc" | "desc"; travaArrasto?: boolean }[] = [
  { id: "manual", label: "Manual", defaultDir: "asc" },
  { id: "wbs", label: "Estrutura (EAP)", defaultDir: "asc", travaArrasto: true },
  { id: "priority", label: "Prioridade", defaultDir: "asc", travaArrasto: true },
  { id: "due", label: "Prazo", defaultDir: "asc", travaArrasto: true },
  { id: "updated", label: "Atualização", defaultDir: "desc", travaArrasto: true },
  { id: "assigned", label: "Responsável", defaultDir: "asc", travaArrasto: true },
  { id: "hours", label: "Horas", defaultDir: "desc", travaArrasto: true },
  { id: "title", label: "Título", defaultDir: "asc", travaArrasto: true },
];
export const DEFAULT_BOARD_SORT = "manual:asc";

/** true quando o critério recalcula a ordem e o arrasto perde efeito. */
export const sortTravaArrasto = (sortValue: string): boolean => {
  const [crit] = (sortValue || "").split(":");
  return SORT_CRITERIA.find((c) => c.id === crit)?.travaArrasto === true;
};
// Valida "criterio:dir" vindo do localStorage (chave nova ou lixo antigo).
export const isValidSortValue = (v: string | null): v is string => {
  if (!v) return false;
  const [crit, dir] = v.split(":");
  return SORT_CRITERIA.some((c) => c.id === crit) && (dir === "asc" || dir === "desc");
};

// Critérios de agrupamento em raias (swimlanes) — painel Exibição.
export const GROUP_BY_VALUES = ["none", "phase", "assignee", "priority", "sector", "tag", "blocked", "due", "customGroup"] as const;
export type GroupByValue = (typeof GROUP_BY_VALUES)[number];

/**
 * Largura mínima da coluna. Abaixo disto o card deixa de ser legível: o título
 * quebra em três linhas, o rodapé colide e a barra de progresso some.
 * Passando disso, o quadro rola na horizontal em vez de espremer as colunas.
 */
export const MIN_COLUMN_WIDTH = 272;

// Medidas do quadro: fonte única em lib/kanbanTokens (a imagem aprovada).
// Nunca reintroduzir tabelas de densidade aqui — ver o comentário no token.

/**
 * É a coluna de BACKLOG? Fonte única da pergunta.
 *
 * Não basta ler `categoria`: essa coluna pode chegar nula (backfill pendente,
 * ambiente sem a migration, linha antiga). O fallback é o NOME, e só ele.
 *
 * Deliberadamente NÃO se usa `categoryFromLegacyFlags` aqui, apesar de ser a
 * leitura padrão em todo o resto: lá dentro, `display_order === 0` devolve
 * "backlog". Em projeto novo quem ocupa a posição 0 é "Não iniciado"
 * (`categoria = 'a_iniciar'`, e a coluna de ENTRADA) — bastaria a categoria
 * chegar nula uma vez para o quadro perder justamente a coluna onde a tarefa
 * nasce. Esconder a fila é o objetivo; esconder a entrada seria um desastre.
 *
 * Errar para o lado de MOSTRAR é o certo: uma coluna a mais no quadro é ruído,
 * uma coluna a menos é trabalho invisível.
 */
export const ehBacklog = (s: {
  categoria?: WorkflowCategory; title?: string | null;
}): boolean => {
  const cat = parseWorkflowCategory(s.categoria);
  if (cat) return cat === "backlog";
  return suggestCategoryFromTitle(s.title || "") === "backlog";
};

/**
 * A coluna de ENTRADA — onde a atividade nasce: criação rápida, importação de
 * EAP e reabertura sem destino melhor. Uma por projeto, e ela não se exclui.
 *
 * O papel virou uma MARCA (`is_entry_point`) em 12/08/2026. Antes era
 * `display_order = 0`, o que amarrava duas coisas diferentes: para "A Fazer"
 * ser a entrada era preciso excluir o Backlog — a única coluna protegida
 * contra exclusão —, e reordenar podia trocar quem recebe as tarefas novas em
 * silêncio.
 *
 * Enquanto a migração não roda na VM, `is_entry_point` chega indefinido e vale
 * a leitura antiga. As duas convivem de propósito: nenhum quadro fica sem
 * entrada por causa da ordem de deploy.
 */
export const ehColunaDeEntrada = (s: {
  display_order: number; is_entry_point?: boolean;
  categoria?: WorkflowCategory; title?: string | null;
}) => {
  /* A FILA NÃO É ENTRADA. Sem esta guarda, em projeto antigo (onde
     `is_entry_point` chega indefinido e vale `display_order === 0`, posição do
     Backlog) a coluna de entrada seria justamente a que o quadro não desenha:
     toda tarefa nova nasceria invisível. A entrada tem de ser uma coluna que o
     quadro mostra — quem cria precisa ver onde caiu. */
  if (ehBacklog(s)) return false;
  return s.is_entry_point === true || (s.is_entry_point === undefined && s.display_order === 0);
};

/**
 * O que o QUADRO desenha. Fonte única — antes cada tela repetia o filtro, e
 * elas divergiram: o Kanban escondia de um jeito, o quadro de User Stories de
 * outro, e o agente de IA tinha uma terceira cópia (`isVisibleKanbanStage`, em
 * api/ai/agent/route.ts).
 *
 * DUAS REGRAS, nesta ordem:
 *
 * 1. A categoria `backlog` NUNCA entra no quadro. Não é preferência de
 *    projeto: Kanban é fluxo ("onde está cada coisa") e Backlog é fila ("o que
 *    existe, e o que vem primeiro"). São telas distintas, e a fila tem a sua
 *    própria — completa, com responsável e prazo à vista. Misturar enche o
 *    quadro com uma lista que só cresce: o problema do Trello, que Jira e Azure
 *    DevOps evitam separando as telas.
 *
 * 2. Entre as demais, quem manda é `is_visible` — o interruptor "No quadro".
 *
 * Já se tentou duas vezes tratar isto como preferência por projeto, e as duas
 * falharam pelo mesmo motivo: a decisão passava a depender de `is_visible` no
 * banco, então valia só onde alguma migration tivesse rodado. Nos projetos
 * antigos — e em qualquer ambiente com a migration pendente — o Backlog voltava
 * a ser coluna do quadro sem ninguém ter pedido. Regra de produto pertence ao
 * código, onde vale em todo lugar no mesmo instante.
 *
 * Como o interruptor não decide mais nada aqui, ele não é oferecido para o
 * Backlog na tela de colunas (`GerenciarColunas`): um controle que aceita o
 * clique e ignora mente sobre o próprio estado.
 */
export const colunasDoQuadro = <T extends {
  is_visible?: boolean; categoria?: WorkflowCategory; title?: string | null;
}>(stages: T[]): T[] =>
  stages.filter((s) => !ehBacklog(s) && s.is_visible !== false);

/** Colunas escondidas por decisão do projeto (`is_visible = false`). */
/**
 * Colunas ESCONDIDAS POR ENGANO — as que alguém desligou em "No quadro" e que
 * ainda guardam tarefas. É o que o aviso âmbar da régua denuncia.
 *
 * A coluna de BACKLOG não entra, mesmo cheia. Ela sai do quadro por DECISÃO DE
 * PRODUTO (Kanban é fluxo, Backlog é fila — ver `colunasDoQuadro`), e as tarefas
 * dela estão à vista na aba própria. Tratá-la como escondida acendia o alerta
 * permanentemente, num projeto sem nada de errado: foi o que aconteceu quando
 * tirei o Backlog do quadro sem voltar aqui.
 *
 * O aviso serve para o caso em que a pessoa oculta uma coluna e esquece
 * trabalho dentro — aí ninguém vê aquele status em lugar nenhum.
 */
export const colunasOcultas = <T extends {
  is_visible?: boolean; categoria?: WorkflowCategory; title?: string | null;
}>(stages: T[]): T[] =>
  stages.filter((s) => s.is_visible === false && !ehBacklog(s));

export interface WorkflowStage {
  id: string;
  project_id: string;
  title: string;
  color: string;
  display_order: number;
  is_final: boolean;
  is_blocked: boolean;
  is_visible: boolean;
  progress_percent?: number | null;
  contributes_to_progress?: boolean;
  wip_limit?: number | null;
  /** Quando true, o quadro IMPEDE exceder o wip_limit (opt-in por coluna). */
  wip_strict?: boolean | null;
  /** Categoria semântica — fonte da verdade, independente do título. */
  categoria?: WorkflowCategory;
  /**
   * Onde a atividade nasce. Indefinido em banco sem a migração
   * `20260812140000_coluna_de_entrada` — aí vale `display_order === 0`.
   */
  is_entry_point?: boolean;
}

export interface Phase {
  id: string;
  title: string;
}

export interface Activity {
  id: string;
  title: string;
  wbs_code?: string | null;
  description: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at?: string;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
  cost: number;
  hours: number;
  phase_id: string | null;
  display_order?: number | null;
  priority?: string;
  priority_score?: number | null;
  tags?: string[];
  parent_id?: string | null;
  workflow_stage_id?: string | null;
  last_progress_stage_id?: string | null;
  story_points?: number;
  participants?: string[];
  deadline_flag?: string | null;
  last_update_date?: string | null;
  is_milestone?: boolean;
  /** Papel EAP bruto ('fase' | 'atividade' | 'pacote' legado) — ler via resolveEapKind. */
  item_type?: string | null;
  progress_flag?: number | null;
  blocked_since?: string | null;
  /** Quando entrou na coluna atual — base do envelhecimento (card aging). */
  stage_entered_at?: string | null;
  blocked_days_total?: number | null;
  /** Bloqueio "in place": marcado na atividade, não pela coluna. */
  is_blocked?: boolean | null;
  blocked_reason?: string | null;
  created_by?: string | null;
}

// Filtro por coluna (Frente B): mesmos campos do filtro geral, exceto
// "Coluna/Status" (não faz sentido dentro da própria coluna). Serializável
// (arrays em vez de Sets) para persistir por projeto.
export interface ColumnFilter {
  assignees: string[];
  priorities: string[];
  sectors: string[];
  types: string[];
  participants: string[];
  tags: string[];
  dueRange: { from: string; to: string };
  startRange: { from: string; to: string };
  hoursRange: { min: string; max: string };
  blocked: boolean;
}
export const EMPTY_COLUMN_FILTER: ColumnFilter = {
  assignees: [], priorities: [], sectors: [], types: [], participants: [], tags: [],
  dueRange: { from: "", to: "" }, startRange: { from: "", to: "" }, hoursRange: { min: "", max: "" },
  blocked: false,
};
export const columnFilterActive = (f: ColumnFilter): boolean =>
  f.assignees.length > 0 || f.priorities.length > 0 || f.sectors.length > 0 ||
  f.types.length > 0 || f.participants.length > 0 || f.tags.length > 0 ||
  !!(f.dueRange.from || f.dueRange.to) || !!(f.startRange.from || f.startRange.to) ||
  !!(f.hoursRange.min || f.hoursRange.max) || f.blocked;

export interface ActivityKanbanProps {
  projectId: string;
  activities: Activity[];
  phases: Phase[];
  consumedMinutesByActivity?: Record<string, number>;
  onDataChanged: () => void;
  onEditActivity: (activity: Activity) => void;
  onDeleteActivity: (activityId: string) => void;
  onToggleActivity: (activityId: string, currentStatus: string) => void;
  isAdmin?: boolean;
  canCreate?: boolean;
  /** Líder do projeto — citado no aviso de bloqueio, para a pessoa saber a quem pedir. */
  projectOwner?: string | null;
  /** `project_members.can_edit` / `can_move` — permissão do membro no projeto. */
  canEdit?: boolean;
  canMove?: boolean;
  /**
   * `project_members.can_edit_own` — edita as atividades em que ATUA.
   * `false` só no papel "Visualizar e comentar", que é o único que diz
   * "não edita nem as dela". Omitido conta como `true`.
   */
  canEditOwn?: boolean;
  projectLocked?: boolean;
  isQualityProject?: boolean;
  onOpenCreateTask?: (stageId: string) => void;
  /** Mapa de id de perfil → nome completo para resolução de assigned_to */
  profilesMap?: Record<string, string>;
  /** Mapa de id de perfil → avatar_url */
  profileAvatarMap?: Record<string, string>;
  /** Mapa de id/nome de perfil → setor (para raia por setor) */
  profileSectorMap?: Record<string, string>;
}

export type HoursStat = {
  planned: number;
  consumed: number;
  hasSubs: boolean;
};

export type SubActivityStatusSummary = {
  completed: number;
  pending: number;
};
