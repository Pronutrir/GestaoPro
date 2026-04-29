import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Filter, X, Calendar, Tag, Users, AlertTriangle, GitBranch, Activity, Flag, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export type CronogramaFiltersState = {
  phaseIds: string[];
  responsibles: string[];
  sectors: string[];
  statuses: string[];          // pending | in_progress | completed
  progressBucket: "all" | "0-25" | "26-75" | "76-100";
  priorities: string[];        // baixa | media | alta | critica | urgente
  gutMin: number | null;
  gutMax: number | null;
  datePreset: "all" | "week" | "month" | "next30" | "overdue" | "custom";
  dateFrom: string | null;
  dateTo: string | null;
  criticalOnly: boolean;
  slackMax: number | null;
  milestonesOnly: boolean;
  linkTypes: string[];         // finish_to_start, etc.
  hasLag: boolean;
  tags: string[];
  workflowStageIds: string[];
};

export const DEFAULT_FILTERS: CronogramaFiltersState = {
  phaseIds: [],
  responsibles: [],
  sectors: [],
  statuses: [],
  progressBucket: "all",
  priorities: [],
  gutMin: null,
  gutMax: null,
  datePreset: "all",
  dateFrom: null,
  dateTo: null,
  criticalOnly: false,
  slackMax: null,
  milestonesOnly: false,
  linkTypes: [],
  hasLag: false,
  tags: [],
  workflowStageIds: [],
};

type Option = { value: string; label: string };

type Props = {
  value: CronogramaFiltersState;
  onChange: (v: CronogramaFiltersState) => void;
  phaseOptions: Option[];
  responsibleOptions: Option[];
  sectorOptions: Option[];
  tagOptions: Option[];
  workflowStageOptions: Option[];
};

const STATUS_OPTS: Option[] = [
  { value: "pending", label: "Pendente" },
  { value: "in_progress", label: "Em andamento" },
  { value: "completed", label: "Concluído" },
];
const PRIORITY_OPTS: Option[] = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "critica", label: "Crítica" },
  { value: "urgente", label: "Urgente" },
];
const LINK_OPTS: Option[] = [
  { value: "finish_to_start", label: "TI · Término-Início" },
  { value: "start_to_start", label: "II · Início-Início" },
  { value: "finish_to_finish", label: "TT · Término-Término" },
  { value: "start_to_finish", label: "IT · Início-Término" },
];

function MultiSelectPopover({
  label, icon: Icon, options, selected, onChange, emptyLabel = "Nenhum",
}: {
  label: string;
  icon: any;
  options: Option[];
  selected: string[];
  onChange: (v: string[]) => void;
  emptyLabel?: string;
}) {
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("gap-2 h-9", selected.length && "border-primary text-primary")}>
          <Icon className="h-4 w-4" />
          {label}
          {selected.length > 0 && <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">{selected.length}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="max-h-64 overflow-auto space-y-1">
          {options.length === 0 && <div className="text-xs text-muted-foreground p-2">{emptyLabel}</div>}
          {options.map(opt => (
            <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
              <Checkbox checked={selected.includes(opt.value)} onCheckedChange={() => toggle(opt.value)} />
              <span className="text-sm truncate">{opt.label}</span>
            </label>
          ))}
        </div>
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" className="w-full mt-2 h-8 text-xs" onClick={() => onChange([])}>
            Limpar seleção
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function CronogramaFilters({
  value, onChange,
  phaseOptions, responsibleOptions, sectorOptions, tagOptions, workflowStageOptions,
}: Props) {
  const set = (patch: Partial<CronogramaFiltersState>) => onChange({ ...value, ...patch });

  const activeCount = useMemo(() => {
    let c = 0;
    if (value.phaseIds.length) c++;
    if (value.responsibles.length) c++;
    if (value.sectors.length) c++;
    if (value.statuses.length) c++;
    if (value.progressBucket !== "all") c++;
    if (value.priorities.length) c++;
    if (value.gutMin != null || value.gutMax != null) c++;
    if (value.datePreset !== "all") c++;
    if (value.criticalOnly || value.slackMax != null || value.milestonesOnly) c++;
    if (value.linkTypes.length || value.hasLag) c++;
    if (value.tags.length) c++;
    if (value.workflowStageIds.length) c++;
    return c;
  }, [value]);

  return (
    <div className="border rounded-lg bg-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Filtros</span>
          {activeCount > 0 && <Badge variant="secondary" className="text-[10px]">{activeCount} ativo(s)</Badge>}
        </div>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULT_FILTERS)} className="h-8 gap-1 text-xs">
            <X className="h-3 w-3" /> Limpar todos
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectPopover label="Fase / EAP" icon={Layers} options={phaseOptions}
          selected={value.phaseIds} onChange={(v) => set({ phaseIds: v })} />

        <MultiSelectPopover label="Responsável" icon={Users} options={responsibleOptions}
          selected={value.responsibles} onChange={(v) => set({ responsibles: v })} />

        <MultiSelectPopover label="Setor" icon={Users} options={sectorOptions}
          selected={value.sectors} onChange={(v) => set({ sectors: v })} />

        <MultiSelectPopover label="Status" icon={Activity} options={STATUS_OPTS}
          selected={value.statuses} onChange={(v) => set({ statuses: v })} />

        <Select value={value.progressBucket} onValueChange={(v: any) => set({ progressBucket: v })}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Progresso" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">% qualquer</SelectItem>
            <SelectItem value="0-25">0–25%</SelectItem>
            <SelectItem value="26-75">26–75%</SelectItem>
            <SelectItem value="76-100">76–100%</SelectItem>
          </SelectContent>
        </Select>

        <MultiSelectPopover label="Prioridade" icon={Flag} options={PRIORITY_OPTS}
          selected={value.priorities} onChange={(v) => set({ priorities: v })} />

        {/* GUT range */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("gap-2 h-9",
              (value.gutMin != null || value.gutMax != null) && "border-primary text-primary")}>
              <Flag className="h-4 w-4" /> GUT
              {(value.gutMin != null || value.gutMax != null) && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                  {value.gutMin ?? 0}–{value.gutMax ?? 125}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3 space-y-2" align="start">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Mín</Label>
                <Input type="number" min={0} max={125} value={value.gutMin ?? ""} className="h-8"
                  onChange={(e) => set({ gutMin: e.target.value ? +e.target.value : null })} />
              </div>
              <div>
                <Label className="text-xs">Máx</Label>
                <Input type="number" min={0} max={125} value={value.gutMax ?? ""} className="h-8"
                  onChange={(e) => set({ gutMax: e.target.value ? +e.target.value : null })} />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Período */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("gap-2 h-9",
              value.datePreset !== "all" && "border-primary text-primary")}>
              <Calendar className="h-4 w-4" /> Período
              {value.datePreset !== "all" && <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">{value.datePreset}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3 space-y-2" align="start">
            <Select value={value.datePreset} onValueChange={(v: any) => set({ datePreset: v })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Qualquer data</SelectItem>
                <SelectItem value="week">Esta semana</SelectItem>
                <SelectItem value="month">Este mês</SelectItem>
                <SelectItem value="next30">Próximos 30 dias</SelectItem>
                <SelectItem value="overdue">Atrasadas</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
            {value.datePreset === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">De</Label>
                  <Input type="date" value={value.dateFrom ?? ""} className="h-8"
                    onChange={(e) => set({ dateFrom: e.target.value || null })} />
                </div>
                <div>
                  <Label className="text-xs">Até</Label>
                  <Input type="date" value={value.dateTo ?? ""} className="h-8"
                    onChange={(e) => set({ dateTo: e.target.value || null })} />
                </div>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Caminho crítico / Folga / Marcos */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("gap-2 h-9",
              (value.criticalOnly || value.slackMax != null || value.milestonesOnly) && "border-primary text-primary")}>
              <AlertTriangle className="h-4 w-4" /> Crítico / Folga
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3 space-y-3" align="start">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={value.criticalOnly} onCheckedChange={(c) => set({ criticalOnly: !!c })} />
              Apenas caminho crítico (folga = 0)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={value.milestonesOnly} onCheckedChange={(c) => set({ milestonesOnly: !!c })} />
              Apenas marcos (milestones)
            </label>
            <div>
              <Label className="text-xs">Folga máxima (dias)</Label>
              <Input type="number" min={0} value={value.slackMax ?? ""} className="h-8"
                placeholder="ex.: 3"
                onChange={(e) => set({ slackMax: e.target.value ? +e.target.value : null })} />
            </div>
          </PopoverContent>
        </Popover>

        {/* Vínculos */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("gap-2 h-9",
              (value.linkTypes.length || value.hasLag) && "border-primary text-primary")}>
              <GitBranch className="h-4 w-4" /> Vínculos
              {value.linkTypes.length > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">{value.linkTypes.length}</Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3 space-y-2" align="start">
            <div className="space-y-1">
              {LINK_OPTS.map(o => (
                <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={value.linkTypes.includes(o.value)}
                    onCheckedChange={(c) => set({
                      linkTypes: c ? [...value.linkTypes, o.value] : value.linkTypes.filter(x => x !== o.value)
                    })}
                  />
                  {o.label}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer pt-2 border-t">
              <Checkbox checked={value.hasLag} onCheckedChange={(c) => set({ hasLag: !!c })} />
              Apenas com lag (atraso/antecipação)
            </label>
          </PopoverContent>
        </Popover>

        <MultiSelectPopover label="Tags" icon={Tag} options={tagOptions}
          selected={value.tags} onChange={(v) => set({ tags: v })} emptyLabel="Sem tags" />

        <MultiSelectPopover label="Etapa Workflow" icon={Activity} options={workflowStageOptions}
          selected={value.workflowStageIds} onChange={(v) => set({ workflowStageIds: v })} />
      </div>
    </div>
  );
}
