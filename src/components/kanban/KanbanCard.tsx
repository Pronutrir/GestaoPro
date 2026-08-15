'use client';
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Trash2,
  CheckCircle2,
  Circle,
  GripVertical,
  AlertCircle,
  BookOpen,
  MoreHorizontal,
  Check,
  ArrowRightLeft,
  MessageSquare,
  Paperclip,
  Hourglass,
  X as XIcon,
  Diamond,
  ChevronRight,
  ChevronDown,
  Flag,
  Link2,
  Layers,
  EyeOff,
} from "lucide-react";
import { type DraggableSyntheticListeners } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { getBlockedDays, formatBlockedDays } from "@/lib/blockedTime";
import { KANBAN_TOKENS } from "@/lib/kanbanTokens";
import { formatarDataBR, formatarDiaMes, estaAtrasado } from "@/lib/dataLocal";
import { type ActivityProgress } from "@/lib/activityProgress";

import { normalizeGut, GUT_META } from "@/lib/gutPriority";

import {
  suggestCategoryFromTitle,
  categoryFromLegacyFlags,
  parseWorkflowCategory,
  type WorkflowCategory,
} from "@/lib/workflowCategory";
import { SHOW_USER_STORIES } from "@/lib/featureFlags";
import { getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";

import { computeCardAging, CARD_AGING_CLASSES } from "@/lib/cardAging";
import { cn } from "@/lib/utils";
import { memo } from "react";
import {
  formatHours,
  toHoursNumber,
  tagColorClass,
  getProgressBarColor,
  DEFAULT_CARD_FIELDS,
  type CardFields,
  type Phase,
  type Activity,
  type HoursStat,
  type SubActivityStatusSummary,
} from "./shared";

export function SortableKanbanCard({
  activity,
  phases,
  onEdit,
  onDelete,
  onToggle,
  onDuplicate,
  onMoveToStage,
  moveTargets,
  onLinkParent,
  isAdmin,
  isBlocked,
  onToggleBlocked,
  hasStory,
  storyCount,
  onStoryClick,
  onCreateStory,
  isQualityProject,
  stageColor,
  subActivityCount,
  dependencyCount,
  waitingOnCount,
  commentCount,
  attachmentCount,
  relationItems,
  onOpenRelated,
  onRemoveRelation,
  isExpanded,
  onToggleExpand,
  progress,
  cardFields,
  parentBreadcrumb,
  blockedSubsCount,
  subActivityStatusSummary,
  hoursStat,
  profilesMap = {},
  profileAvatarMap = {},
}: {
  activity: Activity;
  phases: Phase[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onDuplicate?: () => void;
  onMoveToStage?: (stageId: string) => void;
  /** Mesmo formato de KanbanCardBase — `hidden` marca coluna oculta para o
   *  menu avisar. Sem ele aqui, o selo não chegava pelo card arrastável. */
  moveTargets?: { id: string; title: string; color: string; hidden?: boolean }[];
  onLinkParent?: () => void;
  isAdmin?: boolean;
  isBlocked?: boolean;
  onToggleBlocked?: () => void;
  hasStory?: boolean;
  storyCount?: number;
  onStoryClick?: () => void;
  onCreateStory?: () => void;
  isQualityProject?: boolean;
  stageColor?: string;
  subActivityCount?: number;
  dependencyCount?: { pred: number; succ: number };
  /** Predecessoras ainda nao concluidas — dependencia bloqueante. */
  waitingOnCount?: number;
  commentCount?: number;
  attachmentCount?: number;
  relationItems?: { id: string; title: string; relationId: string; relationType: string }[];
  onOpenRelated?: (activityId: string) => void;
  onRemoveRelation?: (relationId: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  progress?: ActivityProgress;
  cardFields?: CardFields;
  parentBreadcrumb?: { id: string; title: string; wbsCode?: string | null } | null;
  blockedSubsCount?: number;
  subActivityStatusSummary?: SubActivityStatusSummary;
  hoursStat?: HoursStat;
  profilesMap?: Record<string, string>;
  profileAvatarMap?: Record<string, string>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: activity.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <KanbanCard
        activity={activity}
        phases={phases}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggle={onToggle}
        onDuplicate={onDuplicate}
        onMoveToStage={onMoveToStage}
        moveTargets={moveTargets}
        onLinkParent={onLinkParent}
        dragListeners={listeners}
        isAdmin={isAdmin}
        isBlocked={isBlocked}
        onToggleBlocked={onToggleBlocked}
        hasStory={hasStory}
        storyCount={storyCount}
        onStoryClick={onStoryClick}
        onCreateStory={onCreateStory}
        isQualityProject={isQualityProject}
        stageColor={stageColor}
        subActivityCount={subActivityCount}
        dependencyCount={dependencyCount}
        waitingOnCount={waitingOnCount}
        commentCount={commentCount}
        attachmentCount={attachmentCount}
        relationItems={relationItems}
        onOpenRelated={onOpenRelated}
        onRemoveRelation={onRemoveRelation}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        progress={progress}
        cardFields={cardFields}
        parentBreadcrumb={parentBreadcrumb}
        blockedSubsCount={blockedSubsCount}
        subActivityStatusSummary={subActivityStatusSummary}
        hoursStat={hoursStat}
        profilesMap={profilesMap}
        profileAvatarMap={profileAvatarMap}
      />
    </div>
  );
}

function KanbanCardBase({
  activity,
  phases,
  onEdit,
  onDelete,
  onToggle,
  onDuplicate,
  onMoveToStage,
  moveTargets,
  onLinkParent,
  dragListeners,
  isAdmin,
  isBlocked,
  onToggleBlocked,
  hasStory,
  storyCount,
  onStoryClick,
  onCreateStory,
  isQualityProject,
  stageColor,
  subActivityCount,
  dependencyCount,
  waitingOnCount,
  commentCount,
  attachmentCount,
  relationItems,
  onOpenRelated,
  onRemoveRelation,
  isExpanded,
  onToggleExpand,
  progress,
  cardFields = DEFAULT_CARD_FIELDS,
  parentBreadcrumb,
  blockedSubsCount,
  subActivityStatusSummary,
  hoursStat,
  readOnlyPreview = false,
  profilesMap = {},
  profileAvatarMap = {},
  selecionado = false,
  modoSelecao = false,
  onToggleSelecao,
}: {
  activity: Activity;
  phases: Phase[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onDuplicate?: () => void;
  /** Move o card para outra coluna do quadro (substitui o antigo "mover para backlog"). */
  onMoveToStage?: (stageId: string) => void;
  /** Colunas do projeto, destinos do "Mover para →". `hidden` = coluna oculta
   *  no quadro: continua sendo destino, mas o menu avisa (mesmo selo que o
   *  seletor de status do diálogo de edição usa). */
  moveTargets?: { id: string; title: string; color: string; hidden?: boolean }[];
  onLinkParent?: () => void;
  dragListeners?: DraggableSyntheticListeners;
  isAdmin?: boolean;
  isBlocked?: boolean;
  onToggleBlocked?: () => void;
  hasStory?: boolean;
  storyCount?: number;
  onStoryClick?: () => void;
  onCreateStory?: () => void;
  isQualityProject?: boolean;
  stageColor?: string;
  subActivityCount?: number;
  dependencyCount?: { pred: number; succ: number };
  /** Predecessoras ainda nao concluidas — dependencia bloqueante. */
  waitingOnCount?: number;
  commentCount?: number;
  attachmentCount?: number;
  relationItems?: { id: string; title: string; relationId: string; relationType: string }[];
  onOpenRelated?: (activityId: string) => void;
  onRemoveRelation?: (relationId: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  progress?: ActivityProgress;
  cardFields?: CardFields;
  parentBreadcrumb?: { id: string; title: string; wbsCode?: string | null } | null;
  blockedSubsCount?: number;
  subActivityStatusSummary?: SubActivityStatusSummary;
  hoursStat?: HoursStat;
  readOnlyPreview?: boolean;
  profilesMap?: Record<string, string>;
  profileAvatarMap?: Record<string, string>;
  /**
   * SELEÇÃO EM LOTE.
   *
   * A caixa aparece no hover (ou fixa, quando o modo já está ligado) e é a
   * ÚNICA porta para o lote: o clique no cartão continua abrindo a edição,
   * que é o gesto mais usado do quadro e não pode ser trocado.
   *
   * Existe para o caso que o bloqueio "mova o que está dentro primeiro"
   * criava: uma entrega com 5 filhos exigia cinco arrastes.
   */
  selecionado?: boolean;
  modoSelecao?: boolean;
  onToggleSelecao?: (e: React.MouseEvent) => void;
}) {
  // estaAtrasado compara DIA com DIA. A conta local anterior montava a data às
  // 00:00 e comparava com `new Date()` (com hora), então tudo que vencia HOJE
  // aparecia atrasado a partir de 00:01 — o prazo vence no fim do dia.
  const isOverdue = estaAtrasado(activity.end_date) && activity.status !== "completed";

  // O menu "..." vive num container que só aparece no hover. Ao mover o mouse
  // para dentro do dropdown o card perde o hover, e sem isto o gatilho sumiria
  // com o menu ainda aberto.
  const [menuOpen, setMenuOpen] = useState(false);

  const isMilestone = !!activity.is_milestone;
  const eapType = activity.item_type ?? undefined;
  // Modelo unificado (lib/eapModel): agrupador = Fase/Entrega. Cobre 'fase',
  // 'pacote' legado e qualquer item com filhos. Exibido sempre como Fase.
  const isPhase =
    !isMilestone && (eapType === "fase" || eapType === "pacote" || (subActivityCount ?? 0) > 0);
  /** Está aninhado sob outro card? A faixa lateral colorida é dele. */
  const ehFilho = !!activity.parent_id;
  // Bloqueio vem ANTES de marco: é o estado que exige ação, e um marco
  // travado precisa ser lido como travado.
  const cardBorderClass = isBlocked
    ? "border-l-[3px] border-l-amber-500 bg-amber-500/[0.06]"
    : isMilestone
      ? "border-amber-500 border-l-[4px] border-l-amber-500 bg-amber-500/5"
      : isOverdue
        ? "border-destructive border-l-[3px] border-l-destructive animate-pulse-overdue"
        // FILHO GANHA FAIXA PRÓPRIA. Antes a linha vivia no container do grupo
        // — dizia "estes pertencem ao de cima" e nada mais: filho concluído e
        // filho atrasado ficavam iguais. Na borda de cada card, ela entra na
        // MESMA linguagem que a raiz já usa para bloqueio e atraso, e a coluna
        // passa a se ler de cima a baixo com uma regra só. O vínculo continua
        // visível pelo recuo, que é o que sempre o comunicou.
        : ehFilho
          ? (activity.status === "completed"
              ? "border-l-[3px] border-l-success"
              : "border-l-[3px] border-l-primary/60")
          : "border-border";

  const tooltipLines = [
    activity.title,
    activity.description ? `📝 ${activity.description}` : null,
    activity.assigned_to ? `Responsável: ${profilesMap[activity.assigned_to] ?? activity.assigned_to}` : null,
    activity.priority
      ? `⚡ Prioridade: ${GUT_META[normalizeGut(activity.priority)].label}${activity.priority_score ? ` (${activity.priority_score})` : ""}`
      : null,
    activity.start_date ? `📅 Início: ${formatarDataBR(activity.start_date)}` : null,
    activity.end_date ? `📅 Fim: ${formatarDataBR(activity.end_date)}` : null,
    isQualityProject && activity.last_update_date ? `🔄 Atualização: ${formatarDataBR(activity.last_update_date)}` : null,
    isQualityProject && activity.deadline_flag ? `🚦 Flag: ${activity.deadline_flag === "green" ? "Em dia" : activity.deadline_flag === "orange" ? "Atenção" : activity.deadline_flag === "red" ? "Vencido" : ""}` : null,
    activity.hours > 0 ? `⏱ Tempo: ${formatHours(activity.hours)}` : null,
    activity.status === "completed" ? "✅ Concluída" : null,
  ].filter(Boolean);

  // Andamento calculado automaticamente pela posição no Kanban
  const progressInfo: ActivityProgress = progress
    ?? { percent: 0, paused: false, label: "Não iniciada" };
  const progressPaused = progressInfo.paused;
  const progressPercent = progressInfo.percent ?? 0;
  const progressBarColor = getProgressBarColor(progressPercent, progressPaused);
  const progressBarWidth = progressPaused ? 100 : progressPercent;
  // Marco não tem percentual: mostrar "0%" nele sugere um avanço que não
  // existe — ou o marco foi atingido, ou não. O selo diz o estado, não o
  // número, e a barra fica cheia ou vazia (nunca no meio).
  const ehMarco = activity.is_milestone === true;
  const progressTooltip = progressPaused
    ? "Pausada (coluna de bloqueio)"
    : ehMarco
      ? `Marco ${progressPercent >= 100 ? "atingido" : "não atingido"}`
      : `${progressPercent}% — ${progressInfo.label}`;
  const progressBadge = progressPaused
    ? "⏸"
    : ehMarco
      ? progressPercent >= 100 ? "✓" : "◇"
      : `${progressPercent}%`;
  const assigneeRaw = (activity.assigned_to || "").trim();
  const assigneeName = assigneeRaw
    ? (profilesMap[assigneeRaw] ?? assigneeRaw)
    : null;
  const assigneeAvatar = resolveAvatarFromLookup(assigneeRaw, assigneeName, profileAvatarMap);

  const d = KANBAN_TOKENS;

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              `relative bg-card border border-border rounded-lg ${d.card} ${dragListeners ? "pl-[18px]" : ""} shadow-md hover:shadow-lg transition-shadow cursor-pointer group ${cardBorderClass}`,
              // Selecionado se anuncia pelo anel, não pelo fundo: o fundo já
              // carrega o estado de bloqueio/atraso, e somar cor sobre cor
              // deixaria os dois ilegíveis.
              selecionado && "ring-2 ring-primary ring-offset-1 ring-offset-background",
            )}
            // No MODO SELEÇÃO o clique no card marca em vez de abrir: quem está
            // escolhendo vários quer clicar rápido, e mirar a caixinha de 14px
            // a cada item é trabalho desnecessário. Fora do modo, abre a edição
            // como sempre — o gesto mais usado do quadro não muda.
            onClick={modoSelecao && onToggleSelecao ? onToggleSelecao : onEdit}
          >
            {/* A CAIXA. No hover fora do modo (a porta de entrada), fixa dentro
                dele. `stopPropagation` porque o card inteiro já é clicável. */}
            {onToggleSelecao && !readOnlyPreview && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleSelecao(e); }}
                aria-label={selecionado ? "Desmarcar" : "Selecionar"}
                title={selecionado ? "Desmarcar" : "Selecionar para mover em lote"}
                className={cn(
                  "absolute right-1.5 top-1.5 z-10 w-4 h-4 rounded-[4px] border flex items-center justify-center transition-all",
                  selecionado
                    ? "bg-primary border-primary text-primary-foreground opacity-100"
                    : "bg-card border-muted-foreground/40 opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                  modoSelecao && "opacity-100",
                )}
              >
                {selecionado && <Check className="w-3 h-3" strokeWidth={3} />}
              </button>
            )}
            {/* Alça de arrastar FORA do fluxo: como coluna fixa ela roubava
                ~20px de largura de todo card, o tempo todo, para uma ação que
                só importa no hover. Flutua sobre a borda esquerda; o card
                reserva 18px (pl acima) só quando arrastável, senão a alça
                cobria o nº EAP no hover. */}
            {dragListeners ? (
              <button
                className="absolute left-0 top-0 bottom-0 w-4 flex items-start justify-center pt-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground"
                onClick={(e) => e.stopPropagation()}
                {...dragListeners}
              >
                <GripVertical className="w-3.5 h-3.5" />
              </button>
            ) : null}
            <div className={`flex items-start ${d.gap}`}>
              <div className="flex-1 min-w-0 overflow-hidden">
                {parentBreadcrumb && cardFields.breadcrumb && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Reaproveita onOpenRelated para abrir o pai (já existe handler de abrir atividade por id)
                      onOpenRelated?.(parentBreadcrumb.id);
                    }}
                    className="flex items-center gap-1 mb-1 px-1.5 py-0.5 rounded bg-muted/60 hover:bg-muted text-[10px] text-muted-foreground hover:text-foreground max-w-full"
                    title={`Subatividade de: ${parentBreadcrumb.title}`}
                  >
                    <span className="shrink-0">↳</span>
                    {parentBreadcrumb.wbsCode ? (
                      <span className="inline-flex items-center h-4 px-1 rounded border border-border bg-muted/40 text-[10px] font-mono text-muted-foreground align-middle shrink-0">
                        {parentBreadcrumb.wbsCode}
                      </span>
                    ) : null}
                    <span className="truncate">{parentBreadcrumb.title}</span>
                  </button>
                )}
                <div className="flex items-start gap-1.5 mb-2">
                  {isMilestone && (
                    <Diamond
                      className="w-3.5 h-3.5 fill-amber-500 text-amber-500 shrink-0 mt-0.5"
                      aria-label="Marco"
                    />
                  )}
                  {!isMilestone && isPhase && (
                    <Layers className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" aria-label="Fase / Entrega" />
                  )}
                  <p
                    className={`${d.title} font-medium line-clamp-2 flex-1 min-w-0 ${
                      activity.status === "completed"
                        ? "line-through text-muted-foreground"
                        : "text-foreground"
                    }`}
                  >
                    {activity.wbs_code ? (
                      <span className="inline-flex items-center h-[17px] px-1.5 mr-1.5 rounded border border-border bg-muted text-[10px] font-mono text-muted-foreground align-middle">
                        {activity.wbs_code}
                      </span>
                    ) : null}
                    <span>{activity.title}</span>
                  </p>
                  {/* Prioridade alinhada à direita do título (layout limpo) */}
                  {cardFields.priority && (() => {
                    const lvl = normalizeGut(activity.priority);
                    if (lvl === "pendente") return null;
                    const meta = GUT_META[lvl];
                    return (
                      <span
                        className={`shrink-0 mt-0.5 inline-flex items-center h-4 px-1.5 rounded text-[9px] font-bold leading-none ${meta.badgeClass} ${meta.pulse ? "animate-pulse-strong" : ""}`}
                        title={`Prioridade: ${meta.label}${activity.priority_score ? ` (${activity.priority_score})` : ""}`}
                        aria-label={`Prioridade ${meta.label}`}
                      >
                        {meta.label}
                      </span>
                    );
                  })()}
            {/* Acoes NO FLUXO, no fim da linha do titulo: [Concluir][...].
                Absolutas elas sobrepunham o que estivesse no canto (badge de
                prioridade, inicio do titulo). Em fluxo a sobreposicao e
                impossivel — e com so 2 botoes o custo e 44px fixos, nao os
                ~140px da fileira antiga de 6 icones. Invisiveis fora do hover
                (opacity preserva o espaco: o layout nao pula), visiveis com o
                menu aberto e na navegacao por teclado. */}
            {!readOnlyPreview && (
              <div
                className={`shrink-0 flex items-center gap-0.5 -mt-0.5 -mr-1 transition-opacity ${menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* O círculo de concluir saiu daqui — foi para dentro do "…".
                    Eram dois círculos quase iguais no topo do card, e o outro
                    (o de progresso) é o que a pessoa lê. */}
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="h-[22px] w-[22px] flex items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      title="Opções da atividade"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-52"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {/* "Editar" saiu: clicar em qualquer lugar do card já abre a
                        edição (onClick={onEdit} no card), então o item era morto.

                        "Duplicar" saiu do QUADRO (14/08/2026): duplicar é ação
                        de planejamento — nasce da EAP, com código e posição —, e
                        no fluxo ela criava um card órfão no meio da coluna. O
                        Backlog continua tendo, que é onde a EAP se monta.

                        CONCLUIR entra aqui, no lugar do círculo que ficava ao
                        lado do "…": eram dois círculos quase iguais no topo do
                        card, disputando leitura com o de progresso. A ação não
                        se perde — muda de lugar, e arrastar para a coluna final
                        segue concluindo. */}
                    <DropdownMenuItem
                      className={activity.status === "completed"
                        ? "focus:bg-muted/60 focus:text-foreground"
                        : "text-success focus:text-success focus:bg-success/10"}
                      onSelect={() => onToggle()}
                    >
                      {activity.status === "completed" ? (
                        <><Circle className="w-3.5 h-3.5 mr-2" /> Reabrir atividade</>
                      ) : (
                        <><CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Concluir atividade</>
                      )}
                    </DropdownMenuItem>
                    {/* "Mover para →" substitui o antigo "Mover para Backlog", que
                        mandava o card para o stage display_order=0 — coluna que o
                        quadro não renderiza, fazendo o card desaparecer sem aviso. */}
                    {onMoveToStage && moveTargets && moveTargets.length > 0 && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="focus:bg-muted/60 focus:text-foreground data-[state=open]:bg-muted/60">
                          <ArrowRightLeft className="w-3.5 h-3.5 mr-2" /> Mover para
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent sideOffset={6} className="w-52">
                          {moveTargets.map((s) => (
                            <DropdownMenuItem
                              key={s.id}
                              disabled={s.id === activity.workflow_stage_id}
                              className="text-xs focus:bg-muted/60 focus:text-foreground"
                              onSelect={() => onMoveToStage(s.id)}
                            >
                              <span className="w-2 h-2 rounded-full mr-2 shrink-0" style={{ backgroundColor: s.color }} />
                              <span className="truncate">{s.title}</span>
                              {/* Mesmo selo do seletor de status na edição: a
                                  coluna existe no fluxo mas não aparece no
                                  quadro, então mover para cá some com o card
                                  do Kanban de todo mundo. Escolher às cegas
                                  era o problema. */}
                              {s.hidden && s.id !== activity.workflow_stage_id && (
                                <span
                                  className="ml-auto shrink-0 inline-flex items-center gap-1 text-[10px] text-warning"
                                  title="Esta coluna está oculta no quadro: a tarefa não aparecerá no Kanban."
                                >
                                  <EyeOff className="w-3 h-3" /> oculta
                                </span>
                              )}
                              {s.id === activity.workflow_stage_id && (
                                <Check className="w-3 h-3 ml-auto text-primary shrink-0" />
                              )}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}

                    {/* Menu enxuto por decisão de produto (29/07/2026): só ações
                        que o diálogo de edição NÃO cobre. Atribuir, Prazo e
                        Converter saíram — clicar no card já abre o diálogo, que
                        tem os três. Mover continua aqui porque é o caminho de um
                        clique: o diálogo também faz (campo "Dentro de"), mas
                        exige abrir o card e achar o campo.
                        O arraste NÃO aninha de propósito — no Kanban ele já
                        significa "mudar de coluna"/"reordenar", e sobrecarregar
                        o mesmo gesto tornaria o aninhamento acidental. */}
                    {onLinkParent && (
                      <DropdownMenuItem
                        className="focus:bg-muted/60 focus:text-foreground"
                        onSelect={() => onLinkParent()}
                      >
                        <Layers className="w-3.5 h-3.5 mr-2" /> Mover para dentro de…
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator />

                    {onToggleBlocked && (
                      <DropdownMenuItem
                        className="focus:bg-muted/60 focus:text-foreground"
                        onSelect={() => onToggleBlocked()}
                        title={isBlocked ? "Desbloquear" : "Bloquear (o card fica onde está)"}
                      >
                        <Flag className={`w-3.5 h-3.5 mr-2 ${isBlocked ? "fill-current text-amber-600 dark:text-amber-500" : ""}`} />
                        {isBlocked ? "Desbloquear" : "Bloquear"}
                      </DropdownMenuItem>
                    )}
                    {SHOW_USER_STORIES && onCreateStory && (
                      <DropdownMenuItem
                        className="focus:bg-muted/60 focus:text-foreground"
                        onSelect={() => onCreateStory()}
                      >
                        <BookOpen className="w-3.5 h-3.5 mr-2" /> Criar História
                      </DropdownMenuItem>
                    )}

                    {isAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                          onSelect={() => onDelete()}
                        >
                          {/* "Arquivar", não "Excluir": a ação marca is_trashed
                              e o item volta pelo Arquivo. Excluir de verdade só
                              existe lá dentro, onde é de fato irreversível. */}
                          <Trash2 className="w-3.5 h-3.5 mr-2" /> Arquivar
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
                </div>

                {cardFields.description && activity.description && (
                  <p className={`${d.desc} text-muted-foreground ${d.descClamp} mb-1.5 leading-relaxed`}>
                    {activity.description}
                  </p>
                )}

                {/* Etiquetas (tags) — coloridas de forma estável por texto */}
                {cardFields.tags && Array.isArray(activity.tags) && activity.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {activity.tags.slice(0, 6).map((tag) => (
                      <span key={tag} className={cn("px-1.5 py-0 rounded text-[10px] font-medium border", tagColorClass(tag))}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Barra de andamento (calculada pelo Kanban).
                    UMA LINHA SÓ — barra + %, sem wrapper. Envolver isto numa
                    div de bloco acrescentava altura em TODO card, mesmo sem
                    divergência: o card ficava mais alto para acomodar um aviso
                    que quase nunca aparece. */}
                {cardFields.progress && !isQualityProject && (
                <div
                  className="mb-2 flex items-center gap-2"
                  title={progressTooltip}
                >
                  <div className="flex-1 h-[5px] rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${progressBarColor} transition-all ${progressPaused ? "opacity-50" : ""}`}
                      style={{ width: `${progressBarWidth}%` }}
                    />
                  </div>
                  {/* Divergência (coluna concluída com subatividade aberta) cabe
                      aqui mesmo: o ícone entra ao lado do número, sem criar
                      linha nova. O texto completo fica no tooltip. */}
                  {progressInfo.divergente && progressInfo.subs && (
                    <AlertCircle className="w-3 h-3 text-destructive shrink-0" />
                  )}
                  <span className={`text-[10px] tabular-nums shrink-0 ${
                    progressInfo.divergente ? "text-destructive font-medium" : "text-muted-foreground"
                  }`}>
                    {progressBadge}
                  </span>
                </div>
                )}

                {/* Bloqueio in place: o card continua na coluna onde o trabalho
                    está, com o motivo legível e há quanto tempo está travado. */}
                {isBlocked && (
                  <div
                    className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-500"
                    title={
                      activity.blocked_since
                        ? `Bloqueada desde ${new Date(activity.blocked_since).toLocaleString("pt-BR")}`
                        : "Bloqueada"
                    }
                  >
                    <Flag className="w-3 h-3 shrink-0 fill-current" />
                    <span className="truncate">
                      {activity.blocked_reason
                        ? `Bloqueada — ${activity.blocked_reason}`
                        : "Bloqueada"}
                    </span>
                    {(() => {
                      const label = formatBlockedDays(getBlockedDays(activity));
                      return label ? (
                        <span className="ml-auto shrink-0 font-normal text-muted-foreground tabular-nums">
                          {label}
                        </span>
                      ) : null;
                    })()}
                  </div>
                )}

                {/* Dependência bloqueante: espera predecessora não concluída.
                    Distinto do bloqueio manual (que é uma decisão de alguém) —
                    aqui é sequenciamento. Sem isso, um card pronto para começar
                    e um travado esperando outro pareciam idênticos no quadro. */}
                {!isBlocked && waitingOnCount && waitingOnCount > 0 ? (
                  <div
                    className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-orange-700 dark:text-orange-400"
                    title={`Aguarda ${waitingOnCount} predecessora(s) ainda não concluída(s)`}
                  >
                    <Hourglass className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      {waitingOnCount === 1
                        ? "Aguarda 1 predecessora"
                        : `Aguarda ${waitingOnCount} predecessoras`}
                    </span>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-1">
                  {!!blockedSubsCount && blockedSubsCount > 0 && (
                    <Badge
                      className="bg-destructive/15 text-destructive border-destructive/30 text-[10px] px-1.5 py-0 animate-pulse"
                      title={`${blockedSubsCount} subatividade(s) impedida(s)`}
                    >
                      ⚠ {blockedSubsCount} sub{blockedSubsCount > 1 ? "s" : ""} impedida{blockedSubsCount > 1 ? "s" : ""}
                    </Badge>
                  )}
                  {/* Bloqueio virou linha própria, fora desta faixa de badges —
                      ver o bloco "Bloqueio in place" logo abaixo. */}
                  {isQualityProject && activity.deadline_flag && activity.deadline_flag !== "" && (
                    <Badge className={`text-[10px] px-1.5 py-0 ${
                      activity.deadline_flag === "green" ? "bg-emerald-500/20 text-emerald-600 border-emerald-500/30" :
                      activity.deadline_flag === "orange" ? "bg-orange-500/20 text-orange-600 border-orange-500/30" :
                      activity.deadline_flag === "red" ? "bg-destructive/20 text-destructive border-destructive/30" : ""
                    }`}>
                      {activity.deadline_flag === "green" ? "🟢 Em dia" :
                       activity.deadline_flag === "orange" ? "🟠 Atenção" :
                       activity.deadline_flag === "red" ? "🔴 Vencido" : ""}
                    </Badge>
                  )}
                  {/* Avatar limpo, sem moldura de badge: ancora o rodapé à
                      esquerda enquanto o prazo ancora à direita. */}
                  {cardFields.assignee && activity.assigned_to && (
                    <Avatar className="h-5 w-5 shrink-0" title={assigneeName || "Responsável"}>
                      {assigneeAvatar ? <AvatarImage src={assigneeAvatar} alt={assigneeName || "Responsável"} /> : null}
                      <AvatarFallback className="text-[8.5px] font-semibold bg-primary/15 text-primary">
                        {getAvatarInitials(assigneeName)}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  {cardFields.participants && activity.participants && activity.participants.length > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-accent/30" title={`Participantes: ${activity.participants.join(", ")}`}>
                      👥 +{activity.participants.length}
                    </Badge>
                  )}
                  {isQualityProject && activity.last_update_date && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/5 text-primary/80">
                      🔄 {formatarDataBR(activity.last_update_date)}
                    </Badge>
                  )}
                  {SHOW_USER_STORIES && hasStory && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/30 cursor-pointer hover:bg-primary/20 transition-colors"
                      onClick={(e) => { e.stopPropagation(); onStoryClick?.(); }}
                    >
                      📖 {storyCount && storyCount > 1 ? `${storyCount} Histórias` : "História"}
                    </Badge>
                  )}
                  {cardFields.hours && hoursStat && (hoursStat.planned > 0 || hoursStat.consumed > 0) ? (
                    <Badge
                      variant="secondary"
                      className={`text-[10px] px-1.5 py-0 ${
                        hoursStat.consumed > hoursStat.planned
                          ? "bg-destructive/15 text-destructive border border-destructive/30"
                          : hoursStat.consumed > 0
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                          : ""
                      }`}
                      title={
                        hoursStat.hasSubs
                          ? "Consumido automático nas subatividades / planejado"
                          : "Consumido automático / planejado"
                      }
                    >
                      {formatHours(hoursStat.consumed) || "0h"}/{formatHours(hoursStat.planned) || "0h"}
                    </Badge>
                  ) : cardFields.hours && toHoursNumber(activity.hours) > 0 ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {formatHours(toHoursNumber(activity.hours))}
                    </Badge>
                  ) : null}
                  {cardFields.dependencies && dependencyCount && (dependencyCount.pred > 0 || dependencyCount.succ > 0) && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/30 font-semibold"
                      title={`${dependencyCount.pred} predecessora(s) · ${dependencyCount.succ} sucessora(s)`}
                    >
                      🔗 {dependencyCount.pred > 0 && `←${dependencyCount.pred}`}
                      {dependencyCount.pred > 0 && dependencyCount.succ > 0 && " "}
                      {dependencyCount.succ > 0 && `→${dependencyCount.succ}`}
                    </Badge>
                  )}
                  {cardFields.dependencies && relationItems && relationItems.length > 0 ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md text-[10px] font-medium bg-background text-muted-foreground border border-border/60 hover:bg-muted/40 hover:text-foreground transition-colors"
                          title="Gerenciar vínculos"
                        >
                          <Link2 className="w-2.5 h-2.5" strokeWidth={2.25} />
                          {relationItems.length}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="top"
                        align="start"
                        className="w-72 p-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[11px] font-semibold text-foreground">
                            {relationItems.length} {relationItems.length === 1 ? "vínculo" : "vínculos"}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onEdit(); }}
                            className="text-[10px] text-primary hover:underline font-medium"
                            title="Adicionar/editar vínculos na atividade"
                          >
                            + Adicionar
                          </button>
                        </div>
                        <ul className="space-y-1 max-h-64 overflow-auto">
                          {relationItems.map((r) => (
                            <li
                              key={r.relationId}
                              className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted/60"
                            >
                              <span className="font-mono text-[10px] text-muted-foreground/60 shrink-0">
                                #{r.id.slice(0, 6)}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onOpenRelated?.(r.id); }}
                                className="flex-1 min-w-0 text-left text-[11px] text-foreground truncate hover:text-primary hover:underline"
                                title="Abrir atividade vinculada"
                              >
                                {r.title || "(sem título)"}
                              </button>
                              <span className="text-[10px] text-muted-foreground/70 shrink-0 capitalize">
                                {r.relationType.replace(/_/g, " ")}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onRemoveRelation?.(r.relationId); }}
                                className="p-0.5 rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                                title="Remover vínculo"
                              >
                                <XIcon className="w-3 h-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </PopoverContent>
                    </Popover>
                  ) : null}

                  {/* Envelhecimento: há quanto tempo está parado NESTA coluna.
                      A métrica central do Kanban, antes ausente — sem ela um card
                      esquecido há 40 dias parecia igual a um que entrou hoje.
                      Só aparece a partir de 3 dias, para não poluir. */}
                  {(() => {
                    const aging = computeCardAging(activity.stage_entered_at, activity.status);
                    if (!aging) return null;
                    return (
                      <span
                        className={`shrink-0 inline-flex items-center gap-0.5 text-[10px] tabular-nums ${CARD_AGING_CLASSES[aging.tone]}`}
                        title={`Há ${aging.days} dia(s) nesta coluna`}
                      >
                        <Hourglass className="w-2.5 h-2.5" /> {aging.label}
                      </span>
                    );
                  })()}

                  {/* Discussão e anexos: sinais universais de card (Trello, Jira,
                      Asana, Notion todos exibem). Sempre visíveis — é presença de
                      conteúdo, não preferência de campo. */}
                  {commentCount && commentCount > 0 ? (
                    <span
                      className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground tabular-nums"
                      title={`${commentCount} ${commentCount === 1 ? "comentário" : "comentários"}`}
                    >
                      <MessageSquare className="w-2.5 h-2.5" /> {commentCount}
                    </span>
                  ) : null}
                  {attachmentCount && attachmentCount > 0 ? (
                    <span
                      className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground tabular-nums"
                      title={`${attachmentCount} ${attachmentCount === 1 ? "anexo" : "anexos"}`}
                    >
                      <Paperclip className="w-2.5 h-2.5" /> {attachmentCount}
                    </span>
                  ) : null}

                  {/* Prazo por ÚLTIMO e com ml-auto: ancora na borda direita do
                      card, fechando a linha que o avatar abre à esquerda — é o
                      que elimina a faixa vazia. Texto tabular, sem moldura nem
                      emoji; o atraso se lê pela cor. */}
                  {cardFields.dueDate && activity.end_date && (
                    <span
                      className={`ml-auto shrink-0 inline-flex items-center gap-1 text-[11px] tabular-nums ${
                        isOverdue ? "text-destructive font-semibold" : "text-muted-foreground"
                      }`}
                      title={`Prazo: ${formatarDataBR(activity.end_date)}`}
                    >
                      {isOverdue && <AlertCircle className="w-2.5 h-2.5" />}
                      {formatarDiaMes(activity.end_date)}
                    </span>
                  )}
                </div>
                {(isPhase || cardFields.subCount) && subActivityCount && subActivityCount > 0 ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }}
                    className="flex items-center gap-1 mt-1.5 text-[10px] font-medium text-primary hover:text-primary/80 hover:underline transition-colors"
                    title={isExpanded ? "Recolher subatividades" : "Expandir subatividades"}
                  >
                    {/* O `GitFork` saiu: é o ícone de "ramificar repositório",
                        do vocabulário do Git, e não significava nada aqui.
                        Disputava 90px com a seta e o texto, que já dizem tudo —
                        a seta que expande, o número quantas. */}
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    <span>{subActivityCount} {subActivityCount === 1 ? "subatividade" : "subatividades"}</span>
                  </button>
                ) : null}
                {cardFields.subSummary && subActivityStatusSummary && (subActivityStatusSummary.completed > 0 || subActivityStatusSummary.pending > 0) ? (
                  <Badge
                    variant="outline"
                    className="mt-1 text-[10px] px-1.5 py-0 bg-muted/40 border-border/60 text-muted-foreground"
                    title="Resumo das subatividades"
                  >
                    Subs: {subActivityStatusSummary.completed} concluidas / {subActivityStatusSummary.pending} pendentes
                  </Badge>
                ) : null}
              </div>
            </div>

          </div>
        </TooltipTrigger>
        {/* Com o menu aberto o tooltip do card so atrapalha: o ponteiro esta
            sobre as opcoes, nao sobre o card. */}
        {!menuOpen && (
          <TooltipContent side="right" className="max-w-[280px] space-y-1 text-xs">
            {tooltipLines.map((line, i) => (
              <p key={i} className={i === 0 ? "font-semibold" : "text-muted-foreground"}>{line}</p>
            ))}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

// Blindagem (Fase 4): o card e puro em relacao as props — memo corta a
// re-renderizacao em cascata do quadro inteiro a cada tecla na busca.
export const KanbanCard = memo(KanbanCardBase);
