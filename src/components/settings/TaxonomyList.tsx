'use client';
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, X, Pencil, Check, ArrowUpRight, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TaxItem { id: string; name: string; }
interface Person {
  id: string;
  full_name: string | null;
  role_title: string | null;
  sector: string | null;
}

/**
 * Lista de TAXONOMIA reutilizável (Setores, Cargos/Níveis…) que ABRE: à esquerda
 * a lista mestra (criar/renomear/excluir/contar); ao selecionar um item, à direita
 * aparecem as PESSOAS daquele setor/cargo, com reatribuição inline ("↕ Mover") e
 * atalho "Abrir ↗" para o painel Pessoas. Setores e Cargos são a mesma natureza —
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
  moveVerb?: string;        // legado (não usado após os dois seletores inline)
}

const NONE = "__none__";

/** Seletor compacto de setor/cargo por pessoa, com rótulo no placeholder. */
function PersonTaxSelect({
  label, value, options, disabled, onChange,
}: {
  label: string;
  value: string;
  options: TaxItem[];
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <Select
      value={value || NONE}
      onValueChange={(v) => onChange(v === NONE ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger className="h-7 w-[132px] text-[12px] gap-1 shrink-0" title={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE} className="text-[12px] text-muted-foreground">{label}: nenhum</SelectItem>
        {options.map((it) => (
          <SelectItem key={it.id} value={it.name} className="text-[12px]">{it.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TaxonomyList({
  table, profileField, icon: Icon, addPlaceholder, emptyLabel, itemNoun, singularLabel,
}: TaxonomyListProps) {
  const router = useRouter();
  // Classificador da aba atual e o "outro" (setor↔cargo), para editar os dois inline.
  const otherField: "sector" | "role_title" = profileField === "sector" ? "role_title" : "sector";
  const otherTable = profileField === "sector" ? "job_titles" : "sectors";
  const otherLabel = profileField === "sector" ? "Cargo" : "Setor";

  const [items, setItems] = useState<TaxItem[]>([]);
  const [otherItems, setOtherItems] = useState<TaxItem[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [selected, setSelected] = useState<string | null>(null); // nome do item aberto
  const [movingId, setMovingId] = useState<string | null>(null);

  const [tableMissing, setTableMissing] = useState(false);

  const load = async () => {
    // Tolerante: a tabela (ex.: job_titles) pode não existir ainda (migration
    // pendente). Nesse caso, derivamos os itens de profiles[profileField] para
    // exibir os dados reais mesmo antes da migration.
    const { data, error } = await (supabase.from(table as any).select("id, name").order("name") as any);
    const rows: TaxItem[] = Array.isArray(data) ? (data as TaxItem[]) : [];

    // Pessoas (também alimentam contagem e o painel de detalhe).
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, role_title, sector")
      .order("full_name");
    const persons = (profs as unknown as Person[] | null) || [];
    setPeople(persons);

    const map: Record<string, number> = {};
    const distinctByName = new Map<string, string>(); // lower → nome exibido
    persons.forEach((p) => {
      const raw = ((p[profileField] as string) || "").trim();
      const key = raw.toLowerCase();
      if (!key) return;
      map[key] = (map[key] || 0) + 1;
      if (!distinctByName.has(key)) distinctByName.set(key, raw);
    });
    setCounts(map);

    // Lista do OUTRO classificador (para editar cargo na aba setor e vice-versa),
    // com o mesmo fallback tolerante: deriva das pessoas se a tabela não existir.
    const { data: otherRows } = await (supabase.from(otherTable as any).select("id, name").order("name") as any);
    let otherList: TaxItem[] = Array.isArray(otherRows) ? (otherRows as TaxItem[]) : [];
    if (otherList.length === 0) {
      const seen = new Map<string, string>();
      persons.forEach((p) => {
        const raw = ((p[otherField] as string) || "").trim();
        if (raw && !seen.has(raw.toLowerCase())) seen.set(raw.toLowerCase(), raw);
      });
      otherList = Array.from(seen.values())
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ id: `derived:${name}`, name }));
    }
    setOtherItems(otherList);

    const missing = !!error || rows.length === 0;
    setTableMissing(!!error);

    let nextItems: TaxItem[];
    if (missing && distinctByName.size > 0) {
      // Fallback: itens derivados dos cargos/setores já usados nas pessoas.
      nextItems = Array.from(distinctByName.values())
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ id: `derived:${name}`, name }));
    } else {
      nextItems = rows;
    }
    setItems(nextItems);

    // Mantém a seleção se o item ainda existe; senão seleciona o primeiro.
    setSelected((prev) => {
      if (prev && nextItems.some((i) => i.name === prev)) return prev;
      return nextItems[0]?.name ?? null;
    });
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
    setSelected(name);
    load();
  };

  const remove = async (item: TaxItem) => {
    const { error } = await (supabase.from(table as any).delete().eq("id", item.id) as any);
    if (error) { toast.error(`Erro ao excluir ${itemNoun}`); return; }
    toast.success(`${singularLabel} "${item.name}" removido!`);
    if (selected === item.name) setSelected(null);
    load();
  };

  const rename = async (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    const prevName = items.find((i) => i.id === id)?.name;
    const { error } = await (supabase.from(table as any).update({ name }).eq("id", id) as any);
    if (error) { toast.error(`Erro ao renomear ${itemNoun}`); return; }
    toast.success(`${singularLabel} renomeado!`);
    setEditingId(null);
    if (selected === prevName) setSelected(name);
    load();
  };

  // Reatribuição inline: grava setor OU cargo (pelo nome) da pessoa, sem sair da
  // tela. `field` pode ser o próprio da aba ou o outro classificador.
  const assignPerson = async (
    person: Person,
    field: "sector" | "role_title",
    targetName: string,
  ) => {
    setMovingId(person.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/update-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ target_user_id: person.id, [field]: targetName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) throw new Error(data?.error || "Falha ao salvar");
      const label = field === "sector" ? "Setor" : "Cargo";
      toast.success(`${person.full_name || "Pessoa"} · ${label} → ${targetName || "Nenhum"}`);
      await load();
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    } finally {
      setMovingId(null);
    }
  };

  const openInPeople = (personId: string) => {
    router.push(`/settings/pessoas?focus=${personId}`);
  };

  const selectedItem = items.find((i) => i.name === selected) || null;
  const peopleOfSelected = useMemo(() => {
    if (!selected) return [];
    const key = selected.trim().toLowerCase();
    return people
      .filter((p) => ((p[profileField] as string) || "").trim().toLowerCase() === key)
      .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }, [people, selected, profileField]);

  const initials = (name: string | null) =>
    name ? name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "?";

  return (
    <Card>
      <CardContent className="p-0">
        {tableMissing && (
          <div className="flex items-start gap-2 text-[12px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5">
            <span className="mt-0.5">⚠️</span>
            <span>
              Mostrando os {itemNoun}s já usados nas pessoas. Para gerenciar (criar/renomear/excluir) aqui,
              aplique a migration <code className="font-mono">job_titles</code> na VM. A reatribuição já funciona.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[minmax(220px,280px)_1fr]">
          {/* ── Lista mestra ───────────────────────────────────────────── */}
          <div className="p-3 md:border-r border-border">
            {/* Adicionar */}
            <div className="flex gap-1.5 mb-3">
              <Input
                placeholder={addPlaceholder}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                className="h-8 text-[13px]"
              />
              <Button onClick={add} disabled={loading || !newName.trim()} size="icon" className="h-8 w-8 shrink-0" title="Adicionar">
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-10 text-[13px] text-muted-foreground border border-dashed rounded-lg">
                {emptyLabel}
              </div>
            ) : (
              <div className="space-y-0.5">
                {items.map((item) => {
                  const n = counts[item.name.trim().toLowerCase()] || 0;
                  const isEditing = editingId === item.id;
                  const isSel = selected === item.name;

                  if (isEditing) {
                    return (
                      <div key={item.id} className="flex items-center gap-1.5 px-1 py-1">
                        <Input
                          autoFocus
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="h-7 text-[13px] flex-1"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") rename(item.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-primary" onClick={() => rename(item.id)} title="Salvar">
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={() => setEditingId(null)} title="Cancelar">
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelected(item.name)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors group ${
                        isSel ? "bg-primary/10 shadow-[inset_2px_0_0] shadow-primary" : "hover:bg-muted/50"
                      }`}
                    >
                      <span className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${isSel ? "bg-primary/15" : "bg-muted"}`}>
                        <Icon className={`w-3.5 h-3.5 ${isSel ? "text-primary" : "text-muted-foreground"}`} />
                      </span>
                      <span className={`text-[13px] flex-1 truncate ${isSel ? "font-semibold text-foreground" : "font-medium text-foreground/90"}`}>
                        {item.name}
                      </span>
                      <span className={`text-[11px] tabular-nums rounded-full px-2 py-0.5 ${
                        isSel ? "text-primary font-bold" : "text-muted-foreground bg-muted"
                      }`}>
                        {n}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Painel do item selecionado (pessoas) ───────────────────── */}
          <div className="p-4 min-h-[280px]">
            {!selectedItem ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12 text-muted-foreground">
                <Users className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-[13px]">Selecione um {itemNoun} à esquerda para ver as pessoas.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-1">
                  <span className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4.5 h-4.5 text-primary" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-foreground truncate">{selectedItem.name}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {peopleOfSelected.length} pessoa{peopleOfSelected.length === 1 ? "" : "s"} neste {itemNoun}
                    </div>
                  </div>
                  {!selectedItem.id.startsWith("derived:") && (
                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        size="sm" variant="ghost" className="h-7 gap-1 text-[12px] text-muted-foreground"
                        onClick={() => { setEditingId(selectedItem.id); setEditingName(selectedItem.name); }}
                      >
                        <Pencil className="w-3.5 h-3.5" /> Renomear
                      </Button>
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="Excluir" onClick={() => remove(selectedItem)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {peopleOfSelected.length === 0 ? (
                  <div className="mt-4 text-center py-10 text-[12.5px] text-muted-foreground border border-dashed rounded-lg">
                    Nenhuma pessoa neste {itemNoun}. Selecione o {itemNoun} de alguém na lista para trazê-la para cá.
                  </div>
                ) : (
                  <div className="mt-3 border-t border-border">
                    {peopleOfSelected.map((person) => (
                      <div
                        key={person.id}
                        className="flex items-center gap-3 py-2.5 border-b border-border last:border-b-0"
                      >
                        <span className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold text-muted-foreground shrink-0">
                          {initials(person.full_name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-foreground truncate">
                            {person.full_name || "—"}
                          </div>
                          <div className="text-[11.5px] text-muted-foreground truncate">
                            {person.role_title || "Sem cargo"}{person.sector ? ` · ${person.sector}` : ""}
                          </div>
                        </div>

                        {/* Classificador da aba atual (Setor na aba Setores / Cargo na aba Cargos) */}
                        <PersonTaxSelect
                          label={singularLabel}
                          value={(person[profileField] as string) || ""}
                          options={items}
                          disabled={movingId === person.id}
                          onChange={(v) => v !== ((person[profileField] as string) || "") && assignPerson(person, profileField, v)}
                        />
                        {/* O OUTRO classificador (Cargo na aba Setores / Setor na aba Cargos) */}
                        <PersonTaxSelect
                          label={otherLabel}
                          value={(person[otherField] as string) || ""}
                          options={otherItems}
                          disabled={movingId === person.id}
                          onChange={(v) => v !== ((person[otherField] as string) || "") && assignPerson(person, otherField, v)}
                        />

                        <Button
                          size="sm" variant="ghost"
                          className="h-7 gap-1 text-[12px] text-primary shrink-0"
                          onClick={() => openInPeople(person.id)}
                          title="Abrir no painel Pessoas (módulos, senha, papel de acesso)"
                        >
                          Abrir <ArrowUpRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
