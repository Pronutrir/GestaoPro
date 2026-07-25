'use client';
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Circle, Package, Layers, Diamond, Plus } from "lucide-react";

type Kind = "atividade" | "pacote" | "fase" | "marco";

interface ParentOption { id: string; title: string; item_type: string | null; is_milestone?: boolean | null; parent_id?: string | null; }

interface QuickCreateActivityProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Atividades do projeto — para escolher "onde encaixar". */
  parentOptions: ParentOption[];
  /** Abre o editor completo para a atividade recém-criada. */
  onOpenDetails: (activityId: string) => void;
  onCreated: () => void;
  /** Quando true (ex.: projeto concluído), impede a criação com aviso. */
  disabledReason?: string | null;
}

const KIND_META: Record<Kind, { label: string; icon: JSX.Element; hint: string }> = {
  atividade: { label: "Atividade", icon: <Circle className="w-3.5 h-3.5" />, hint: "Trabalho executável (folha)." },
  pacote: { label: "Pacote", icon: <Package className="w-3.5 h-3.5" />, hint: "Agrupa atividades." },
  fase: { label: "Fase", icon: <Layers className="w-3.5 h-3.5" />, hint: "Entrega macro; agrupa pacotes." },
  marco: { label: "Marco", icon: <Diamond className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />, hint: "Ponto único no tempo." },
};

// Pode ser pai: agrupador (fase/pacote) OU qualquer item que já tem filhos
// (agrupador de fato, mesmo que o item_type ainda seja 'atividade' porque a
// migration do 'pacote' está pendente). Marco nunca.
const canBeParentWith = (o: ParentOption, hasChildren: boolean) =>
  !o.is_milestone && (o.item_type === "fase" || o.item_type === "pacote" || hasChildren);

export const QuickCreateActivity = ({
  open, onOpenChange, projectId, parentOptions, onOpenDetails, onCreated, disabledReason,
}: QuickCreateActivityProps) => {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState<string>("__root__");
  const [kind, setKind] = useState<Kind>("atividade");
  const [saving, setSaving] = useState(false);
  const [backlogStageId, setBacklogStageId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(""); setParentId("__root__"); setKind("atividade");
    setTimeout(() => inputRef.current?.focus(), 50);
    // Coluna inicial (Backlog, display_order=0) para a nova atividade.
    supabase
      .from("workflow_stages")
      .select("id, display_order")
      .eq("project_id", projectId)
      .order("display_order")
      .then(({ data }) => {
        const backlog = (data || []).find((s) => s.display_order === 0) || (data || [])[0];
        setBacklogStageId(backlog?.id ?? null);
      });
  }, [open, projectId]);

  // Se escolheu um pai, o item não pode ser Fase (fase é de topo).
  const childrenIds = new Set(parentOptions.map((o) => o.parent_id).filter(Boolean) as string[]);
  const parents = parentOptions.filter((o) => canBeParentWith(o, childrenIds.has(o.id)));
  const hasParent = parentId !== "__root__";
  const kindOptions: Kind[] = hasParent
    ? ["atividade", "pacote", "marco"]
    : ["atividade", "fase", "pacote", "marco"];
  const effectiveKind: Kind = kindOptions.includes(kind) ? kind : "atividade";

  const insert = async (): Promise<string | null> => {
    const t = title.trim();
    if (!t) return null;
    const patch: any = {
      project_id: projectId,
      title: t,
      parent_id: hasParent ? parentId : null,
      workflow_stage_id: backlogStageId,
      status: "pending",
      priority: "medium",
      is_milestone: effectiveKind === "marco",
      item_type: effectiveKind === "marco" ? "atividade" : effectiveKind,
    };
    // Tolerante ao CHECK: se o banco não aceita 'pacote'/'fase', tenta 'atividade'.
    let { data, error } = await supabase.from("activities").insert(patch).select("id").single();
    if (error && (effectiveKind === "pacote" || effectiveKind === "fase")) {
      const retry = { ...patch, item_type: "atividade" };
      ({ data, error } = await supabase.from("activities").insert(retry).select("id").single());
    }
    if (error || !data) {
      toast({ title: "Erro ao criar", description: error?.message, variant: "destructive" });
      return null;
    }
    return (data as { id: string }).id;
  };

  const handleCreate = async (openDetails: boolean) => {
    if (!title.trim()) return;
    if (disabledReason) {
      toast({ title: "Não é possível criar", description: disabledReason, variant: "destructive" });
      return;
    }
    setSaving(true);
    const id = await insert();
    setSaving(false);
    if (!id) return;
    onCreated();
    if (openDetails) {
      onOpenChange(false);
      onOpenDetails(id);
    } else {
      // criação contínua: limpa e mantém aberto
      setTitle("");
      setTimeout(() => inputRef.current?.focus(), 30);
      toast({ title: "Criada", description: title.trim() });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Plus className="w-4 h-4 text-primary" /> Nova atividade
          </DialogTitle>
          <DialogDescription>
            Digite o título e crie. Ajuste tipo e local se precisar — o resto edita depois.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Título */}
          <div className="space-y-1.5">
            <Label className="text-xs">Título</Label>
            <Input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleCreate(false); } }}
              placeholder="Ex: Levantar requisitos — Enter cria e continua"
              className="h-9"
            />
          </div>

          {/* Onde encaixar (opcional) */}
          <div className="space-y-1.5">
            <Label className="text-xs">Onde encaixar</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__root__">Nível principal (sem pai)</SelectItem>
                {parents.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.item_type === "fase" ? "Fase: " : "Pacote: "}{p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo (segmented) */}
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo</Label>
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30 w-full">
              {kindOptions.map((k) => {
                const active = effectiveKind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`flex-1 inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                      active ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {KIND_META[k].icon}
                    {KIND_META[k].label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">{KIND_META[effectiveKind].hint}</p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => handleCreate(true)} disabled={!title.trim() || saving}>
            Criar e abrir detalhes
          </Button>
          <Button onClick={() => handleCreate(false)} disabled={!title.trim() || saving}>
            {saving ? "Criando..." : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
