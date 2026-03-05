import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

interface SortableActivityCardProps {
  id: string;
  children: React.ReactNode;
}

export const SortableActivityCard = ({ id, children }: SortableActivityCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={`relative ${isDragging ? "ring-2 ring-primary rounded-lg" : ""}`}>
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
