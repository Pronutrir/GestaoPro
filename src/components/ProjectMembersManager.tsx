import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, UserPlus, Shield, User, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  email: string;
  full_name: string;
  sector: string | null;
}

interface ProjectMember {
  id: string;
  user_id: string;
  sector: string | null;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_move: boolean;
  profile?: Profile;
}

interface ProjectMembersManagerProps {
  projectId: string;
}

export const ProjectMembersManager = ({ projectId }: ProjectMembersManagerProps) => {
  const { toast } = useToast();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedSector, setSelectedSector] = useState("");
  const [permissions, setPermissions] = useState({
    can_create: false,
    can_edit: false,
    can_delete: false,
    can_move: false,
  });

  const fetchData = async () => {
    const [{ data: membersData }, { data: profilesData }] = await Promise.all([
      supabase.from("project_members").select("*").eq("project_id", projectId),
      supabase.from("profiles").select("id, email, full_name, sector"),
    ]);

    if (profilesData) setProfiles(profilesData);

    if (membersData && profilesData) {
      const enriched = membersData.map((m: any) => ({
        ...m,
        profile: profilesData.find((p) => p.id === m.user_id),
      }));
      setMembers(enriched);
    }
  };

  useEffect(() => { fetchData(); }, [projectId]);

  const availableUsers = profiles.filter(
    (p) => !members.some((m) => m.user_id === p.id)
  );

  const handleAdd = async () => {
    if (!selectedUser) return;
    const { error } = await supabase.from("project_members").insert({
      project_id: projectId,
      user_id: selectedUser,
      sector: selectedSector || null,
      ...permissions,
    });
    if (error) {
      toast({ title: "Erro ao adicionar", description: error.message, variant: "destructive" });
    } else {
      setSelectedUser("");
      setSelectedSector("");
      setPermissions({ can_create: false, can_edit: false, can_delete: false, can_move: false });
      fetchData();
    }
  };

  const handleRemove = async (memberId: string) => {
    await supabase.from("project_members").delete().eq("id", memberId);
    fetchData();
  };

  const handleTogglePermission = async (memberId: string, field: string, value: boolean) => {
    await supabase.from("project_members").update({ [field]: value }).eq("id", memberId);
    fetchData();
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
                  <User className="w-4 h-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{m.profile?.full_name || m.profile?.email}</span>
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
              <div className="flex flex-wrap gap-3 pl-6">
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
            </div>
          ))}
        </div>
      )}

      {availableUsers.length > 0 && (
        <div className="space-y-2 p-3 rounded border border-dashed border-border">
          <div className="flex gap-2">
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="flex-1 h-9 text-sm">
                <SelectValue placeholder="Selecionar usuário..." />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email}{p.sector ? ` — ${p.sector}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedUser && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground">Setor neste projeto</Label>
                <Input
                  className="h-8 text-sm mt-1"
                  placeholder="Ex: TI, Financeiro..."
                  value={selectedSector}
                  onChange={(e) => setSelectedSector(e.target.value)}
                />
              </div>
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
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1 w-full" onClick={handleAdd}>
                <UserPlus className="w-4 h-4" />
                Adicionar à Equipe
              </Button>
            </>
          )}
        </div>
      )}

      {availableUsers.length === 0 && members.length > 0 && (
        <p className="text-xs text-muted-foreground">Todos os usuários já foram adicionados.</p>
      )}
    </div>
  );
};
