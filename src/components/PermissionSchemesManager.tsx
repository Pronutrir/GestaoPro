import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Plus, X, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface PermissionScheme {
  id: string;
  name: string;
  description: string | null;
  access_level: "viewer" | "commenter" | "contributor";
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_move: boolean;
  is_system: boolean;
}

const emptyForm = {
  name: "",
  description: "",
  access_level: "contributor" as const,
  can_create: false,
  can_edit: false,
  can_delete: false,
  can_move: false,
};

export const PermissionSchemesManager = () => {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [schemes, setSchemes] = useState<PermissionScheme[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<typeof emptyForm>({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const fetchSchemes = async () => {
    const { data } = await supabase.from("permission_schemes").select("*").order("is_system", { ascending: false }).order("name");
    if (data) setSchemes(data as any);
  };

  useEffect(() => { fetchSchemes(); }, []);

  if (!isAdmin) return null;

  const isReadOnly = form.access_level !== "contributor";

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Informe um nome", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      access_level: form.access_level,
      can_create: isReadOnly ? false : form.can_create,
      can_edit: isReadOnly ? false : form.can_edit,
      can_delete: isReadOnly ? false : form.can_delete,
      can_move: isReadOnly ? false : form.can_move,
    };
    const { error } = await supabase.from("permission_schemes").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Template criado!" });
      setForm({ ...emptyForm });
      setShowForm(false);
      fetchSchemes();
    }
  };

  const handleDelete = async (s: PermissionScheme) => {
    if (s.is_system) return;
    const { error } = await supabase.from("permission_schemes").delete().eq("id", s.id);
    if (error) toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    else fetchSchemes();
  };

  const flagBadges = (s: PermissionScheme) => {
    if (s.access_level === "viewer") return <Badge variant="outline" className="text-[10px]">Apenas visualiza</Badge>;
    if (s.access_level === "commenter") return <Badge className="text-[10px] bg-primary/10 text-primary border-primary/30">Visualiza + comenta</Badge>;
    const flags = [
      s.can_create && "Criar",
      s.can_edit && "Editar",
      s.can_delete && "Excluir",
      s.can_move && "Mover",
    ].filter(Boolean) as string[];
    return flags.length === 0
      ? <span className="text-xs text-muted-foreground">Sem permissões</span>
      : <span className="text-xs text-muted-foreground">{flags.join(" · ")}</span>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" />
          Templates de Permissão
        </CardTitle>
        <CardDescription>
          Modelos reutilizáveis (ex: Gerente, Desenvolvedor, Revisor) para aplicar em 1 clique ao adicionar membros a um projeto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {schemes.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-3 p-3 rounded border border-border">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{s.name}</span>
                  {s.is_system && (
                    <Badge variant="secondary" className="text-[10px] gap-1"><Lock className="w-3 h-3" />Sistema</Badge>
                  )}
                </div>
                {s.description && <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>}
                <div className="mt-1">{flagBadges(s)}</div>
              </div>
              {!s.is_system && (
                <button onClick={() => handleDelete(s)} className="text-muted-foreground hover:text-destructive p-1">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {!showForm ? (
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> Novo template
          </Button>
        ) : (
          <div className="p-3 rounded border border-primary/30 bg-primary/5 space-y-2">
            <Input
              className="h-9"
              placeholder="Nome do template (ex: QA, Aprovador...)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              className="h-9"
              placeholder="Descrição (opcional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div>
              <Label className="text-xs text-muted-foreground">Nível de acesso</Label>
              <Select value={form.access_level} onValueChange={(v) => setForm({ ...form, access_level: v as any })}>
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contributor">Contribuidor (escreve)</SelectItem>
                  <SelectItem value="commenter">Commenter (vê + comenta)</SelectItem>
                  <SelectItem value="viewer">Viewer (só visualiza)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!isReadOnly && (
              <div className="flex flex-wrap gap-3 pt-1">
                {[
                  { key: "can_create", label: "Criar" },
                  { key: "can_edit", label: "Editar" },
                  { key: "can_delete", label: "Excluir" },
                  { key: "can_move", label: "Mover" },
                ].map((p) => (
                  <label key={p.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox
                      checked={(form as any)[p.key]}
                      onCheckedChange={(v) => setForm({ ...form, [p.key]: !!v })}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar template"}</Button>
              <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setForm({ ...emptyForm }); }}>Cancelar</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
