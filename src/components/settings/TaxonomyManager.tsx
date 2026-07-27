'use client';
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, X, Pencil, Check, Building2, Briefcase, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TaxItem { id: string; name: string; }
type Table = "sectors" | "job_titles";

/**
 * Gestão de HIGIENE das listas mestras (Setores / Cargos) — enxuta, para um
 * diálogo. Só o essencial: adicionar, renomear, excluir e contar pessoas por
 * item, além de limpar de uma vez os itens sem uso. SEM split e SEM "Abrir" —
 * a reatribuição por pessoa já vive na ficha da Organização.
 */
function TaxonomyPanel({
  table, profileField, icon: Icon, addPlaceholder, itemNoun, singularLabel,
}: {
  table: Table;
  profileField: "sector" | "role_title";
  icon: LucideIcon;
  addPlaceholder: string;
  itemNoun: string;
  singularLabel: string;
}) {
  const [items, setItems] = useState<TaxItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [tableMissing, setTableMissing] = useState(false);

  const load = async () => {
    const { data, error } = await (supabase.from(table as any).select("id, name").order("name") as any);
    const rows: TaxItem[] = Array.isArray(data) ? (data as TaxItem[]) : [];

    const { data: profs } = await supabase.from("profiles").select(profileField);
    const map: Record<string, number> = {};
    const distinct = new Map<string, string>();
    (profs || []).forEach((p: any) => {
      const raw = (p[profileField] || "").trim();
      const key = raw.toLowerCase();
      if (!key) return;
      map[key] = (map[key] || 0) + 1;
      if (!distinct.has(key)) distinct.set(key, raw);
    });
    setCounts(map);

    const missing = !!error || rows.length === 0;
    setTableMissing(!!error);
    if (missing && distinct.size > 0) {
      setItems(Array.from(distinct.values()).sort((a, b) => a.localeCompare(b)).map((name) => ({ id: `derived:${name}`, name })));
    } else {
      setItems(rows);
    }
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

  const countOf = (name: string) => counts[name.trim().toLowerCase()] || 0;
  const emptyItems = useMemo(
    () => items.filter((i) => !i.id.startsWith("derived:") && countOf(i.name) === 0),
    [items, counts],
  );

  const clearEmpty = async () => {
    if (emptyItems.length === 0) return;
    const { error } = await (supabase.from(table as any).delete().in("id", emptyItems.map((i) => i.id)) as any);
    if (error) { toast.error("Erro ao limpar"); return; }
    toast.success(`${emptyItems.length} ${itemNoun}(s) sem uso removido(s).`);
    load();
  };

  return (
    <div className="space-y-3">
      {tableMissing && (
        <div className="flex items-start gap-2 text-[12px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          <span className="mt-0.5">⚠️</span>
          <span>Mostrando os {itemNoun}s já usados nas pessoas. Para gerenciar aqui, aplique a migration <code className="font-mono">job_titles</code> na VM.</span>
        </div>
      )}

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

      {/* Lista */}
      {items.length === 0 ? (
        <div className="text-center py-10 text-[13px] text-muted-foreground border border-dashed rounded-lg">
          Nenhum {itemNoun} cadastrado ainda.
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden max-h-[46vh] overflow-y-auto">
          <div className="grid grid-cols-[1fr_84px_64px] gap-3 items-center px-3 py-2 bg-muted/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0">
            <span>{singularLabel}</span>
            <span className="text-right">Pessoas</span>
            <span />
          </div>
          {items.map((item) => {
            const n = countOf(item.name);
            const isEditing = editingId === item.id;
            const derived = item.id.startsWith("derived:");
            return (
              <div key={item.id} className="grid grid-cols-[1fr_84px_64px] gap-3 items-center px-3 py-2 border-t border-border hover:bg-muted/30 group">
                {isEditing ? (
                  <div className="col-span-3 flex items-center gap-2">
                    <Input
                      autoFocus value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="h-8 text-[13px] flex-1"
                      onKeyDown={(e) => { if (e.key === "Enter") rename(item.id); if (e.key === "Escape") setEditingId(null); }}
                    />
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={() => rename(item.id)}><Check className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-6 w-6 rounded-md bg-muted flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5 text-muted-foreground" /></span>
                      <span className="text-[13px] font-medium truncate">{item.name}</span>
                    </div>
                    <span className={`text-[12px] tabular-nums text-right ${n > 0 ? "text-foreground/80" : "text-muted-foreground/50"}`}>
                      {n}
                    </span>
                    <div className="flex items-center justify-end gap-0.5">
                      {!derived && (
                        <>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100" title="Renomear" onClick={() => { setEditingId(item.id); setEditingName(item.name); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100" title="Excluir" onClick={() => remove(item)}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Limpar vazios */}
      {emptyItems.length > 0 && (
        <div className="flex items-center justify-between text-[12px] bg-muted/40 border border-border rounded-lg px-3 py-2">
          <span className="text-muted-foreground">
            {emptyItems.length} {itemNoun}(s) sem nenhuma pessoa.
          </span>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-destructive hover:text-destructive" onClick={clearEmpty}>
            <Trash2 className="w-3.5 h-3.5" /> Limpar vazios
          </Button>
        </div>
      )}
    </div>
  );
}

/** Gestão de listas com abas Setores / Cargos. */
export function TaxonomyManager({ defaultTab = "sectors" }: { defaultTab?: Table }) {
  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList className="h-9 bg-transparent border-b border-border rounded-none p-0 gap-1 w-full justify-start mb-3">
        <TabsTrigger value="sectors" className="text-[13px] gap-1.5 data-[state=active]:bg-background">
          <Building2 className="w-3.5 h-3.5" /> Setores
        </TabsTrigger>
        <TabsTrigger value="job_titles" className="text-[13px] gap-1.5 data-[state=active]:bg-background">
          <Briefcase className="w-3.5 h-3.5" /> Cargos
        </TabsTrigger>
      </TabsList>
      <TabsContent value="sectors">
        <TaxonomyPanel table="sectors" profileField="sector" icon={Building2} addPlaceholder="Nome do setor (ex.: TI, Marketing…)" itemNoun="setor" singularLabel="Setor" />
      </TabsContent>
      <TabsContent value="job_titles">
        <TaxonomyPanel table="job_titles" profileField="role_title" icon={Briefcase} addPlaceholder="Nome do cargo (ex.: Analista, Coordenador…)" itemNoun="cargo" singularLabel="Cargo" />
      </TabsContent>
    </Tabs>
  );
}
