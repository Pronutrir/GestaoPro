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
}

interface DeliveryPackagesManagerProps {
  projectId: string;
  activities: Activity[];
}

const STATUS_MAP: Record<string, { label: string; class: string }> = {
  planned: { label: "Planejado", class: "bg-muted text-muted-foreground" },
  in_progress: { label: "Em Andamento", class: "bg-primary/20 text-primary border-primary/30" },
  delivered: { label: "Entregue", class: "bg-success/20 text-success border-success/30" },
  delayed: { label: "Atrasado", class: "bg-destructive/20 text-destructive border-destructive/30" },
};

export const DeliveryPackagesManager = ({ projectId, activities }: DeliveryPackagesManagerProps) => {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [packages, setPackages] = useState<DeliveryPackage[]>([]);
  const [packageActivities, setPackageActivities] = useState<Record<string, string[]>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sector, setSector] = useState("");
  const [responsible, setResponsible] = useState("");
  const [status, setStatus] = useState("planned");
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);

  const fetchData = async () => {
    const [{ data: pkgs }, { data: links }, { data: sects }] = await Promise.all([
      supabase.from("delivery_packages").select("*").eq("project_id", projectId).order("start_date"),
      supabase.from("delivery_package_activities").select("package_id, activity_id"),
      supabase.from("sectors").select("id, name").order("name"),
    ]);
    if (pkgs) setPackages(pkgs);
    if (sects) setSectors(sects);
    if (links) {
      const map: Record<string, string[]> = {};
      links.forEach(l => { if (!map[l.package_id]) map[l.package_id] = []; map[l.package_id].push(l.activity_id); });
      setPackageActivities(map);
    }
  };

  useEffect(() => { fetchData(); }, [projectId]);

  const resetForm = () => {
    setTitle(""); setDescription(""); setStartDate(""); setEndDate("");
    setSector(""); setResponsible(""); setStatus("planned"); setSelectedActivities([]);
    setEditingId(null); setShowForm(false);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    const payload = {
      project_id: projectId, title, description: description || null,
      start_date: startDate || null, end_date: endDate || null,
      sector: sector || null, responsible: responsible || null, status,
    };

    let pkgId = editingId;
    if (editingId) {
      const { error } = await supabase.from("delivery_packages").update(payload).eq("id", editingId);
      if (error) { toast({ title: "Erro ao atualizar", variant: "destructive" }); return; }
    } else {
      const { data, error } = await supabase.from("delivery_packages").insert(payload).select("id").single();
      if (error) { toast({ title: "Erro ao criar", variant: "destructive" }); return; }
      pkgId = data.id;
    }

    // Sync activities
    if (pkgId) {
      await supabase.from("delivery_package_activities").delete().eq("package_id", pkgId);
      if (selectedActivities.length > 0) {
        await supabase.from("delivery_package_activities").insert(
          selectedActivities.map(aId => ({ package_id: pkgId!, activity_id: aId }))
        );
      }
    }

    toast({ title: editingId ? "Pacote atualizado!" : "Pacote criado!" });
    resetForm(); fetchData();
  };

  const handleEdit = (pkg: DeliveryPackage) => {
    setEditingId(pkg.id); setTitle(pkg.title); setDescription(pkg.description || "");
    setStartDate(pkg.start_date || ""); setEndDate(pkg.end_date || "");
    setSector(pkg.sector || ""); setResponsible(pkg.responsible || ""); setStatus(pkg.status);
    setSelectedActivities(packageActivities[pkg.id] || []); setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este pacote?")) return;
    await supabase.from("delivery_packages").delete().eq("id", id);
    toast({ title: "Pacote excluído!" }); fetchData();
  };

  const toggleActivity = (actId: string) => {
    setSelectedActivities(prev =>
      prev.includes(actId) ? prev.filter(a => a !== actId) : [...prev, actId]
    );
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
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
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
            <Button size="sm" onClick={handleSave}>{editingId ? "Atualizar" : "Criar"}</Button>
            <Button size="sm" variant="outline" onClick={resetForm}>Cancelar</Button>
          </div>
        </Card>
      )}

      {packages.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum pacote de entregas cadastrado.</p>
      ) : (
        <div className="space-y-2">
          {packages.map(pkg => (
            <Card key={pkg.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium text-foreground">{pkg.title}</p>
                  {pkg.description && <p className="text-xs text-muted-foreground">{pkg.description}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Badge className={STATUS_MAP[pkg.status]?.class}>{STATUS_MAP[pkg.status]?.label}</Badge>
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
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => handleEdit(pkg)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(pkg.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
