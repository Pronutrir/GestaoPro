import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, Package, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { DeliveryPackageDrawer } from "@/components/DeliveryPackageDrawer";

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

interface Activity {
  id: string;
  title: string;
  status?: string;
  workflow_stage_id?: string | null;
  created_at?: string;
  completed_at?: string | null;
  phase_id?: string | null;
}

interface Phase {
  id: string;
  title: string;
}

interface WorkflowStage {
  id: string;
  title: string;
  display_order: number;
  color: string;
}

interface DeliveryPackagesManagerProps {
  projectId: string;
  activities: Activity[];
  phases?: Phase[];
}

export const DeliveryPackagesManager = ({ projectId, activities }: DeliveryPackagesManagerProps) => {
  const { toast } = useToast();
  const { canManage: isAdmin } = useAuth();
  const [packages, setPackages] = useState<DeliveryPackage[]>([]);
  const [packageActivities, setPackageActivities] = useState<Record<string, string[]>>({});
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sector, setSector] = useState("");
  const [responsible, setResponsible] = useState("");
  const [status, setStatus] = useState("");
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [drawerPkg, setDrawerPkg] = useState<DeliveryPackage | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchData = async () => {
    const [{ data: pkgs }, { data: links }, { data: sects }, { data: stgs }] = await Promise.all([
      supabase.from("delivery_packages").select("*").eq("project_id", projectId).order("start_date"),
      supabase.from("delivery_package_activities").select("package_id, activity_id"),
      supabase.from("sectors").select("id, name").order("name"),
      supabase.from("workflow_stages").select("id, title, display_order, color").eq("project_id", projectId).order("display_order"),
    ]);
    if (pkgs) setPackages(pkgs);
    if (sects) setSectors(sects);
    if (stgs) setStages(stgs);
    if (links) {
      const map: Record<string, string[]> = {};
      links.forEach(l => { if (!map[l.package_id]) map[l.package_id] = []; map[l.package_id].push(l.activity_id); });
      setPackageActivities(map);
    }
  };

  useEffect(() => { fetchData(); }, [projectId]);

  const resetForm = () => {
    setTitle(""); setDescription(""); setStartDate(""); setEndDate("");
    setSector(""); setResponsible(""); setStatus(""); setSelectedActivities([]);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    const payload = {
      project_id: projectId, title, description: description || null,
      start_date: startDate || null, end_date: endDate || null,
      sector: sector || null, responsible: responsible || null, status: status || "planned",
    };

    const { data, error } = await supabase.from("delivery_packages").insert(payload).select().single();
    if (error) { toast({ title: "Erro ao criar", variant: "destructive" }); return; }

    const pkgId = data.id;

    // Sync activities
    if (selectedActivities.length > 0) {
      await supabase.from("delivery_package_activities").insert(
        selectedActivities.map(aId => ({ package_id: pkgId, activity_id: aId }))
      );
      // Auto-assign workflow stage
      if (status) {
        const stageExists = stages.find(s => s.id === status);
        if (stageExists) {
          await supabase.from("activities").update({ workflow_stage_id: status }).in("id", selectedActivities);
        }
      }
    }

    toast({ title: "Pacote de Entregas criado!" });
    resetForm();
    await fetchData();

    // Auto-open drawer after creation
    setDrawerPkg(data);
    setDrawerOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este pacote de entregas?")) return;
    await supabase.from("delivery_packages").delete().eq("id", id);
    toast({ title: "Pacote excluído!" }); fetchData();
  };

  const toggleActivity = (actId: string) => {
    setSelectedActivities(prev =>
      prev.includes(actId) ? prev.filter(a => a !== actId) : [...prev, actId]
    );
  };

  const getStageLabel = (statusValue: string) => {
    const stage = stages.find(s => s.id === statusValue);
    if (stage) return { label: stage.title, color: stage.color };
    // Fallback for legacy status
    const legacy: Record<string, string> = { planned: "Planejado", in_progress: "Em Andamento", delivered: "Entregue", delayed: "Atrasado" };
    return { label: legacy[statusValue] || statusValue, color: undefined };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" /> Pacotes de Entregas ({packages.length})
        </h3>
        {isAdmin && (
          <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Novo Pacote
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="p-4 space-y-3 border-primary/20 bg-primary/5">
          <Input placeholder="Título do pacote *" value={title} onChange={e => setTitle(e.target.value)} />
          <Textarea placeholder="Descrição (opcional)" value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs text-muted-foreground">Início</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
            <div><Label className="text-xs text-muted-foreground">Fim</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Select value={sector} onValueChange={setSector}>
              <SelectTrigger><SelectValue placeholder="Setor" /></SelectTrigger>
              <SelectContent>
                {sectors.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Responsável" value={responsible} onChange={e => setResponsible(e.target.value)} />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {activities.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Atividades vinculadas</Label>
              <div className="max-h-32 overflow-y-auto border border-border rounded p-2 space-y-1">
                {activities.map(a => (
                  <label key={a.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1">
                    <Checkbox checked={selectedActivities.includes(a.id)} onCheckedChange={() => toggleActivity(a.id)} />
                    {a.title}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave}>Criar</Button>
            <Button size="sm" variant="outline" onClick={resetForm}>Cancelar</Button>
          </div>
        </Card>
      )}

      {packages.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum pacote de entregas cadastrado.</p>
      ) : (
        <div className="space-y-2">
          {packages.map(pkg => {
            const stageInfo = getStageLabel(pkg.status);
            return (
              <Card
                key={pkg.id}
                className="p-4 space-y-2 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => { setDrawerPkg(pkg); setDrawerOpen(true); }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium text-foreground">{pkg.title}</p>
                    {pkg.description && <p className="text-xs text-muted-foreground">{pkg.description}</p>}
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={stageInfo.color ? { borderColor: stageInfo.color, color: stageInfo.color } : undefined}
                      >
                        {stageInfo.label}
                      </Badge>
                      {pkg.sector && <Badge variant="outline">{pkg.sector}</Badge>}
                      {pkg.responsible && <Badge variant="outline">👤 {pkg.responsible}</Badge>}
                    </div>
                    {(pkg.start_date || pkg.end_date) && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {pkg.start_date && new Date(pkg.start_date + 'T00:00:00').toLocaleDateString("pt-BR")}
                        {pkg.start_date && pkg.end_date && " → "}
                        {pkg.end_date && new Date(pkg.end_date + 'T00:00:00').toLocaleDateString("pt-BR")}
                      </p>
                    )}
                    {packageActivities[pkg.id]?.length > 0 && (
                      <p className="text-xs text-muted-foreground">{packageActivities[pkg.id].length} atividade(s) vinculada(s)</p>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" onClick={() => { setDrawerPkg(pkg); setDrawerOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(pkg.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <DeliveryPackageDrawer
        pkg={drawerPkg}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        projectId={projectId}
        activities={activities}
        onDataChanged={fetchData}
        isAdmin={isAdmin}
      />
    </div>
  );
};
