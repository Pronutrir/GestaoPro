'use client';
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, UserPlus, User, Building2, Plus, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  email: string;
  full_name: string;
  sector: string | null;
  avatar_url?: string | null;
}

interface Scheme {
  id: string;
  name: string;
  description: string | null;
  access_level: "viewer" | "commenter" | "contributor";
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_move: boolean;
}

interface ProjectMember {
  id: string;
  user_id: string;
  sector: string | null;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_move: boolean;
  access_level: "viewer" | "commenter" | "contributor";
  profile?: Profile;
}

interface ProjectMembersManagerProps {
  projectId: string;
}

export const ProjectMembersManager = ({ projectId }: ProjectMembersManagerProps) => {
  const { toast } = useToast();
  const getInitials = (name: string | null | undefined) =>
    (name || "?")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase())
      .join("") || "?";
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [selectedScheme, setSelectedScheme] = useState<string>("");
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedSector, setSelectedSector] = useState("");
  const [selectedAccessLevel, setSelectedAccessLevel] = useState<"viewer" | "commenter" | "contributor">("contributor");
  const [permissions, setPermissions] = useState({
    can_create: false,
    can_edit: false,
    can_delete: false,
    can_move: false,
  });
  const [showNewMember, setShowNewMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberSector, setNewMemberSector] = useState("");
  const [creatingMember, setCreatingMember] = useState(false);

  const fetchData = async () => {
    const [{ data: membersData }, { data: profilesData }, { data: adminRoles }, { data: sectorsData }, { data: schemesData }] = await Promise.all([
      supabase.from("project_members").select("*").eq("project_id", projectId),
      supabase.from("profiles").select("id, email, full_name, sector, avatar_url"),
      supabase.from("user_roles").select("user_id").eq("role", "admin"),
      supabase.from("sectors").select("id, name").order("name"),
      supabase.from("permission_schemes").select("*").order("is_system", { ascending: false }).order("name"),
    ]);
    const adminIds = new Set((adminRoles || []).map(r => r.user_id));

    if (profilesData) setProfiles(profilesData.filter(p => !adminIds.has(p.id)));
    if (sectorsData) setSectors(sectorsData);
    if (schemesData) setSchemes(schemesData as any);

    if (membersData && profilesData) {
      const enriched = membersData.map((m: any) => ({
        ...m,
        profile: profilesData.find((p) => p.id === m.user_id),
      }));
      setMembers(enriched);
    }
  };

  const applyScheme = (schemeId: string) => {
    setSelectedScheme(schemeId);
    const s = schemes.find((x) => x.id === schemeId);
    if (!s) return;
    setSelectedAccessLevel(s.access_level);
    setPermissions({
      can_create: s.can_create,
      can_edit: s.can_edit,
      can_delete: s.can_delete,
      can_move: s.can_move,
    });
  };

  useEffect(() => { fetchData(); }, [projectId]);

  const availableUsers = profiles.filter(
    (p) => !members.some((m) => m.user_id === p.id)
  );

  const handleAdd = async () => {
    if (!selectedUser) return;
    const isReadOnly = selectedAccessLevel !== "contributor";
    const { error } = await supabase.from("project_members").insert({
      project_id: projectId,
      user_id: selectedUser,
      sector: selectedSector || null,
      invitation_status: "accepted",
      responded_at: new Date().toISOString(),
      access_level: selectedAccessLevel,
      can_create: isReadOnly ? false : permissions.can_create,
      can_edit:   isReadOnly ? false : permissions.can_edit,
      can_delete: isReadOnly ? false : permissions.can_delete,
      can_move:   isReadOnly ? false : permissions.can_move,
    });
    if (error) {
      toast({ title: "Erro ao adicionar", description: error.message, variant: "destructive" });
    } else {
      setSelectedUser("");
      setSelectedSector("");
      setSelectedAccessLevel("contributor");
      setSelectedScheme("");
      setPermissions({ can_create: false, can_edit: false, can_delete: false, can_move: false });
      fetchData();
    }
  };

  const handleRemove = async (memberId: string) => {
    await supabase.from("project_members").delete().eq("id", memberId);
    fetchData();
  };

  const handleTogglePermission = async (memberId: string, field: string, value: boolean) => {
    await supabase.from("project_members").update({ [field]: value } as any).eq("id", memberId);
    fetchData();
  };

  const handleChangeAccessLevel = async (memberId: string, level: "viewer" | "commenter" | "contributor") => {
    const patch: any = { access_level: level };
    if (level !== "contributor") {
      patch.can_create = false;
      patch.can_edit = false;
      patch.can_delete = false;
      patch.can_move = false;
    }
    await supabase.from("project_members").update(patch).eq("id", memberId);
    fetchData();
  };

  const handleCreateNewMember = async () => {
    if (!newMemberName.trim() || !newMemberEmail.trim()) {
      toast({ title: "Preencha nome e e-mail", variant: "destructive" });
      return;
    }
    setCreatingMember(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: newMemberEmail.trim(),
          password: "Temp@1234",
          full_name: newMemberName.trim(),
          sector: newMemberSector || null,
          role_title: null,
          role: "user",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const createdUserId = data?.user?.id;

      if (createdUserId) {
        const { error: memberError } = await supabase.from("project_members").insert({
          project_id: projectId,
          user_id: createdUserId,
          sector: newMemberSector || null,
          invitation_status: "accepted",
          responded_at: new Date().toISOString(),
          can_create: true,
          can_edit: true,
          can_delete: false,
          can_move: true,
        });

        if (memberError) throw memberError;
      }

      toast({ title: "Membro cadastrado e vinculado ao projeto!", description: `Senha temporária: Temp@1234` });
      setNewMemberName("");
      setNewMemberEmail("");
      setNewMemberSector("");
      setShowNewMember(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "Erro ao cadastrar", description: err.message, variant: "destructive" });
    } finally {
      setCreatingMember(false);
    }
  };

  // When user is selected, pre-fill sector from profile
  useEffect(() => {
    if (selectedUser) {
      const profile = profiles.find((p) => p.id === selectedUser);
      if (profile?.sector) setSelectedSector(profile.sector);
    }
  }, [selectedUser]);

  return (
    <div className="space-y-3">
      <Label className="text-sm font-semibold">Equipe do Projeto</Label>

      {members.length > 0 && (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="p-3 rounded border border-border bg-accent/10 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Avatar className="h-7 w-7 shrink-0">
                    {m.profile?.avatar_url ? <AvatarImage src={m.profile.avatar_url} alt={m.profile?.full_name || "Usuário"} /> : null}
                    <AvatarFallback className="text-[10px]">{getInitials(m.profile?.full_name || m.profile?.email)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium flex items-center gap-2">
                      {m.profile?.full_name || m.profile?.email}
                      {m.access_level === "viewer" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">VIEWER</span>
                      )}
                      {m.access_level === "commenter" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">COMMENTER</span>
                      )}
                    </span>
                    {m.sector && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> {m.sector}
                      </span>
                    )}
                  </div>
                </div>
                <button type="button" onClick={() => handleRemove(m.id)} className="hover:text-destructive">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="pl-6 space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-[11px] text-muted-foreground">Nível:</Label>
                  <Select
                    value={m.access_level || "contributor"}
                    onValueChange={(v) => handleChangeAccessLevel(m.id, v as any)}
                  >
                    <SelectTrigger className="h-7 text-xs w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contributor">Contribuidor (escreve)</SelectItem>
                      <SelectItem value="commenter">Commenter (vê + comenta)</SelectItem>
                      <SelectItem value="viewer">Viewer (só visualiza)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(m.access_level || "contributor") === "contributor" && (
                  <div className="flex flex-wrap gap-3">
                {[
                  { key: "can_create", label: "Criar" },
                  { key: "can_edit", label: "Editar" },
                  { key: "can_delete", label: "Excluir" },
                  { key: "can_move", label: "Mover" },
                ].map((perm) => (
                  <label key={perm.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox
                      checked={(m as any)[perm.key]}
                      onCheckedChange={(v) => handleTogglePermission(m.id, perm.key, !!v)}
                    />
                    {perm.label}
                  </label>
                ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add existing user */}
      <div className="space-y-2 p-3 rounded border border-dashed border-border">
        <div className="flex gap-2">
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="flex-1 h-9 text-sm">
              <SelectValue placeholder="Selecionar usuário cadastrado..." />
            </SelectTrigger>
            <SelectContent>
              {availableUsers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="inline-flex items-center gap-2 min-w-0 w-full">
                    <Avatar className="h-5 w-5 shrink-0">
                      {p.avatar_url ? <AvatarImage src={p.avatar_url} alt={p.full_name || p.email} /> : null}
                      <AvatarFallback className="text-[9px]">{getInitials(p.full_name || p.email)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate">{p.full_name || p.email}{p.sector ? ` — ${p.sector}` : ""}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedUser && (
          <>
            {schemes.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Wand2 className="w-3 h-3" /> Aplicar template de permissão
                </Label>
                <Select value={selectedScheme} onValueChange={applyScheme}>
                  <SelectTrigger className="h-8 text-sm mt-1">
                    <SelectValue placeholder="Escolher um template (opcional)..." />
                  </SelectTrigger>
                  <SelectContent>
                    {schemes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}{s.description ? ` — ${s.description}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground">Setor neste projeto</Label>
              <Input
                className="h-8 text-sm mt-1"
                placeholder="Ex: TI, Financeiro..."
                value={selectedSector}
                onChange={(e) => setSelectedSector(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Nível de acesso</Label>
              <Select value={selectedAccessLevel} onValueChange={(v) => setSelectedAccessLevel(v as any)}>
                <SelectTrigger className="h-8 text-sm mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contributor">Contribuidor — pode escrever conforme permissões abaixo</SelectItem>
                  <SelectItem value="commenter">Commenter — apenas visualiza e comenta</SelectItem>
                  <SelectItem value="viewer">Viewer — apenas visualiza</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedAccessLevel === "contributor" && (
            <div className="flex flex-wrap gap-3">
              {[
                { key: "can_create", label: "Criar" },
                { key: "can_edit", label: "Editar" },
                { key: "can_delete", label: "Excluir" },
                { key: "can_move", label: "Mover" },
              ].map((perm) => (
                <label key={perm.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox
                    checked={(permissions as any)[perm.key]}
                    onCheckedChange={(v) => setPermissions({ ...permissions, [perm.key]: !!v })}
                  />
                  {perm.label}
                </label>
              ))}
            </div>
            )}
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1 w-full" onClick={handleAdd}>
              <UserPlus className="w-4 h-4" />
              Adicionar à Equipe
            </Button>
          </>
        )}
      </div>

      {/* Register new member inline */}
      <div className="space-y-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full"
          onClick={() => setShowNewMember(!showNewMember)}
        >
          <Plus className="w-3.5 h-3.5" />
          Cadastrar novo membro
        </Button>

        {showNewMember && (
          <div className="p-3 rounded border border-primary/30 bg-primary/5 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Novo Cadastro</p>
            <Input
              className="h-8 text-sm"
              placeholder="Nome completo *"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
            />
            <Input
              className="h-8 text-sm"
              placeholder="E-mail *"
              type="email"
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
            />
            <Select value={newMemberSector} onValueChange={setNewMemberSector}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Setor" />
              </SelectTrigger>
              <SelectContent>
                {sectors.map((s) => (
                  <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              O membro será cadastrado com senha temporária <strong>Temp@1234</strong> e perfil "Usuário".
            </p>
            <div className="flex gap-2">
              <Button size="sm" className="h-8 gap-1 flex-1" onClick={handleCreateNewMember} disabled={creatingMember}>
                <UserPlus className="w-3.5 h-3.5" />
                {creatingMember ? "Cadastrando..." : "Cadastrar e Disponibilizar"}
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => { setShowNewMember(false); setNewMemberName(""); setNewMemberEmail(""); setNewMemberSector(""); }}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
