'use client';
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface SectorOption { id: string; name: string; }

/**
 * Seletor de setor com criação INLINE ("+ criar novo setor"), sem sair da tela.
 * Grava em `sectors` e devolve a lista atualizada via onSectorsChange.
 *
 * Continua gravando o NOME em profiles.sector (compat com o código atual); a
 * coluna sector_id é sincronizada pelo trigger do banco na transição.
 */
interface SectorSelectProps {
  value: string;
  onValueChange: (v: string) => void;
  sectors: SectorOption[];
  onSectorsChange?: (sectors: SectorOption[]) => void;
}

const NONE = "__none__";
const CREATE = "__create__";

export function SectorSelect({ value, onValueChange, sectors, onSectorsChange }: SectorSelectProps) {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const createSector = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    const { data, error } = await supabase.from("sectors").insert({ name }).select("id, name").single();
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao criar setor", description: error.message, variant: "destructive" });
      return;
    }
    onSectorsChange?.([...sectors, data as SectorOption].sort((a, b) => a.name.localeCompare(b.name)));
    onValueChange(data.name);
    setNewName("");
    setCreating(false);
    toast({ title: `Setor "${name}" criado!` });
  };

  if (creating) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") createSector();
            if (e.key === "Escape") { setCreating(false); setNewName(""); }
          }}
          placeholder="Nome do novo setor"
          className="h-9 flex-1"
        />
        <Button size="icon" variant="ghost" className="h-9 w-9 text-primary shrink-0" onClick={createSector} disabled={saving || !newName.trim()} title="Criar">
          <Check className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground shrink-0" onClick={() => { setCreating(false); setNewName(""); }} title="Cancelar">
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value || NONE}
      onValueChange={(v) => {
        if (v === CREATE) { setCreating(true); return; }
        onValueChange(v === NONE ? "" : v);
      }}
    >
      <SelectTrigger><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Nenhum</SelectItem>
        {sectors.map((s) => (
          <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
        ))}
        <SelectItem value={CREATE}>
          <span className="flex items-center gap-1.5 text-primary">
            <Plus className="w-3.5 h-3.5" /> Criar novo setor…
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
