import { Calendar as CalendarIcon, X, Filter } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface CalendarFiltersValue {
  projects: string[];
  phases: string[];
  owners: string[];
  participants: string[];
  statuses: string[];
  priorities: string[];
  tags: string[];
  workflowStages: string[];
  dateFrom?: Date;
  dateTo?: Date;
  search: string;
}

export interface FilterOption { value: string; label: string; }

interface Props {
  value: CalendarFiltersValue;
  onChange: (v: CalendarFiltersValue) => void;
  options: {
    projects?: FilterOption[];
    phases: FilterOption[];
    owners: FilterOption[];
    participants: FilterOption[];
    statuses: FilterOption[];
    priorities: FilterOption[];
    tags: FilterOption[];
    workflowStages: FilterOption[];
  };
  showProjectFilter?: boolean;
}

export const emptyFilters = (): CalendarFiltersValue => ({
  projects: [], phases: [], owners: [], participants: [],
  statuses: [], priorities: [], tags: [], workflowStages: [],
  dateFrom: undefined, dateTo: undefined, search: "",
});

const MultiSelect = ({ label, options, selected, onToggle }: {
  label: string; options: FilterOption[]; selected: string[]; onToggle: (v: string) => void;
}) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline" size="sm" className="h-8 justify-between gap-2 text-xs">
        <span className="truncate">{label}{selected.length > 0 && ` (${selected.length})`}</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-64 p-0" align="start">
      <ScrollArea className="max-h-72">
        <div className="p-2 space-y-1">
          {options.length === 0 && <div className="text-xs text-muted-foreground p-2">Sem opções</div>}
          {options.map(o => (
            <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
              <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => onToggle(o.value)} />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      </ScrollArea>
    </PopoverContent>
  </Popover>
);

export const CalendarFilters = ({ value, onChange, options, showProjectFilter }: Props) => {
  const toggle = (key: keyof CalendarFiltersValue, v: string) => {
    const arr = (value[key] as string[]) || [];
    onChange({ ...value, [key]: arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v] });
  };
  const activeCount =
    value.projects.length + value.phases.length + value.owners.length + value.participants.length +
    value.statuses.length + value.priorities.length + value.tags.length + value.workflowStages.length +
    (value.dateFrom ? 1 : 0) + (value.dateTo ? 1 : 0) + (value.search ? 1 : 0);

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Filter className="w-4 h-4 text-primary" /> Filtros
          {activeCount > 0 && <Badge variant="secondary" className="text-xs">{activeCount}</Badge>}
        </div>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange(emptyFilters())}>
            <X className="w-3 h-3 mr-1" /> Limpar
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="🔍 Buscar título..." value={value.search}
          onChange={e => onChange({ ...value, search: e.target.value })}
          className="h-8 text-xs w-48" />

        {showProjectFilter && options.projects && (
          <MultiSelect label="Projeto" options={options.projects} selected={value.projects} onToggle={v => toggle("projects", v)} />
        )}
        <MultiSelect label="Fase" options={options.phases} selected={value.phases} onToggle={v => toggle("phases", v)} />
        <MultiSelect label="Líder" options={options.owners} selected={value.owners} onToggle={v => toggle("owners", v)} />
        <MultiSelect label="Participantes" options={options.participants} selected={value.participants} onToggle={v => toggle("participants", v)} />
        <MultiSelect label="Status" options={options.statuses} selected={value.statuses} onToggle={v => toggle("statuses", v)} />
        <MultiSelect label="Prioridade" options={options.priorities} selected={value.priorities} onToggle={v => toggle("priorities", v)} />
        <MultiSelect label="Coluna" options={options.workflowStages} selected={value.workflowStages} onToggle={v => toggle("workflowStages", v)} />
        <MultiSelect label="Tags" options={options.tags} selected={value.tags} onToggle={v => toggle("tags", v)} />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-2 text-xs">
              <CalendarIcon className="w-3 h-3" />
              {value.dateFrom ? format(value.dateFrom, "dd/MM", { locale: ptBR }) : "De"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={value.dateFrom} onSelect={d => onChange({ ...value, dateFrom: d })} className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-2 text-xs">
              <CalendarIcon className="w-3 h-3" />
              {value.dateTo ? format(value.dateTo, "dd/MM", { locale: ptBR }) : "Até"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={value.dateTo} onSelect={d => onChange({ ...value, dateTo: d })} className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>
      </div>
    </Card>
  );
};
