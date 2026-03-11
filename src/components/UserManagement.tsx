import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, Shield, User, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface Profile {
  id: string;
  email: string;
  full_name: string;
  sector: string | null;
  role_title: string | null;
  avatar_url: string | null;
}

interface UserRole {
  user_id: string;
  role: string;
}

interface Sector {
  id: string;
  name: string;
}

export const UserManagement = () => {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    sector: "",
    role_title: "",
    role: "user",
  });
  const [editForm, setEditForm] = useState({
    full_name: "",
    sector: "",
    role_title: "",
    role: "user",
    new_password: "",
  });

  const fetchData = async () => {
    const [{ data: profilesData }, { data: rolesData }, { data: sectorsData }] = await Promise.all([
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("sectors").select("id, name").order("name"),
    ]);
    if (profilesData) setProfiles(profilesData);
    if (rolesData) setRoles(rolesData as UserRole[]);
    if (sectorsData) setSectors(sectorsData);
  };

  useEffect(() => { fetchData(); }, []);

  const getUserRole = (userId: string) => {
    const r = roles.find((r) => r.user_id === userId);
    return r?.role || "user";
  };

  const handleCreate = async () => {
    if (!form.email || !form.password || !form.full_name) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: form,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Usuário criado!", description: `${form.full_name} foi adicionado.` });
      setForm({ email: "", password: "", full_name: "", sector: "", role_title: "", role: "user" });
      setOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ title: "Erro ao criar usuário", description: error.message, variant: "destructive" });
    }
    setIsLoading(false);
  };

  const handleStartEdit = (profile: Profile) => {
    setEditingUser(profile);
    setEditForm({
      full_name: profile.full_name || "",
      sector: profile.sector || "",
      role_title: profile.role_title || "",
      role: getUserRole(profile.id),
      new_password: "",
    });
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingUser) return;
    setIsLoading(true);
    try {
      const body: any = {
        target_user_id: editingUser.id,
        full_name: editForm.full_name,
        sector: editForm.sector,
        role_title: editForm.role_title,
        role: editForm.role,
      };
      if (editForm.new_password.trim()) {
        body.new_password = editForm.new_password;
      }
      const { data, error } = await supabase.functions.invoke("admin-update-user", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Usuário atualizado!" });
      setEditOpen(false);
      setEditingUser(null);
      fetchData();
    } catch (error: any) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    }
    setIsLoading(false);
  };

  if (!isAdmin) return null;

  const SectorSelect = ({ value, onValueChange }: { value: string; onValueChange: (v: string) => void }) => (
    <Select value={value || "_none"} onValueChange={(v) => onValueChange(v === "_none" ? "" : v)}>
      <SelectTrigger><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="_none">Nenhum</SelectItem>
        {sectors.map((s) => (
          <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Usuários
            </CardTitle>
            <CardDescription>Gerencie os usuários que têm acesso ao sistema.</CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1">
                <Plus className="w-4 h-4" /> Novo Usuário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Novo Usuário</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Nome Completo *</Label>
                  <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="João Silva" />
                </div>
                <div className="grid gap-2">
                  <Label>Email *</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="joao@empresa.com" />
                </div>
                <div className="grid gap-2">
                  <Label>Senha *</Label>
                  <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Setor</Label>
                    <SectorSelect value={form.sector} onValueChange={(v) => setForm({ ...form, sector: v })} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Cargo</Label>
                    <Input value={form.role_title} onChange={(e) => setForm({ ...form, role_title: e.target.value })} placeholder="Gerente" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Perfil de Acesso</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="user">Usuário</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate} disabled={isLoading}>
                  {isLoading ? "Criando..." : "Criar Usuário"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {profiles.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum usuário cadastrado.</p>
        ) : (
          <div className="space-y-3">
            {profiles.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/20 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    {getUserRole(p.id) === "admin" ? (
                      <Shield className="w-5 h-5 text-primary" />
                    ) : (
                      <User className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{p.full_name || "Sem nome"}</p>
                    <p className="text-sm text-muted-foreground">{p.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p.role_title && <span className="text-sm text-muted-foreground">{p.role_title}</span>}
                  {p.sector && <Badge variant="outline">{p.sector}</Badge>}
                  <Badge variant={getUserRole(p.id) === "admin" ? "default" : "secondary"}>
                    {getUserRole(p.id) === "admin" ? "Admin" : "Usuário"}
                  </Badge>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStartEdit(p)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="grid gap-4 py-4">
              <p className="text-sm text-muted-foreground">{editingUser.email}</p>
              <div className="grid gap-2">
                <Label>Nome Completo</Label>
                <Input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Setor</Label>
                  <SectorSelect value={editForm.sector} onValueChange={(v) => setEditForm({ ...editForm, sector: v })} />
                </div>
                <div className="grid gap-2">
                  <Label>Cargo</Label>
                  <Input value={editForm.role_title} onChange={(e) => setEditForm({ ...editForm, role_title: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Perfil de Acesso</Label>
                <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="user">Usuário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Nova Senha (deixe vazio para não alterar)</Label>
                <Input type="password" value={editForm.new_password} onChange={(e) => setEditForm({ ...editForm, new_password: e.target.value })} placeholder="Nova senha..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdate} disabled={isLoading}>
              {isLoading ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
