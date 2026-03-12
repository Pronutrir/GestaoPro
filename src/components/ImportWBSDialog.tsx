import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Upload, Layers, ListTodo, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ParsedItem {
  code: string;
  title: string;
  level: "phase" | "activity";
  parentCode: string | null;
}

interface ImportWBSDialogProps {
  projectId: string;
  onDataChanged: () => void;
}

const parseWBS = (text: string): ParsedItem[] => {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  const items: ParsedItem[] = [];

  for (const line of lines) {
    // Match patterns like "1.0", "1.1", "1.1.1", etc followed by text
    const match = line.match(/^(\d+(?:\.\d+)*)\s+(.+)$/);
    if (!match) continue;

    const code = match[1];
    const title = match[2].trim();
    const parts = code.split(".").filter(p => p !== "0"); // remove trailing .0

    // Count meaningful levels: "1.0" = 1 level, "1.1" = 2 levels, "1.1.1" = 3 levels
    const dotParts = code.split(".");
    let level: "phase" | "activity";
    let parentCode: string | null = null;

    if (dotParts.length <= 2) {
      // 1.0 or 1.1 = Phase
      level = "phase";
    } else {
      // 1.1.1 = Activity, parent is "1.1"
      level = "activity";
      parentCode = dotParts.slice(0, 2).join(".");
    }

    items.push({ code, title, level, parentCode });
  }

  return items;
};

export const ImportWBSDialog = ({ projectId, onDataChanged }: ImportWBSDialogProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);

  const parsed = text ? parseWBS(text) : [];
  const phases = parsed.filter(i => i.level === "phase");
  const activities = parsed.filter(i => i.level === "activity");

  const handleImport = async () => {
    if (parsed.length === 0) return;
    setImporting(true);

    try {
      // Get current max display_order for phases
      const { data: existingPhases } = await supabase
        .from("phases")
        .select("display_order")
        .eq("project_id", projectId)
        .order("display_order", { ascending: false })
        .limit(1);

      let phaseOrder = (existingPhases?.[0]?.display_order ?? 0) + 1;

      // Create phases and track their IDs by code
      const phaseIdMap: Record<string, string> = {};

      for (const phase of phases) {
        const { data, error } = await supabase
          .from("phases")
          .insert({
            project_id: projectId,
            title: `${phase.code} ${phase.title}`,
            display_order: phaseOrder++,
          })
          .select("id")
          .single();

        if (error) throw error;
        phaseIdMap[phase.code] = data.id;
      }

      // Create activities linked to their parent phase
      for (let i = 0; i < activities.length; i++) {
        const activity = activities[i];
        const phaseId = activity.parentCode ? phaseIdMap[activity.parentCode] : null;

        const { error } = await supabase.from("activities").insert({
          project_id: projectId,
          title: `${activity.code} ${activity.title}`,
          phase_id: phaseId,
          display_order: i,
        });

        if (error) throw error;
      }

      toast({
        title: "EAP importada!",
        description: `${phases.length} fases e ${activities.length} atividades criadas.`,
      });

      setText("");
      setOpen(false);
      onDataChanged();
    } catch (error) {
      console.error("Erro ao importar EAP:", error);
      toast({ title: "Erro ao importar EAP", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <Upload className="w-4 h-4" />
          Importar EAP
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Estrutura Analítica do Projeto</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Cole a estrutura WBS abaixo. Níveis 1.0 e 1.1 serão criados como <strong>fases</strong>, 
              e níveis 1.1.1 como <strong>atividades</strong>.
            </p>
            <Textarea
              placeholder={`Exemplo:\n1.0 Gestão do Projeto\n1.1 Iniciação do Projeto\n1.1.1 Elaboração do Termo de Abertura\n1.1.2 Definição dos objetivos`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              className="font-mono text-sm"
            />
          </div>

          {parsed.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="gap-1">
                  <Layers className="w-3 h-3" />
                  {phases.length} fases
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <ListTodo className="w-3 h-3" />
                  {activities.length} atividades
                </Badge>
              </div>

              <div className="border border-border rounded-lg p-3 max-h-[200px] overflow-y-auto bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Pré-visualização:</p>
                {parsed.map((item, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 py-1 ${
                      item.level === "activity" ? "pl-6" : ""
                    }`}
                  >
                    {item.level === "phase" ? (
                      <Layers className="w-3 h-3 text-primary shrink-0" />
                    ) : (
                      <ListTodo className="w-3 h-3 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-xs font-mono text-muted-foreground">{item.code}</span>
                    <span className={`text-sm ${item.level === "phase" ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>

              {activities.some(a => !a.parentCode || !phases.find(p => p.code === a.parentCode)) && (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <AlertCircle className="w-4 h-4" />
                  Algumas atividades não têm fase correspondente e ficarão sem vínculo.
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleImport} disabled={parsed.length === 0 || importing}>
              {importing ? "Importando..." : `Importar ${parsed.length} itens`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
