'use client';
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface JobTitleOption { id: string; name: string; }

/**
 * Seletor de cargo/nível — MESMO comportamento do SectorSelect: um campo único,
 * lista de cargos + "+ criar novo cargo" inline (grava em job_titles e fica
 * disponível para todas as pessoas). Sem input duplicado.
 *
 * Continua gravando o NOME em profiles.role_title (compat).
 */
interface RoleTitleSelectProps {
  value: string;
  onValueChange: (v: string) => void;
  titles: JobTitleOption[];
  onTitlesChange?: (titles: JobTitleOption[]) => void;
}

const NONE = "__none__";
const CREATE = "__create__";

export function RoleTitleSelect({ value, onValueChange, titles, onTitlesChange }: RoleTitleSelectProps) {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const createTitle = async () => {
    const name = newName.trim();
    if (!name) return;
    // Já existe (case-insensitive)? Só seleciona, não duplica.
    const existing = titles.find((t) => t.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) { onValueChange(existing.name); setNewName(""); setCreating(false); return; }
    setSaving(true);
    const { data, error } = await (supabase.from("job_titles" as any).insert({ name }).select("id, name").single() as any);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao criar cargo", description: error.message, variant: "destructive" });
      return;
    }
    const created = data as JobTitleOption;
    onTitlesChange?.([...titles, created].sort((a, b) => a.name.localeCompare(b.name)));
    onValueChange(created.name);
    setNewName("");
    setCreating(false);
    toast({ title: `Cargo "${name}" criado!` });
  };

  if (creating) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") createTitle();
            if (e.key === "Escape") { setCreating(false); setNewName(""); }
          }}
          placeholder="Nome do novo cargo/nível"
          className="h-9 flex-1"
        />
        <Button size="icon" variant="ghost" className="h-9 w-9 text-primary shrink-0" onClick={createTitle} disabled={saving || !newName.trim()} title="Criar">
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
      <SelectTrigger><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Nenhum</SelectItem>
        {titles.map((t) => (
          <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
        ))}
        <SelectItem value={CREATE}>
          <span className="flex items-center gap-1.5 text-primary">
            <Plus className="w-3.5 h-3.5" /> Criar novo cargo…
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
