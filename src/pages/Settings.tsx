import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, X, Building2, UserCircle, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { UserManagement } from "@/components/UserManagement";

interface Sector {
  id: string;
  name: string;
  created_at: string;
}

const Settings = () => {
  const { toast } = useToast();
  const { user, profile, isAdmin } = useAuth();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [newSector, setNewSector] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [editingSectorId, setEditingSectorId] = useState<string | null>(null);
  const [editingSectorName, setEditingSectorName] = useState("");

  // Profile self-edit
  const [profileForm, setProfileForm] = useState({
    full_name: "",
    sector: "",
    role_title: "",
  });
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || "",
        sector: profile.sector || "",
        role_title: profile.role_title || "",
      });
    }
  }, [profile]);

  const fetchSectors = async () => {
    const { data, error } = await supabase.from("sectors").select("*").order("name");
    if (!error && data) setSectors(data);
  };

  useEffect(() => { fetchSectors(); }, []);

  const handleAddSector = async () => {
    const name = newSector.trim();
    if (!name) return;
    setIsLoading(true);
    const { error } = await supabase.from("sectors").insert({ name });
    if (error) {
      toast({ title: "Erro", description: error.message.includes("duplicate") ? "Setor já existe." : "Erro ao criar setor.", variant: "destructive" });
    } else {
      toast({ title: "Setor criado!", description: `"${name}" foi adicionado.` });
      setNewSector("");
      fetchSectors();
    }
    setIsLoading(false);
  };

  const handleDeleteSector = async (sector: Sector) => {
    const { error } = await supabase.from("sectors").delete().eq("id", sector.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Setor removido", description: `"${sector.name}" foi excluído.` });
      fetchSectors();
    }
  };

  const handleRenameSector = async (id: string) => {
    const name = editingSectorName.trim();
    if (!name) return;
    const { error } = await supabase.from("sectors").update({ name }).eq("id", id);
    if (error) {
      toast({ title: "Erro ao renomear", variant: "destructive" });
    } else {
      toast({ title: "Setor renomeado!" });
      setEditingSectorId(null);
      fetchSectors();
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setProfileSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: profileForm.full_name,
          sector: profileForm.sector || null,
          role_title: profileForm.role_title || null,
        })
        .eq("id", user.id);
      if (error) throw error;
      toast({ title: "Perfil atualizado!" });
    } catch (error: any) {
      toast({ title: "Erro ao salvar perfil", description: error.message, variant: "destructive" });
    }
    setProfileSaving(false);
  };

  const handleChangePassword = async () => {
    if (!newPassword.trim()) {
      toast({ title: "Digite a nova senha", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "As senhas não conferem", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "A senha deve ter no mínimo 6 caracteres", variant: "destructive" });
      return;
    }
    setProfileSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: "Senha alterada com sucesso!" });
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast({ title: "Erro ao alterar senha", description: error.message, variant: "destructive" });
    }
    setProfileSaving(false);
  };

  return (
    <AppLayout title="Configurações">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Meu Perfil */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCircle className="w-5 h-5" />
              Meu Perfil
            </CardTitle>
            <CardDescription>Atualize suas informações pessoais e senha.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Nome Completo</Label>
                <Input
                  value={profileForm.full_name}
                  onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Setor</Label>
                  <Input
                    value={profileForm.sector}
                    onChange={(e) => setProfileForm({ ...profileForm, sector: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Cargo</Label>
                  <Input
                    value={profileForm.role_title}
                    onChange={(e) => setProfileForm({ ...profileForm, role_title: e.target.value })}
                  />
                </div>
              </div>
              <Button onClick={handleSaveProfile} disabled={profileSaving} className="w-fit gap-1">
                <Save className="w-4 h-4" />
                {profileSaving ? "Salvando..." : "Salvar Perfil"}
              </Button>
            </div>

            <div className="border-t border-border pt-4 mt-4">
              <h4 className="text-sm font-semibold text-foreground mb-3">Alterar Senha</h4>
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label>Nova Senha</Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Confirmar Nova Senha</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                  />
                </div>
                <Button variant="outline" onClick={handleChangePassword} disabled={profileSaving} className="w-fit">
                  {profileSaving ? "Alterando..." : "Alterar Senha"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Management (admin only) */}
        <UserManagement />

        {/* Sectors */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Setores
            </CardTitle>
            <CardDescription>
              Cadastre os setores que podem ser partes interessadas nos projetos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Nome do setor (ex: TI, Marketing, RH...)"
                value={newSector}
                onChange={(e) => setNewSector(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddSector()}
              />
              <Button onClick={handleAddSector} disabled={isLoading || !newSector.trim()} className="gap-1 shrink-0">
                <Plus className="w-4 h-4" /> Adicionar
              </Button>
            </div>
            {sectors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum setor cadastrado ainda.</p>
            ) : (
              <div className="space-y-2 pt-2">
                {sectors.map((sector) => (
                  <div key={sector.id} className="flex items-center justify-between p-2 rounded-lg border border-border">
                    {editingSectorId === sector.id ? (
                      <div className="flex-1 flex items-center gap-2">
                        <Input
                          value={editingSectorName}
                          onChange={(e) => setEditingSectorName(e.target.value)}
                          className="h-8 text-sm"
                          onKeyDown={(e) => e.key === "Enter" && handleRenameSector(sector.id)}
                        />
                        <Button size="sm" variant="ghost" onClick={() => handleRenameSector(sector.id)}>Salvar</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingSectorId(null)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm font-medium text-foreground">{sector.name}</span>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => { setEditingSectorId(sector.id); setEditingSectorName(sector.name); }}
                          >
                            Renomear
                          </Button>
                          <button
                            onClick={() => handleDeleteSector(sector)}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Settings;
