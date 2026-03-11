import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, UserPlus, Shield, User } from "lucide-react";
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
  role: string;
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
  const [selectedRole, setSelectedRole] = useState("collaborator");

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
      role: selectedRole,
    });
    if (error) {
      toast({ title: "Erro ao adicionar", description: error.message, variant: "destructive" });
    } else {
      setSelectedUser("");
      fetchData();
    }
  };

  const handleRemove = async (memberId: string) => {
    await supabase.from("project_members").delete().eq("id", memberId);
    fetchData();
  };

  const handleChangeRole = async (memberId: string, newRole: string) => {
    await supabase.from("project_members").update({ role: newRole }).eq("id", memberId);
    fetchData();
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-semibold">Equipe do Projeto</Label>

      {members.length > 0 && (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between p-2 rounded border border-border bg-accent/10">
              <div className="flex items-center gap-2">
                {m.role === "manager" ? (
                  <Shield className="w-4 h-4 text-primary" />
                ) : (
                  <User className="w-4 h-4 text-muted-foreground" />
                )}
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{m.profile?.full_name || m.profile?.email}</span>
                  {m.profile?.sector && (
                    <span className="text-xs text-muted-foreground">{m.profile.sector}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select value={m.role} onValueChange={(v) => handleChangeRole(m.id, v)}>
                  <SelectTrigger className="h-7 w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Gestor</SelectItem>
                    <SelectItem value="collaborator">Colaborador</SelectItem>
                  </SelectContent>
                </Select>
                <button onClick={() => handleRemove(m.id)} className="hover:text-destructive">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {availableUsers.length > 0 && (
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
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="w-[120px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manager">Gestor</SelectItem>
              <SelectItem value="collaborator">Colaborador</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-9 gap-1" onClick={handleAdd} disabled={!selectedUser}>
            <UserPlus className="w-4 h-4" />
          </Button>
        </div>
      )}

      {availableUsers.length === 0 && members.length > 0 && (
        <p className="text-xs text-muted-foreground">Todos os usuários já foram adicionados.</p>
      )}
    </div>
  );
};
