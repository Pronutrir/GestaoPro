import { useState } from "react";
import { Sparkles, Wand2, FileText, Maximize2, Loader2, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export type AIAction = "correct" | "improve" | "summarize" | "expand";

export type AIContext =
  | "project_title"
  | "project_description"
  | "activity_title"
  | "activity_description"
  | "meeting_title"
  | "meeting_agenda"
  | "meeting_minutes"
  | "risk_description"
  | "risk_mitigation"
  | "risk_contingency"
  | "assumption_description"
  | "lesson_problem"
  | "lesson_solution"
  | "lesson_suggestion"
  | "story_narrative"
  | "story_acceptance"
  | "tap_objective"
  | "tap_problem"
  | "tap_root_cause"
  | "tap_scope"
  | "tap_out_of_scope"
  | "tap_benefits"
  | "tap_restrictions"
  | "tap_regulatory"
  | "generic";

interface AIAssistButtonProps {
  value: string;
  onChange: (next: string) => void;
  context?: AIContext;
  /** Restrict available actions. Defaults to all 4. */
  actions?: AIAction[];
  className?: string;
  size?: "sm" | "icon";
  /** Optional label after the sparkle icon */
  label?: string;
}

const ACTION_META: Record<
  AIAction,
  { label: string; icon: React.ComponentType<{ className?: string }>; description: string }
> = {
  correct: {
    label: "Corrigir",
    icon: CheckCheck,
    description: "Ortografia e gramática",
  },
  improve: {
    label: "Melhorar",
    icon: Wand2,
    description: "Clareza + tom executivo",
  },
  summarize: {
    label: "Resumir",
    icon: FileText,
    description: "Resumo curto e direto",
  },
  expand: {
    label: "Expandir",
    icon: Maximize2,
    description: "Detalhar a ideia",
  },
};

export const AIAssistButton = ({
  value,
  onChange,
  context = "generic",
  actions = ["correct", "improve", "summarize", "expand"],
  className,
  size = "sm",
  label,
}: AIAssistButtonProps) => {
  const [loading, setLoading] = useState<AIAction | null>(null);
  const { toast } = useToast();

  const runAction = async (action: AIAction) => {
    const text = (value ?? "").trim();
    if (!text) {
      toast({
        title: "Campo vazio",
        description: "Escreva algo no campo antes de usar a IA.",
        variant: "destructive",
      });
      return;
    }
    setLoading(action);
    try {
      const { data, error } = await supabase.functions.invoke("ai-text-assist", {
        body: { action, text, context },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const result = (data as { result?: string })?.result?.trim();
      if (!result) throw new Error("IA não retornou texto.");
      onChange(result);
      toast({
        title: "✨ Texto atualizado",
        description: `Ação: ${ACTION_META[action].label}`,
      });
    } catch (e: any) {
      toast({
        title: "Erro na IA",
        description: e?.message ?? "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const isLoading = loading !== null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={size === "icon" ? "icon" : "sm"}
          disabled={isLoading}
          className={cn(
            "gap-1 text-primary hover:text-primary hover:bg-primary/10 h-7",
            size === "icon" && "h-7 w-7",
            className,
          )}
          aria-label="Assistência de IA"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          {size !== "icon" && (
            <span className="text-xs font-medium">{label ?? "IA"}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-primary" />
          Assistente de Texto
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {actions.map((action) => {
          const meta = ACTION_META[action];
          const Icon = meta.icon;
          return (
            <DropdownMenuItem
              key={action}
              disabled={isLoading}
              onClick={(e) => {
                e.preventDefault();
                void runAction(action);
              }}
              className="flex items-start gap-2 cursor-pointer py-2"
            >
              <Icon className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{meta.label}</span>
                <span className="text-[11px] text-muted-foreground">
                  {meta.description}
                </span>
              </div>
              {loading === action && (
                <Loader2 className="w-3.5 h-3.5 animate-spin ml-auto" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};