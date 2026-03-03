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

  const available = sectors.filter((s) => !selected.includes(s.name));

  const toggle = (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter((s) => s !== name));
    } else {
      onChange([...selected, name]);
    }
  };

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>

      {/* Selected */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((name) => (
            <Badge key={name} className="gap-1 cursor-pointer" onClick={() => toggle(name)}>
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
              onClick={() => toggle(sector.name)}
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
