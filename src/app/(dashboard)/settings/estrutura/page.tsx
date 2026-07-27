'use client';

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, Plus, X, Pencil, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";

interface Sector {
  id: string;
  name: string;
  created_at: string;
}

const SettingsStructurePage = () => {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [newSector, setNewSector] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [editingSectorId, setEditingSectorId] = useState<string | null>(null);
  const [editingSectorName, setEditingSectorName] = useState("");

  const [counts, setCounts] = useState<Record<string, number>>({});

  const fetchSectors = async () => {
    const { data, error } = await supabase.from("sectors").select("*").order("name");
    if (!error && data) setSectors(data);
    // Contagem de pessoas por setor (por nome — compat com profiles.sector texto).
    const { data: profs } = await supabase.from("profiles").select("sector");
    const map: Record<string, number> = {};
    (profs || []).forEach((p: any) => {
      const s = (p.sector || "").trim().toLowerCase();
      if (s) map[s] = (map[s] || 0) + 1;
    });
    setCounts(map);
  };

  useEffect(() => {
    fetchSectors();
  }, []);

  const handleAddSector = async () => {
    const name = newSector.trim();
    if (!name) return;

    setIsLoading(true);
    const { error } = await supabase.from("sectors").insert({ name });
    if (error) {
      toast.error("Erro ao criar setor");
    } else {
      toast.success(`Setor \"${name}\" criado!`);
      setNewSector("");
      fetchSectors();
    }
    setIsLoading(false);
  };

  const handleDeleteSector = async (sector: Sector) => {
    const { error } = await supabase.from("sectors").delete().eq("id", sector.id);
    if (error) {
      toast.error("Erro ao excluir setor");
    } else {
      toast.success(`Setor \"${sector.name}\" removido!`);
      fetchSectors();
    }
  };

  const handleRenameSector = async (id: string) => {
    const name = editingSectorName.trim();
    if (!name) return;

    const { error } = await supabase.from("sectors").update({ name }).eq("id", id);
    if (error) {
      toast.error("Erro ao renomear setor");
    } else {
      toast.success("Setor renomeado!");
      setEditingSectorId(null);
      fetchSectors();
    }
  };

  return (
    <div className="px-4 py-6 max-w-4xl mx-auto">
      <SettingsPageHeader
        icon={Building2}
        title="Estrutura Organizacional"
        description="Cadastre e mantenha os setores usados em usuários, projetos e filtros executivos."
      />

      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Adicionar */}
          <div className="flex gap-2">
            <Input
              placeholder="Nome do setor (ex.: TI, Marketing, RH…)"
              value={newSector}
              onChange={(e) => setNewSector(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddSector()}
              className="h-9"
            />
            <Button onClick={handleAddSector} disabled={isLoading || !newSector.trim()} className="gap-1.5 shrink-0 h-9">
              <Plus className="w-4 h-4" /> Adicionar
            </Button>
          </div>

          {/* Lista com colunas claras */}
          {sectors.length === 0 ? (
            <div className="text-center py-10 text-[13px] text-muted-foreground border border-dashed rounded-lg">
              Nenhum setor cadastrado ainda.
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Cabeçalho de colunas */}
              <div className="grid grid-cols-[1fr_96px_72px] gap-3 items-center px-3 py-2 bg-muted/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Setor</span>
                <span className="text-right">Pessoas</span>
                <span />
              </div>

              {sectors.map((sector) => {
                const n = counts[sector.name.trim().toLowerCase()] || 0;
                const isEditing = editingSectorId === sector.id;
                return (
                  <div
                    key={sector.id}
                    className="grid grid-cols-[1fr_96px_72px] gap-3 items-center px-3 py-2 border-t border-border hover:bg-muted/40 transition-colors group"
                  >
                    {isEditing ? (
                      <div className="col-span-3 flex items-center gap-2">
                        <Input
                          autoFocus
                          value={editingSectorName}
                          onChange={(e) => setEditingSectorName(e.target.value)}
                          className="h-8 text-[13px] flex-1"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameSector(sector.id);
                            if (e.key === "Escape") setEditingSectorId(null);
                          }}
                        />
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={() => handleRenameSector(sector.id)} title="Salvar">
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => setEditingSectorId(null)} title="Cancelar">
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        {/* Setor */}
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-6 w-6 rounded-md bg-muted flex items-center justify-center shrink-0">
                            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </span>
                          <span className="text-[13px] font-medium text-foreground truncate">{sector.name}</span>
                        </div>
                        {/* Pessoas (sempre visível, 0 inclusive) */}
                        <span className={`text-[12px] tabular-nums text-right ${n > 0 ? "text-foreground/80" : "text-muted-foreground/50"}`}>
                          {n} pessoa{n === 1 ? "" : "s"}
                        </span>
                        {/* Ações */}
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Renomear"
                            onClick={() => { setEditingSectorId(sector.id); setEditingSectorName(sector.name); }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Excluir"
                            onClick={() => handleDeleteSector(sector)}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsStructurePage;
