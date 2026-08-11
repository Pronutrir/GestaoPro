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
import { Circle, Layers, Diamond, Plus } from "lucide-react";
import { eapToPersisted, EAP_LABELS, EAP_HINTS, type EapKind } from "@/lib/eapModel";

/**
 * Aqui o agrupador é UMA opção só: na criação o item ainda não tem código EAP,
 * e Fase × Entrega é diferença de NÍVEL, não de escolha. O rótulo do botão
 * segue o destino — sem pai é Fase, dentro de algo é Entrega —, e o que vai ao
 * banco sai de `eapToPersisted`, igual às outras telas.
 */
type Kind = Extract<EapKind, "fase" | "atividade" | "marco">;

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

// Rótulo e dica saem de EAP_LABELS/EAP_HINTS: as três telas descreviam o mesmo
// papel com palavras diferentes ("Ponto único no tempo." aqui, outra frase na
// edição), e quem planeja lia como se fossem coisas distintas.
const KIND_META: Record<Kind, { icon: JSX.Element }> = {
  fase: { icon: <Layers className="w-3.5 h-3.5" /> },
  atividade: { icon: <Circle className="w-3.5 h-3.5" /> },
  // fill-current: herda a cor do botão. Com âmbar fixo, o ícone sumia quando o
  // botão ficava com fundo âmbar sólido (selecionado).
  marco: { icon: <Diamond className="w-3.5 h-3.5 fill-current" /> },
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

  // Fase/Entrega disponível em qualquer nível (mesmas opções com ou sem pai).
  const childrenIds = new Set(parentOptions.map((o) => o.parent_id).filter(Boolean) as string[]);
  const parents = parentOptions.filter((o) => canBeParentWith(o, childrenIds.has(o.id)));
  const hasParent = parentId !== "__root__";
  const kindOptions: Kind[] = ["fase", "atividade", "marco"];
  const effectiveKind: Kind = kindOptions.includes(kind) ? kind : "atividade";

  // O agrupador é Fase na raiz e Entrega dentro de outro item — a mesma regra
  // de nível que o resto do sistema aplica. O botão dizia sempre "Fase /
  // Entrega", então criar dentro de uma fase prometia uma escolha que não
  // existe e escondia o que o item de fato seria.
  const papelAgrupador: EapKind = hasParent ? "entrega" : "fase";
  const rotuloDe = (k: Kind) => EAP_LABELS[k === "fase" ? papelAgrupador : k];
  const dicaDe = (k: Kind) => EAP_HINTS[k === "fase" ? papelAgrupador : k];

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
      // eapToPersisted: a conversão papel → banco era duplicada aqui, e mudar a
      // regra canônica não alcançava esta tela.
      ...eapToPersisted(effectiveKind === "fase" ? papelAgrupador : effectiveKind),
    };
    // Tolerante ao CHECK: se o banco não aceita 'fase', tenta 'atividade'.
    // Testa o que foi GRAVADO, não o papel escolhido — Entrega também grava
    // item_type='fase' e precisava do mesmo resgate.
    let { data, error } = await supabase.from("activities").insert(patch).select("id").single();
    if (error && patch.item_type === "fase") {
      const retry = { ...patch, item_type: "atividade" };
      ({ data, error } = await supabase.from("activities").insert(retry).select("id").single());
    }
    if (error || !data) {
      toast({ title: "Erro ao criar", description: error?.message, variant: "destructive" });
      return null;
    }
    return (data as { id: string }).id;
  };

  const handleCreate = async (after: "close" | "details" | "continue") => {
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
    if (after === "details") {
      onOpenChange(false);
      onOpenDetails(id);
    } else if (after === "continue") {
      // criação contínua: limpa e mantém aberto
      setTitle("");
      setTimeout(() => inputRef.current?.focus(), 30);
      toast({ title: "Criada", description: title.trim() });
    } else {
      onOpenChange(false);
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
              // Enter mantém aberto de propósito: digitar título + Enter em
              // sequência é o gesto de quem está montando a lista de uma vez.
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleCreate("continue"); } }}
              placeholder="Ex: Levantar requisitos"
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
                    {p.title}
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
                    aria-pressed={active}
                    // Selecionado em cor sólida: com `bg-background` o botão
                    // ativo ficava branco sobre o trilho cinza-claro e não se
                    // lia como marcado — parecia apenas mais claro que os outros.
                    // min-w-0 + truncate: sem isso o rótulo mais longo não
                    // encolhe e o trio empurra a largura do diálogo inteiro.
                    className={`flex-1 min-w-0 inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors border ${
                      active
                        ? (k === "marco"
                            ? "border-amber-500 bg-amber-500 text-white shadow-sm"
                            : "border-primary bg-primary text-primary-foreground shadow-sm")
                        : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    }`}
                  >
                    <span className="shrink-0">{KIND_META[k].icon}</span>
                    <span className="truncate">{rotuloDe(k)}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">{dicaDe(effectiveKind)}</p>
          </div>
        </div>

        {/* "Criar" fecha, que é o que se espera de um botão de confirmação —
            antes ele mantinha o diálogo aberto e a única saída era clicar fora.
            A criação em sequência ficou no Enter (anunciado no placeholder e na
            dica abaixo): um terceiro botão aqui estourava a largura do diálogo
            e criava rolagem horizontal, cortando o próprio "Criar".
            O rodapé já quebra em linhas por padrão (ver ui/dialog). */}
        <DialogFooter>
          <span className="mr-auto text-[11px] text-muted-foreground self-center">
            <kbd className="px-1 py-0.5 rounded border border-border bg-muted font-mono text-[10px]">Enter</kbd>
            {" "}cria e mantém aberto
          </span>
          <Button variant="outline" onClick={() => handleCreate("details")} disabled={!title.trim() || saving}>
            Criar e abrir
          </Button>
          <Button onClick={() => handleCreate("close")} disabled={!title.trim() || saving}>
            {saving ? "Criando..." : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
