import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SectorSelectorProps {
  selected: string[];
  onChange: (sectors: string[]) => void;
  label?: string;
}

export const SectorSelector = ({ selected, onChange, label = "Setores" }: SectorSelectorProps) => {
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    supabase.from("sectors").select("id, name").order("name").then(({ data }) => {
      if (data) setSectors(data);
    });
  }, []);

  // Filter selected to only include valid sector names
  const sectorNames = sectors.map((s) => s.name);
  const validSelected = selected.filter((s) => sectorNames.includes(s));
  const available = sectors.filter((s) => !validSelected.includes(s.name));

  const add = (name: string) => {
    if (!validSelected.includes(name)) {
      onChange([...validSelected, name]);
    }
  };

  const remove = (name: string) => {
    onChange(validSelected.filter((s) => s !== name));
  };

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>

      {/* Selected */}
      {validSelected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {validSelected.map((name) => (
            <Badge key={name} className="gap-1 cursor-pointer" onClick={() => remove(name)}>
              {name}
              <X className="w-3 h-3" />
            </Badge>
          ))}
        </div>
      )}

      {/* Available */}
      {available.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {available.map((sector) => (
            <Badge
              key={sector.id}
              variant="outline"
              className="cursor-pointer hover:bg-primary/10 transition-colors"
              onClick={() => add(sector.name)}
            >
              {sector.name}
            </Badge>
          ))}
        </div>
      ) : sectors.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum setor cadastrado. Vá em Configurações para adicionar.</p>
      ) : null}
    </div>
  );
};