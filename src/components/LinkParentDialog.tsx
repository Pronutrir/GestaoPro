'use client';

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link2, Search, X, Layers, CornerDownRight, AlertTriangle } from "lucide-react";
import {
  eapCanMoveInto,
  eapDescendantIds,
  eapDepthOf,
  resolveEapKind,
  EAP_LABELS,
  type EapNodeLike,
} from "@/lib/eapModel";

interface Candidate extends EapNodeLike {
  id: string;
  title: string;
  parent_id: string | null;
  phase_id: string | null;
  item_type: string | null;
  is_milestone: boolean | null;
  wbs_code: string | null;
  status: string | null;
  display_order: number | null;
  trashed_at?: string | null;
}

interface LinkParentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  activityIds: string[];
  currentParentId?: string | null;
  onLinked?: () => void;
}

/**
 * Move uma ou mais atividades para DENTRO de outra (troca o parent_id).
 *
 * É a via única das três telas que reorganizam a EAP — Kanban (menu do card),
 * Backlog (menu de linha) e o campo "Dentro de" na edição. A validação não mora
 * aqui: vem de `eapCanMoveInto`, para que as três recusem exatamente as mesmas
 * coisas. Ver src/lib/eapModel.ts.
 *
 * Qualquer item pode ser destino, em qualquer nível — o que barra é ciclo,
 * self e marco (que é folha de controle). Antes este diálogo só oferecia
 * atividades soltas e escondia as fases, o que contradizia o próprio rótulo do
 * menu e impedia reorganizar uma EAP já aninhada.
 */
export const LinkParentDialog = ({
  open,
  onOpenChange,
  projectId,
  activityIds,
  currentParentId,
  onLinked,
}: LinkParentDialogProps) => {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [all, setAll] = useState<Candidate[]>([]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setLoading(true);

    supabase
      .from("activities")
      .select(
        "id, title, parent_id, phase_id, item_type, is_milestone, wbs_code, status, display_order, trashed_at",
      )
      .eq("project_id", projectId)
      .is("trashed_at", null)
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("title", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          toast({
            title: "Erro ao carregar atividades",
            description: error.message,
            variant: "destructive",
          });
        } else {
          setAll((data || []) as Candidate[]);
        }
        setLoading(false);
      });
  }, [open, projectId, toast]);

  /** O próprio item e toda a sua descendência — mover para lá seria o ciclo. */
  const blockedIds = useMemo(() => {
    const blocked = new Set<string>(activityIds);
    eapDescendantIds(all, activityIds).forEach((id) => blocked.add(id));
    return blocked;
  }, [activityIds, all]);

  /**
   * Candidatos em ordem de árvore (pai seguido dos filhos), para que a lista
   * mostre a EAP como ela é e não uma lista alfabética achatada — sem isso, o
   * usuário não sabe ONDE está soltando o item.
   */
  const candidates = useMemo(() => {
    const query = search.trim().toLowerCase();

    const childrenBy = new Map<string, Candidate[]>();
    const roots: Candidate[] = [];
    all.forEach((a) => {
      if (a.parent_id && all.some((p) => p.id === a.parent_id)) {
        const arr = childrenBy.get(a.parent_id) || [];
        arr.push(a);
        childrenBy.set(a.parent_id, arr);
      } else {
        roots.push(a);
      }
    });

    const ordered: Array<{ node: Candidate; depth: number }> = [];
    const seen = new Set<string>(); // dado já com ciclo não pode travar a lista
    const walk = (nodes: Candidate[], depth: number) => {
      for (const node of nodes) {
        if (seen.has(node.id)) continue;
        seen.add(node.id);
        ordered.push({ node, depth });
        walk(childrenBy.get(node.id) || [], depth + 1);
      }
    };
    walk(roots, 1);

    return ordered
      // Marco nunca agrupa; self e descendentes fariam o ciclo.
      .filter(({ node }) => !blockedIds.has(node.id) && !node.is_milestone)
      .filter(({ node }) => {
        if (!query) return true;
        return (
          node.title.toLowerCase().includes(query) ||
          (node.wbs_code || "").toLowerCase().includes(query)
        );
      })
      .slice(0, 300);
  }, [all, blockedIds, search]);

  const handlePick = async (parent: Candidate | null) => {
    if (activityIds.length === 0) return;

    // Validação compartilhada, ANTES do clique virar erro cru do trigger.
    const check = eapCanMoveInto(all, activityIds, parent?.id ?? null);
    if (!check.ok) {
      toast({
        title: "Não dá para mover para aí",
        description: check.message,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      let validatedParent: Candidate | null = null;
      if (parent) {
        const { data: parentRow, error: parentError } = await supabase
          .from("activities")
          .select(
            "id, title, parent_id, phase_id, item_type, is_milestone, wbs_code, status, display_order, trashed_at",
          )
          .eq("id", parent.id)
          .eq("project_id", projectId)
          .is("trashed_at", null)
          .maybeSingle();

        if (parentError) throw parentError;
        if (!parentRow) {
          toast({
            title: "Destino inválido",
            description: "A atividade de destino não foi encontrada neste projeto.",
            variant: "destructive",
          });
          return;
        }

        validatedParent = parentRow as Candidate;

        // EAP: folha não pode ter filhos pelo trigger do banco. Promover a
        // agrupador é o que permite soltar dentro de uma Atividade — o rótulo
        // exibido continua vindo do nível do wbs_code, então "1.1" segue
        // aparecendo como Entrega, não vira Fase.
        const parentType = (validatedParent.item_type || "atividade").toLowerCase();
        if (parentType !== "fase" && parentType !== "pacote") {
          const { error: promoteErr } = await supabase
            .from("activities")
            .update({ item_type: "fase" } as any)
            .eq("id", validatedParent.id);
          if (promoteErr) throw promoteErr;
        }
      }

      const payload: { parent_id: string | null; phase_id?: string | null } = {
        parent_id: validatedParent ? validatedParent.id : null,
      };

      // O filho segue a fase do pai; senão ele apareceria numa fase e o pai em
      // outra, e a EAP mostraria o mesmo item em dois lugares.
      if (validatedParent && validatedParent.phase_id !== undefined) {
        payload.phase_id = validatedParent.phase_id;
      }

      const { error } = await supabase
        .from("activities")
        .update(payload)
        .in("id", activityIds);

      if (error) throw error;

      const quantos = activityIds.length > 1 ? `${activityIds.length} itens` : "Item";
      toast({
        title: parent ? "Movido" : "Movido para a raiz",
        description: parent
          ? `${quantos} agora dentro de "${validatedParent?.title || parent.title}".`
          : `${quantos} sem item acima.`,
      });

      // Avisar DEPOIS de gravar: é orientação, não impedimento. A base já tem
      // árvores de 6 níveis e bloquear impediria justamente de consertá-las.
      if (check.warning) {
        toast({ title: "EAP ficando profunda", description: check.warning });
      }

      onLinked?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Erro ao mover",
        description: e?.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const plural = activityIds.length > 1 ? `${activityIds.length} itens` : "item";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="w-4 h-4 text-primary" />
            Mover {plural} para dentro de…
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground bg-muted/40 border border-border/60 rounded-md px-3 py-2">
            Escolha onde o {activityIds.length > 1 ? "grupo" : "item"} deve ficar. O que está
            dentro dele vai junto. Marcos não aparecem porque não agrupam.
          </p>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título ou código da EAP..."
              className="pl-8 h-9"
            />
          </div>

          <ScrollArea className="h-[320px] border rounded-md">
            {loading ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Carregando...</div>
            ) : candidates.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {search
                  ? "Nenhum item encontrado."
                  : "Nenhum destino disponível neste projeto."}
              </div>
            ) : (
              <ul className="divide-y">
                {candidates.map(({ node, depth }) => {
                  const kind = resolveEapKind(node, all.some((a) => a.parent_id === node.id));
                  const isCurrent = node.id === currentParentId;
                  // Profundidade que o item passaria a ter, para avisar na linha
                  // em vez de só depois do clique.
                  const wouldWarn = eapDepthOf(all, node.id) >= 5;

                  return (
                    <li key={node.id}>
                      <button
                        type="button"
                        disabled={saving || isCurrent}
                        onClick={() => handlePick(node)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted transition-colors disabled:opacity-50"
                        style={{ paddingLeft: `${12 + (depth - 1) * 14}px` }}
                      >
                        {depth > 1 && (
                          <CornerDownRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                        )}
                        <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
                        {node.wbs_code && (
                          <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                            {node.wbs_code}
                          </span>
                        )}
                        <span className="flex-1 min-w-0 text-sm truncate">{node.title}</span>
                        {wouldWarn && (
                          <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                        )}
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {EAP_LABELS[kind]}
                        </Badge>
                        {isCurrent && (
                          <span className="text-[10px] text-muted-foreground shrink-0">atual</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </div>

        <DialogFooter className="flex sm:justify-between gap-2">
          {currentParentId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => handlePick(null)}
              className="gap-1.5"
            >
              <X className="w-3.5 h-3.5" /> Tirar de dentro (mover para a raiz)
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
