import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  rectIntersection,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDroppable,
} from "@dnd-kit/core";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface CscTicket {
  id: string;
  title: string;
  description: string | null;
  service_type: string;
  priority: string;
  requesting_area: string | null;
  sla_deadline: string | null;
  status: string;
  department: string;
  assigned_to: string | null;
  created_at: string;
  resolved_at: string | null;
  requested_date: string | null;
  raci_role: string | null;
  project_id: string | null;
  activity_id: string | null;
  created_by: string | null;
  updated_at: string;
  attachment_url?: string | null;
}

interface StatusObj {
  value: string;
  label: string;
  color: string;
  dot: string;
}

interface CscKanbanBoardProps {
  kanbanStatuses: StatusObj[];
  filteredTickets: CscTicket[];
  getSlaStatus: (ticket: CscTicket) => "green" | "yellow" | "red";
  getDeptLabel: (d: string) => string;
  PriorityBadge: React.ComponentType<{ priority: string }>;
  SlaBadge: React.ComponentType<{ ticket: CscTicket }>;
  onSelectTicket: (ticket: CscTicket) => void;
  onMoveTicket: (ticketId: string, newStatus: string) => void;
}

function DroppableColumn({ statusValue, children, isOver }: { statusValue: string; children: React.ReactNode; isOver?: boolean }) {
  const { setNodeRef, isOver: over } = useDroppable({ id: `csc-stage-${statusValue}` });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px] rounded-b-xl transition-colors ${
        over ? "bg-primary/5 ring-2 ring-primary/20 ring-inset" : ""
      }`}
    >
      {children}
    </div>
  );
}

function SortableCscCard({
  ticket,
  getSlaStatus,
  getDeptLabel,
  PriorityBadge,
  SlaBadge,
  onSelect,
}: {
  ticket: CscTicket;
  getSlaStatus: (t: CscTicket) => "green" | "yellow" | "red";
  getDeptLabel: (d: string) => string;
  PriorityBadge: React.ComponentType<{ priority: string }>;
  SlaBadge: React.ComponentType<{ ticket: CscTicket }>;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ticket.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const slaStatus = getSlaStatus(ticket);
  const cardBorderClass =
    slaStatus === "red"
      ? "border-destructive border-l-[3px] border-l-destructive animate-pulse"
      : slaStatus === "yellow"
        ? "border-amber-400 border-l-[3px] border-l-amber-400"
        : "border-border";

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div
        className={`bg-card border rounded-lg p-2.5 shadow-sm hover:shadow-md transition-all cursor-pointer group ${cardBorderClass}`}
        onClick={onSelect}
      >
        <div className="flex items-start gap-1.5 mb-1">
          <button
            className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground"
            onClick={(e) => e.stopPropagation()}
            {...listeners}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              {ticket.priority === "critical" && <div className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />}
              {ticket.priority === "high" && <div className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />}
              {ticket.priority === "medium" && <div className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />}
              <p className="text-xs font-medium text-foreground line-clamp-2 break-words leading-snug">{ticket.title}</p>
            </div>
            {ticket.description && (
              <p className="text-[11px] text-muted-foreground line-clamp-2 mb-1.5 leading-relaxed">{ticket.description}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mb-1.5">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{getDeptLabel(ticket.department)}</Badge>
          <PriorityBadge priority={ticket.priority} />
          <SlaBadge ticket={ticket} />
        </div>

        <div className="flex items-center justify-between pt-1.5 border-t border-border/50">
          <span className="text-[10px] text-muted-foreground">
            {new Date(ticket.created_at).toLocaleDateString("pt-BR")}
          </span>
          {ticket.assigned_to && (
            <Avatar className="h-5 w-5">
              <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                {ticket.assigned_to.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </div>
  );
}

export function CscKanbanBoard({
  kanbanStatuses,
  filteredTickets,
  getSlaStatus,
  getDeptLabel,
  PriorityBadge,
  SlaBadge,
  onSelectTicket,
  onMoveTicket,
}: CscKanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const ticketId = active.id as string;
    const overId = over.id as string;

    let targetStatus: string | null = null;

    if (overId.startsWith("csc-stage-")) {
      targetStatus = overId.replace("csc-stage-", "");
    } else {
      // Dropped on another ticket - find its status
      const overTicket = filteredTickets.find((t) => t.id === overId);
      if (overTicket) targetStatus = overTicket.status;
    }

    if (!targetStatus) return;

    const draggedTicket = filteredTickets.find((t) => t.id === ticketId);
    if (!draggedTicket || draggedTicket.status === targetStatus) return;

    onMoveTicket(ticketId, targetStatus);
  }, [filteredTickets, onMoveTicket]);

  const activeTicket = activeId ? filteredTickets.find((t) => t.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-1.5 w-full min-h-[calc(100vh-280px)]">
        {kanbanStatuses.map((statusObj) => {
          const columnTickets = filteredTickets.filter((t) => t.status === statusObj.value);
          return (
            <div
              key={statusObj.value}
              className="flex-1 min-w-0 rounded-xl border border-border/50 bg-muted/30 flex flex-col overflow-hidden"
            >
              {/* Column Header */}
              <div className="p-3 border-b border-border/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: statusObj.dot }}
                    />
                    <h3 className="text-sm font-semibold text-foreground truncate">{statusObj.label}</h3>
                  </div>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 min-w-[20px] text-center shrink-0">
                    {columnTickets.length}
                  </Badge>
                </div>
              </div>

              {/* Column Body */}
              <DroppableColumn statusValue={statusObj.value}>
                <SortableContext items={columnTickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  {columnTickets.length === 0 ? (
                    <div className="flex items-center justify-center h-20 border-2 border-dashed border-border/40 rounded-lg">
                      <p className="text-xs text-muted-foreground/50">Arraste aqui</p>
                    </div>
                  ) : (
                    columnTickets.map((ticket) => (
                      <SortableCscCard
                        key={ticket.id}
                        ticket={ticket}
                        getSlaStatus={getSlaStatus}
                        getDeptLabel={getDeptLabel}
                        PriorityBadge={PriorityBadge}
                        SlaBadge={SlaBadge}
                        onSelect={() => onSelectTicket(ticket)}
                      />
                    ))
                  )}
                </SortableContext>
              </DroppableColumn>
            </div>
          );
        })}
      </div>

      <DragOverlay>
        {activeTicket ? (
          <div className="rotate-2 opacity-90 w-[260px]">
            <div className="bg-card border rounded-lg p-2.5 shadow-lg">
              <p className="text-xs font-medium text-foreground">{activeTicket.title}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{getDeptLabel(activeTicket.department)}</Badge>
                <PriorityBadge priority={activeTicket.priority} />
              </div>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
