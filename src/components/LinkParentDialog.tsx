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
import { Link2, Search, X, Layers } from "lucide-react";

interface Candidate {
  id: string;
  title: string;
  parent_id: string | null;
  phase_id: string | null;
  item_type: string | null;
  status: string | null;
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
      .select("id, title, parent_id, phase_id, item_type, status, trashed_at")
      .eq("project_id", projectId)
      .is("trashed_at", null)
      .order("title", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          toast({
            title: "Erro ao carregar tarefas",
            description: error.message,
            variant: "destructive",
          });
        } else {
          setAll((data || []) as Candidate[]);
        }
        setLoading(false);
      });
  }, [open, projectId, toast]);

  const blockedIds = useMemo(() => {
    const blocked = new Set<string>(activityIds);
    if (all.length === 0) return blocked;

    const childrenMap = new Map<string, string[]>();
    all.forEach((a) => {
      if (!a.parent_id) return;
      const arr = childrenMap.get(a.parent_id) || [];
      arr.push(a.id);
      childrenMap.set(a.parent_id, arr);
    });

    const stack = [...activityIds];
    while (stack.length > 0) {
      const current = stack.pop()!;
      const children = childrenMap.get(current) || [];
      children.forEach((childId) => {
        if (blocked.has(childId)) return;
        blocked.add(childId);
        stack.push(childId);
      });
    }

    return blocked;
  }, [activityIds, all]);

  const candidates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return all
      .filter((a) => !blockedIds.has(a.id))
      .filter((a) => !a.parent_id)
      .filter((a) => (a.item_type || "tarefa") !== "fase")
      .filter((a) => {
        if (!query) return true;
        return a.title.toLowerCase().includes(query) || a.id.toLowerCase().includes(query);
      })
      .slice(0, 200);
  }, [all, blockedIds, search]);

  const handlePick = async (parent: Candidate | null) => {
    if (activityIds.length === 0) return;
    setSaving(true);

    try {
      let validatedParent: Candidate | null = null;
      if (parent) {
        const { data: parentRow, error: parentError } = await supabase
          .from("activities")
          .select("id, title, parent_id, phase_id, item_type, status, trashed_at")
          .eq("id", parent.id)
          .eq("project_id", projectId)
          .is("trashed_at", null)
          .maybeSingle();

        if (parentError) throw parentError;
        if (!parentRow) {
          toast({
            title: "Pai invalido",
            description: "A atividade pai nao foi encontrada neste projeto.",
            variant: "destructive",
          });
          return;
        }

        validatedParent = parentRow as Candidate;

        if (validatedParent.parent_id) {
          toast({
            title: "Pai invalido",
            description: "Somente atividades soltas (sem pai) podem ser usadas como pai.",
            variant: "destructive",
          });
          return;
        }

        if ((validatedParent.item_type || "tarefa") === "fase") {
          toast({
            title: "Pai invalido",
            description: "Fases nao podem ser usadas como atividade pai.",
            variant: "destructive",
          });
          return;
        }
      }

      const payload: { parent_id: string | null; phase_id?: string | null } = {
        parent_id: validatedParent ? validatedParent.id : null,
      };

      if (validatedParent && validatedParent.phase_id !== undefined) {
        payload.phase_id = validatedParent.phase_id;
      }

      const { error } = await supabase
        .from("activities")
        .update(payload)
        .in("id", activityIds);

      if (error) throw error;

      toast({
        title: parent ? "Vinculada ao pai" : "Removida do pai",
        description: parent
          ? `${activityIds.length} tarefa(s) agora sao filhas de "${validatedParent?.title || parent.title}".`
          : `${activityIds.length} tarefa(s) sem pai.`,
      });

      onLinked?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Erro ao vincular",
        description: e?.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="w-4 h-4 text-primary" />
            Vincular {activityIds.length > 1 ? `${activityIds.length} tarefas` : "tarefa"} a uma atividade pai
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground bg-muted/40 border border-border/60 rounded-md px-3 py-2">
            Somente atividades sem pai (atividades soltas) podem ser selecionadas como pai.
          </p>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar atividade pai por titulo ou ID..."
              className="pl-8 h-9"
            />
          </div>

          <ScrollArea className="h-[320px] border rounded-md">
            {loading ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Carregando...</div>
            ) : candidates.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {search ? "Nenhuma atividade pai encontrada." : "Nenhuma atividade solta elegivel neste projeto."}
              </div>
            ) : (
              <ul className="divide-y">
                {candidates.map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handlePick(candidate)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="flex-1 min-w-0 text-sm truncate">{candidate.title}</span>
                      <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                        {candidate.id.slice(0, 8)}...
                      </span>
                      {candidate.status === "completed" && (
                        <Badge variant="outline" className="text-[10px]">concluida</Badge>
                      )}
                    </button>
                  </li>
                ))}
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
              <X className="w-3.5 h-3.5" /> Remover do pai
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