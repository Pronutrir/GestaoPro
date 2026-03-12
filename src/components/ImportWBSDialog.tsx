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
  const rawItems: { code: string; title: string }[] = [];

  for (const line of lines) {
    const match = line.match(/^(\d+(?:\.\d+)*)\.?\s+(.+)$/);
    if (!match) continue;
    rawItems.push({ code: match[1], title: match[2].trim() });
  }

  if (rawItems.length === 0) return [];

  const depths = rawItems.map(i => i.code.split(".").length);
  const minDepth = Math.min(...depths);

  // Detect X.0 pattern (old format)
  const hasZeroPattern = rawItems.some(i => {
    const p = i.code.split(".");
    return p.length === 2 && p[1] === "0";
  });

  // Determine which depth level = phase
  // If minDepth=1 → level 1 is project title (skip), level 2 = phase
  // If minDepth=2 and hasZeroPattern → X.0 = phase
  // If minDepth=2 no zero → level 2 = phase
  const phaseDepth = hasZeroPattern ? 2 : (minDepth === 1 ? 2 : minDepth);
  const activityDepth = phaseDepth + 1;

  const result: ParsedItem[] = [];

  for (const item of rawItems) {
    const dotParts = item.code.split(".");
    const depth = dotParts.length;

    // Skip project title (depth < phaseDepth)
    if (depth < phaseDepth) continue;
    // Skip X.0 in zero-pattern (it's the phase)
    if (hasZeroPattern && depth === 2 && dotParts[1] === "0") {
      result.push({ code: item.code, title: item.title, level: "phase", parentCode: null });
      continue;
    }

    if (depth === phaseDepth && !hasZeroPattern) {
      result.push({ code: item.code, title: item.title, level: "phase", parentCode: null });
    } else if (depth === activityDepth || (hasZeroPattern && depth === 2)) {
      const parentCode = hasZeroPattern
        ? dotParts[0] + ".0"
        : dotParts.slice(0, phaseDepth).join(".");
      const level = (hasZeroPattern && depth === 2) ? "activity" : "activity";
      result.push({ code: item.code, title: item.title, level, parentCode });
    } else {
      // Levels deeper than activity → subactivity, parent is one level up
      const parentCode = dotParts.slice(0, depth - 1).join(".");
      result.push({ code: item.code, title: item.title, level: "subactivity", parentCode });
    }
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

      // Create all non-phase items in order, tracking IDs for parent chaining
      const codeIdMap: Record<string, string> = {};
      const phaseOrderCounter: Record<string, number> = {};
      const nonPhaseItems = parsed.filter(i => i.level !== "phase");

      // Helper: find the phase_id for any item by walking up the parent chain
      const findPhaseId = (item: ParsedItem): string | null => {
        if (item.parentCode && phaseIdMap[item.parentCode]) return phaseIdMap[item.parentCode];
        // Walk up to find the phase
        const dotParts = item.code.split(".");
        for (let len = dotParts.length - 1; len >= 1; len--) {
          const ancestor = dotParts.slice(0, len).join(".");
          if (phaseIdMap[ancestor]) return phaseIdMap[ancestor];
        }
        return null;
      };

      for (const item of nonPhaseItems) {
        const phaseId = findPhaseId(item);
        const parentId = item.parentCode ? codeIdMap[item.parentCode] || null : null;
        const phaseKey = phaseId || "__none__";
        if (!(phaseKey in phaseOrderCounter)) phaseOrderCounter[phaseKey] = 0;

        const { data, error } = await supabase.from("activities").insert({
          project_id: projectId,
          title: `${item.code} ${item.title}`,
          phase_id: phaseId,
          parent_id: parentId,
          display_order: phaseOrderCounter[phaseKey]++,
        }).select("id").single();

        if (error) throw error;
        codeIdMap[item.code] = data.id;
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
