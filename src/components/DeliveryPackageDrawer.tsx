import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, Eye, Pencil, CheckCircle2, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DeliveryPackage {
  id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  sector: string | null;
  responsible: string | null;
  status: string;
  created_at: string;
}

interface WorkflowStage {
  id: string;
  title: string;
  display_order: number;
  color: string;
}

interface Activity {
  id: string;
  title: string;
  status?: string;
  workflow_stage_id?: string | null;
  created_at?: string;
  completed_at?: string | null;
}

interface DeliveryPackageDrawerProps {
  pkg: DeliveryPackage | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  activities: Activity[];
  onDataChanged: () => void;
  canManagePackage?: boolean;
}

export const DeliveryPackageDrawer = ({
  pkg,
  open,
  onOpenChange,
  projectId,
  activities,
  onDataChanged,
  canManagePackage = false,
}: DeliveryPackageDrawerProps) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("view");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sector, setSector] = useState("");
  const [responsible, setResponsible] = useState("");
  const [status, setStatus] = useState("");
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [linkedActivityIds, setLinkedActivityIds] = useState<string[]>([]);
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<WorkflowStage[]>([]);

  useEffect(() => {
    if (pkg && open) {
      setTitle(pkg.title);
      setDescription(pkg.description || "");
      setStartDate(pkg.start_date || "");
      setEndDate(pkg.end_date || "");
      setSector(pkg.sector || "");
      setResponsible(pkg.responsible || "");
      setStatus(pkg.status);
      fetchLinkedActivities();
    }
  }, [pkg, open]);

  useEffect(() => {
    if (open && projectId) {
      Promise.all([
        supabase.from("sectors").select("id, name").order("name"),
        supabase.from("workflow_stages").select("id, title, display_order, color").eq("project_id", projectId).order("display_order"),
      ]).then(([{ data: sects }, { data: stgs }]) => {
        if (sects) setSectors(sects);
        if (stgs) setStages(stgs);
      });
    }
  }, [open, projectId]);

  const fetchLinkedActivities = async () => {
    if (!pkg) return;
    const { data } = await supabase
      .from("delivery_package_activities")
      .select("activity_id")
      .eq("package_id", pkg.id);
    const ids = data?.map((d) => d.activity_id) || [];
    setLinkedActivityIds(ids);
    setSelectedActivities(ids);
  };

  const linkedActivities = activities
    .filter((a) => linkedActivityIds.includes(a.id))
    .sort((a, b) => {
      // Descending by creation/completion
      const dateA = a.completed_at || a.created_at || "";
      const dateB = b.completed_at || b.created_at || "";
      return dateB.localeCompare(dateA);
    });

  const getStageForActivity = (activity: Activity) => {
    if (!activity.workflow_stage_id) return null;
    return stages.find((s) => s.id === activity.workflow_stage_id);
  };

  const getStageLabel = (statusValue: string) => {
    const stage = stages.find((s) => s.id === statusValue);
    return stage ? stage.title : statusValue;
  };

  const toggleActivity = (actId: string) => {
    setSelectedActivities((prev) =>
      prev.includes(actId) ? prev.filter((a) => a !== actId) : [...prev, actId]
    );
  };

  const handleSave = async () => {
    if (!pkg || !title.trim()) return;
    const { error } = await supabase
      .from("delivery_packages")
      .update({
        title,
        description: description || null,
        start_date: startDate || null,
        end_date: endDate || null,
        sector: sector || null,
        responsible: responsible || null,
        status,
      })
      .eq("id", pkg.id);

    if (error) {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
      return;
    }

    // Sync activities
    await supabase.from("delivery_package_activities").delete().eq("package_id", pkg.id);
    if (selectedActivities.length > 0) {
      await supabase.from("delivery_package_activities").insert(
        selectedActivities.map((aId) => ({ package_id: pkg.id, activity_id: aId }))
      );
    }

    // Auto-assign workflow stage to linked activities
    if (status && selectedActivities.length > 0) {
      const stageExists = stages.find((s) => s.id === status);
      if (stageExists) {
        await supabase
          .from("activities")
          .update({ workflow_stage_id: status })
          .in("id", selectedActivities);
      }
    }

    toast({ title: "Pacote de Entregas atualizado!" });
    setLinkedActivityIds(selectedActivities);
    onDataChanged();
    setActiveTab("view");
  };

  if (!pkg) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl w-[95vw] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-lg">{pkg.title}</SheetTitle>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="w-full">
            <TabsTrigger value="view" className="flex-1 gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Visualização
            </TabsTrigger>
            {canManagePackage && (
              <TabsTrigger value="edit" className="flex-1 gap-1.5">
                <Pencil className="w-3.5 h-3.5" /> Edição
              </TabsTrigger>
            )}
          </TabsList>

          {/* View Tab */}
          <TabsContent value="view" className="space-y-4 mt-4">
            {pkg.description && (
              <p className="text-sm text-muted-foreground">{pkg.description}</p>
            )}

            <div className="flex flex-wrap gap-2">
              {status && (
                <Badge className="text-xs">
                  {getStageLabel(status)}
                </Badge>
              )}
              {pkg.sector && <Badge variant="outline">{pkg.sector}</Badge>}
              {pkg.responsible && <Badge variant="outline">👤 {pkg.responsible}</Badge>}
            </div>

            {(pkg.start_date || pkg.end_date) && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {pkg.start_date && new Date(pkg.start_date + "T00:00:00").toLocaleDateString("pt-BR")}
                {pkg.start_date && pkg.end_date && " → "}
                {pkg.end_date && new Date(pkg.end_date + "T00:00:00").toLocaleDateString("pt-BR")}
              </p>
            )}

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">
                Atividades Vinculadas ({linkedActivities.length})
              </h4>
              {linkedActivities.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma atividade vinculada.</p>
              ) : (
                <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                  {linkedActivities.map((a) => {
                    const stage = getStageForActivity(a);
                    return (
                      <div
                        key={a.id}
                        className="flex items-center gap-2 p-2 bg-muted/30 rounded-md border border-border/50"
                      >
                        {a.status === "completed" ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                        ) : (
                          <Circle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        )}
                        <span className={`text-xs flex-1 truncate ${a.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {a.title}
                        </span>
                        {stage && (
                          <Badge
                            variant="outline"
                            className="text-[10px] shrink-0"
                            style={{ borderColor: stage.color, color: stage.color }}
                          >
                            {stage.title}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Edit Tab */}
          {canManagePackage && (
            <TabsContent value="edit" className="space-y-3 mt-4">
              <Input placeholder="Título *" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Textarea placeholder="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Início</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Fim</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Select value={sector} onValueChange={setSector}>
                  <SelectTrigger><SelectValue placeholder="Setor" /></SelectTrigger>
                  <SelectContent>
                    {sectors.map((s) => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input placeholder="Responsável" value={responsible} onChange={(e) => setResponsible(e.target.value)} />
              </div>

              {/* Status = Workflow Stage */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Status (Etapa do Workflow)</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue placeholder="Selecionar etapa" /></SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Activities */}
              {activities.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">
                    Atividades vinculadas ({selectedActivities.length})
                  </Label>
                  <div className="max-h-40 overflow-y-auto border border-border rounded p-2 space-y-1">
                    {activities.map((a) => (
                      <label key={a.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1">
                        <Checkbox
                          checked={selectedActivities.includes(a.id)}
                          onCheckedChange={() => toggleActivity(a.id)}
                        />
                        {a.title}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={handleSave}>Salvar</Button>
                <Button size="sm" variant="outline" onClick={() => setActiveTab("view")}>Cancelar</Button>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};
