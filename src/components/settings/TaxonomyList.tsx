'use client';
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, X, Pencil, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TaxItem { id: string; name: string; }

/**
 * Lista de TAXONOMIA reutilizável (Setores, Cargos/Níveis…): criar, renomear,
 * excluir e contar pessoas por item. Setores e Cargos são a mesma natureza —
 * este componente serve aos dois, evitando duplicação.
 *
 * @param table        tabela da taxonomia ("sectors" | "job_titles")
 * @param profileField campo em profiles que referencia o nome ("sector" | "role_title")
 */
interface TaxonomyListProps {
  table: "sectors" | "job_titles";
  profileField: "sector" | "role_title";
  icon: LucideIcon;
  addPlaceholder: string;
  emptyLabel: string;
  itemNoun: string;         // "setor" | "cargo"
  singularLabel: string;    // "Setor" | "Cargo"
}

export function TaxonomyList({
  table, profileField, icon: Icon, addPlaceholder, emptyLabel, itemNoun, singularLabel,
}: TaxonomyListProps) {
  const [items, setItems] = useState<TaxItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const load = async () => {
    // Tolerante: a tabela job_titles pode não existir ainda (migration pendente).
    const { data } = await (supabase.from(table as any).select("id, name").order("name") as any);
    if (Array.isArray(data)) setItems(data as TaxItem[]);

    const { data: profs } = await supabase.from("profiles").select(profileField);
    const map: Record<string, number> = {};
    (profs || []).forEach((p: any) => {
      const v = (p[profileField] || "").trim().toLowerCase();
      if (v) map[v] = (map[v] || 0) + 1;
    });
    setCounts(map);
  };

  useEffect(() => { load(); }, [table]);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    setLoading(true);
    const { error } = await (supabase.from(table as any).insert({ name }) as any);
    setLoading(false);
    if (error) { toast.error(`Erro ao criar ${itemNoun}`); return; }
    toast.success(`${singularLabel} "${name}" criado!`);
    setNewName("");
    load();
  };

  const remove = async (item: TaxItem) => {
    const { error } = await (supabase.from(table as any).delete().eq("id", item.id) as any);
    if (error) { toast.error(`Erro ao excluir ${itemNoun}`); return; }
    toast.success(`${singularLabel} "${item.name}" removido!`);
    load();
  };

  const rename = async (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    const { error } = await (supabase.from(table as any).update({ name }).eq("id", id) as any);
    if (error) { toast.error(`Erro ao renomear ${itemNoun}`); return; }
    toast.success(`${singularLabel} renomeado!`);
    setEditingId(null);
    load();
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Adicionar */}
        <div className="flex gap-2">
          <Input
            placeholder={addPlaceholder}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            className="h-9"
          />
          <Button onClick={add} disabled={loading || !newName.trim()} className="gap-1.5 shrink-0 h-9">
            <Plus className="w-4 h-4" /> Adicionar
          </Button>
        </div>

        {/* Lista com colunas claras */}
        {items.length === 0 ? (
          <div className="text-center py-10 text-[13px] text-muted-foreground border border-dashed rounded-lg">
            {emptyLabel}
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="grid grid-cols-[1fr_96px_72px] gap-3 items-center px-3 py-2 bg-muted/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>{singularLabel}</span>
              <span className="text-right">Pessoas</span>
              <span />
            </div>

            {items.map((item) => {
              const n = counts[item.name.trim().toLowerCase()] || 0;
              const isEditing = editingId === item.id;
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_96px_72px] gap-3 items-center px-3 py-2 border-t border-border hover:bg-muted/40 transition-colors group"
                >
                  {isEditing ? (
                    <div className="col-span-3 flex items-center gap-2">
                      <Input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="h-8 text-[13px] flex-1"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") rename(item.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={() => rename(item.id)} title="Salvar">
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => setEditingId(null)} title="Cancelar">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-6 w-6 rounded-md bg-muted flex items-center justify-center shrink-0">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                        </span>
                        <span className="text-[13px] font-medium text-foreground truncate">{item.name}</span>
                      </div>
                      <span className={`text-[12px] tabular-nums text-right ${n > 0 ? "text-foreground/80" : "text-muted-foreground/50"}`}>
                        {n} pessoa{n === 1 ? "" : "s"}
                      </span>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Renomear"
                          onClick={() => { setEditingId(item.id); setEditingName(item.name); }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Excluir"
                          onClick={() => remove(item)}
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
  );
}
