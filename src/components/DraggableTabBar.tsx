'use client';
import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";

interface TabItem {
  value: string;
  label: string;
  icon: React.ReactNode;
  iconColor?: string;
}

interface DraggableTabBarProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (value: string) => void;
  storageKey: string;
  onRemoveTab?: (value: string) => void;
  removableValues?: string[];
  extraSlot?: React.ReactNode;
  extraSlotPosition?: "left" | "right";
}

function SortableTab({
  tab,
  isActive,
  onClick,
  onRemove,
  canRemove,
}: {
  tab: TabItem;
  isActive: boolean;
  onClick: () => void;
  onRemove?: () => void;
  canRemove?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.value });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group/tab relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium cursor-pointer select-none
        transition-all duration-150 whitespace-nowrap border-b-2
        ${isDragging ? "shadow-md scale-105 bg-muted/40" : ""}
        ${
          isActive
            ? "text-foreground border-foreground"
            : "text-muted-foreground border-transparent hover:text-foreground hover:bg-muted-foreground/20"
        }
      `}
      onClick={onClick}
    >
      <button
        className="cursor-grab active:cursor-grabbing text-current/50 hover:text-current -ml-1"
        onClick={(e) => e.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3 h-3" />
      </button>
      <span className="flex items-center gap-1.5">
        <span className={tab.iconColor ?? ""}>{tab.icon}</span>
        {tab.label}
      </span>
      {canRemove && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-0 group-hover/tab:opacity-100 transition-opacity ml-1 -mr-1 rounded p-0.5 hover:bg-background/50 text-muted-foreground hover:text-foreground"
          aria-label="Remover visualização"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export const DraggableTabBar = ({
  tabs,
  activeTab,
  onTabChange,
  storageKey,
  onRemoveTab,
  removableValues,
  extraSlot,
  extraSlotPosition = "right",
}: DraggableTabBarProps) => {
  const [orderedTabs, setOrderedTabs] = useState<TabItem[]>(tabs);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const order: string[] = JSON.parse(saved);
        // Keep new tabs (not in saved order) at their original position
        const knownValues = new Set(order);
        const newTabs = tabs.filter(t => !knownValues.has(t.value));
        const savedTabs = [...tabs].filter(t => knownValues.has(t.value))
          .sort((a, b) => {
            const iA = order.indexOf(a.value);
            const iB = order.indexOf(b.value);
            return iA - iB;
          });
        // Insert new tabs at their original index positions
        const result = [...savedTabs];
        newTabs.forEach(newTab => {
          const originalIndex = tabs.indexOf(newTab);
          const insertAt = Math.min(originalIndex, result.length);
          result.splice(insertAt, 0, newTab);
        });
        setOrderedTabs(result);
      } catch {
        setOrderedTabs(tabs);
      }
    } else {
      setOrderedTabs(tabs);
    }
  }, [tabs, storageKey]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedTabs.findIndex((t) => t.value === active.id);
    const newIndex = orderedTabs.findIndex((t) => t.value === over.id);
    const reordered = arrayMove(orderedTabs, oldIndex, newIndex);
    setOrderedTabs(reordered);
    localStorage.setItem(storageKey, JSON.stringify(reordered.map((t) => t.value)));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedTabs.map((t) => t.value)} strategy={horizontalListSortingStrategy}>
        <div className="flex gap-1 px-1 border-b border-border/70 overflow-x-auto scrollbar-none -mt-[10px]">
          {extraSlot && extraSlotPosition === "left" && (
            <div className="flex items-center">{extraSlot}</div>
          )}
          {orderedTabs.map((tab) => (
            <SortableTab
              key={tab.value}
              tab={tab}
              isActive={activeTab === tab.value}
              onClick={() => onTabChange(tab.value)}
              canRemove={!!onRemoveTab && (removableValues?.includes(tab.value) ?? true)}
              onRemove={onRemoveTab ? () => onRemoveTab(tab.value) : undefined}
            />
          ))}
          {extraSlot && extraSlotPosition === "right" && (
            <div className="flex items-center">{extraSlot}</div>
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
};
