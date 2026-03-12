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
  level: "phase" | "activity" | "subactivity";
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
    // Support optional dots at end (e.g. "1.1." or "1.1.1.")
    const match = line.match(/^(\d+(?:\.\d+)*)\.?\s+(.+)$/);
    if (!match) continue;

    const code = match[1];
    const title = match[2].trim();
    const dotParts = code.split(".");

    items.push({ code, title, level: "phase", parentCode: null }); // temporary
  }

  if (items.length === 0) return items;

  // Auto-detect structure: find the minimum depth used (excluding single-number project titles)
  const depths = items.map(i => i.code.split(".").length);
  const minDepth = Math.min(...depths);
  const maxDepth = Math.max(...depths);

  // Determine mapping based on structure depth
  // If min depth is 1 (e.g. "1 Project Title"), skip level 1 as project title
  // Phases = first meaningful level, Activities = next, Sub-activities = deeper

  const result: ParsedItem[] = [];

  for (const item of items) {
    const dotParts = item.code.split(".");
    const depth = dotParts.length;

    let level: "phase" | "activity" | "subactivity";
    let parentCode: string | null = null;

    if (minDepth === 1) {
      // Structure: 1=project, 1.1=phase, 1.1.1=activity, 1.1.1.1+=subactivity
      if (depth === 1) continue; // Skip project title line
      if (depth === 2) {
        level = "phase";
      } else if (depth === 3) {
        level = "activity";
        parentCode = dotParts.slice(0, 2).join(".");
      } else {
        level = "subactivity";
        parentCode = dotParts.slice(0, 3).join(".");
      }
    } else if (minDepth === 2) {
      // Structure: 1.0/1.1=phase, 1.1/1.2=activity, 1.1.1+=subactivity
      // Check if there's a X.0 pattern (old format)
      const hasZeroPattern = items.some(i => {
        const p = i.code.split(".");
        return p.length === 2 && p[1] === "0";
      });

      if (hasZeroPattern) {
        // Old format: X.0 = phase, X.Y = activity, X.Y.Z = subactivity
        if (depth === 2 && dotParts[1] === "0") {
          level = "phase";
        } else if (depth === 2) {
          level = "activity";
          parentCode = dotParts[0] + ".0";
        } else {
          level = "subactivity";
          parentCode = dotParts.slice(0, 2).join(".");
        }
      } else {
        // X.Y = phase, X.Y.Z = activity, X.Y.Z.W+ = subactivity
        if (depth === 2) {
          level = "phase";
        } else if (depth === 3) {
          level = "activity";
          parentCode = dotParts.slice(0, 2).join(".");
        } else {
          level = "subactivity";
          parentCode = dotParts.slice(0, 3).join(".");
        }
      }
    } else {
      // Fallback: first level = phase, second = activity, rest = subactivity
      if (depth === minDepth) {
        level = "phase";
      } else if (depth === minDepth + 1) {
        level = "activity";
        parentCode = dotParts.slice(0, minDepth).join(".");
      } else {
        level = "subactivity";
        parentCode = dotParts.slice(0, minDepth + 1).join(".");
      }
    }

    result.push({ code: item.code, title: item.title, level, parentCode });
  }

  return result;
};

export const ImportWBSDialog = ({ projectId, onDataChanged }: ImportWBSDialogProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);

  const parsed = text ? parseWBS(text) : [];
  const phases = parsed.filter(i => i.level === "phase");
  const activities = parsed.filter(i => i.level === "activity");
  const subactivities = parsed.filter(i => i.level === "subactivity");

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

      // Create activities and sub-activities with sequential display_order per phase
      const activityIdMap: Record<string, string> = {};
      const phaseOrderCounter: Record<string, number> = {};

      for (const activity of activities) {
        const phaseId = activity.parentCode ? phaseIdMap[activity.parentCode] : null;
        const phaseKey = phaseId || "__none__";
        if (!(phaseKey in phaseOrderCounter)) phaseOrderCounter[phaseKey] = 0;

        const { data, error } = await supabase.from("activities").insert({
          project_id: projectId,
          title: `${activity.code} ${activity.title}`,
          phase_id: phaseId,
          display_order: phaseOrderCounter[phaseKey]++,
        }).select("id").single();

        if (error) throw error;
        activityIdMap[activity.code] = data.id;

        // Insert sub-activities right after their parent
        const childSubs = subactivities.filter(s => s.parentCode === activity.code);
        for (const sub of childSubs) {
          const { error: subError } = await supabase.from("activities").insert({
            project_id: projectId,
            title: `${sub.code} ${sub.title}`,
            phase_id: phaseId,
            parent_id: data.id,
            display_order: phaseOrderCounter[phaseKey]++,
          });
          if (subError) throw subError;
        }
      }

      toast({
        title: "EAP importada!",
        description: `${phases.length} fases, ${activities.length} atividades e ${subactivities.length} sub-atividades criadas.`,
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
              Cole a estrutura WBS abaixo. Nível <strong>X.0</strong> = fase, <strong>X.Y</strong> = atividade, 
              <strong>X.Y.Z</strong> = sub-atividade.
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
                <Badge variant="outline" className="gap-1">
                  <ListTodo className="w-3 h-3" />
                  {subactivities.length} sub-atividades
                </Badge>
              </div>

              <div className="border border-border rounded-lg p-3 max-h-[200px] overflow-y-auto bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Pré-visualização:</p>
                {parsed.map((item, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 py-1 ${
                      item.level === "activity" ? "pl-6" : item.level === "subactivity" ? "pl-12" : ""
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
