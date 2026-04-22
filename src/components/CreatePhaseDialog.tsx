import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Layers, Loader2 } from "lucide-react";

interface CreatePhaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Used to compute the next display_order */
  existingPhasesCount?: number;
  onCreated?: (phaseId: string) => void;
}

export const CreatePhaseDialog = ({
  open,
  onOpenChange,
  projectId,
  existingPhasesCount = 0,
  onCreated,
}: CreatePhaseDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setTimeout(() => titleRef.current?.focus(), 60);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || loading) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from("phases").insert({
        project_id: projectId,
        title: title.trim(),
        description: description.trim() || null,
        display_order: existingPhasesCount + 1,
      }).select("id").single();
      if (error) throw error;
      toast({ title: "Fase criada!" });
      onCreated?.(data!.id);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast({ title: "Erro ao criar fase", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" /> Nova Fase
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2 min-w-0">
            <Label htmlFor="phase-title" className="text-sm font-semibold text-foreground">Nome da fase *</Label>
            <Input
              id="phase-title"
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Ex: Discovery, Desenvolvimento, Homologação..."
              className="h-11 font-medium"
            />
          </div>

          <div className="space-y-2 min-w-0">
            <Label htmlFor="phase-description" className="text-sm font-semibold text-foreground">Descrição</Label>
            <Textarea
              id="phase-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              autoResize
              placeholder="Objetivo desta fase, entregáveis principais, critérios de saída..."
              className="w-full min-w-0 break-words whitespace-pre-wrap [overflow-wrap:anywhere]"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!title.trim() || loading} className="gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Criar Fase
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
