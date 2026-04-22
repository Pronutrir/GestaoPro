import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

interface SortableActivityCardProps {
  id: string;
  children: React.ReactNode;
  colorTag?: string | null;
  isCritical?: boolean;
}

export const SortableActivityCard = ({ id, children, colorTag, isCritical }: SortableActivityCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const accent = isCritical ? "hsl(45, 93%, 47%)" : colorTag;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
    borderLeft: accent ? `3px solid ${accent}` : undefined,
    paddingLeft: accent ? "0.25rem" : undefined,
    borderRadius: accent ? "0.375rem" : undefined,
    boxShadow: isCritical ? "0 0 0 1px hsl(45, 93%, 47% / 0.4)" : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={`relative ${isDragging ? "ring-2 ring-primary rounded-lg" : ""}`} title={isCritical ? "⚠ Caminho Crítico" : undefined}>
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="absolute left-1 top-4 cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded touch-none z-10"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </button>
      <div className="pl-6">
        {children}
      </div>
    </div>
  );
};
