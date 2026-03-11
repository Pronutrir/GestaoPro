import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, X, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { UserManagement } from "@/components/UserManagement";

interface Sector {
  id: string;
  name: string;
  created_at: string;
}

const Settings = () => {
  const { toast } = useToast();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [newSector, setNewSector] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const fetchSectors = async () => {
    const { data, error } = await supabase.from("sectors").select("*").order("name");
    if (!error && data) setSectors(data);
  };

  useEffect(() => { fetchSectors(); }, []);

  const handleAdd = async () => {
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

  const handleDelete = async (sector: Sector) => {
    const { error } = await supabase.from("sectors").delete().eq("id", sector.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Setor removido", description: `"${sector.name}" foi excluído.` });
      fetchSectors();
    }
  };

  return (
    <AppLayout title="Configurações">
      <div className="max-w-2xl mx-auto space-y-6">
        <UserManagement />
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
              <Input placeholder="Nome do setor (ex: TI, Marketing, RH...)" value={newSector} onChange={(e) => setNewSector(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
              <Button onClick={handleAdd} disabled={isLoading || !newSector.trim()} className="gap-1 shrink-0">
                <Plus className="w-4 h-4" /> Adicionar
              </Button>
            </div>
            {sectors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum setor cadastrado ainda.</p>
            ) : (
              <div className="flex flex-wrap gap-2 pt-2">
                {sectors.map((sector) => (
                  <Badge key={sector.id} variant="secondary" className="text-sm py-1.5 px-3 gap-1.5">
                    {sector.name}
                    <button onClick={() => handleDelete(sector)} className="ml-1 hover:text-destructive transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
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
