'use client';
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, X, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from 'sonner';
import { useAuth } from "@/contexts/AuthContext";
import { UserManagement } from "@/components/UserManagement";
import { ModulePermissions } from "@/components/ModulePermissions";
import { HolidaysManager } from "@/components/HolidaysManager";
import { UserVacationsManager } from "@/components/UserVacationsManager";

interface Sector {
  id: string;
  name: string;
  created_at: string;
}

const Settings = () => {
  const { isAdmin } = useAuth();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [newSector, setNewSector] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [editingSectorId, setEditingSectorId] = useState<string | null>(null);
  const [editingSectorName, setEditingSectorName] = useState("");

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
      toast.error("Erro");
    } else {
      toast.success(`Setor "${name}" criado!`);
      setNewSector("");
      fetchSectors();
    }
    setIsLoading(false);
  };

  const handleDeleteSector = async (sector: Sector) => {
    const { error } = await supabase.from("sectors").delete().eq("id", sector.id);
    if (error) {
      toast.error("Erro ao excluir");
    } else {
      toast.success(`Setor "${sector.name}" removido!`);
      fetchSectors();
    }
  };

  const handleRenameSector = async (id: string) => {
    const name = editingSectorName.trim();
    if (!name) return;
    const { error } = await supabase.from("sectors").update({ name }).eq("id", id);
    if (error) {
      toast.error("Erro ao renomear");
    } else {
      toast.success("Setor renomeado!");
      setEditingSectorId(null);
      fetchSectors();
    }
  };

  return (
          <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
        {/* User Management (admin only) */}
        <UserManagement />

        {/* Module Permissions (admin only) */}
        <ModulePermissions />

        {/* Holidays (admin & gestor) */}
        <HolidaysManager />

        {/* User vacations (admin) */}
        {isAdmin && <UserVacationsManager />}

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
    
  );
};

export default Settings;
