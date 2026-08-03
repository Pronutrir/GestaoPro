'use client';
// CONVITE DE REGISTRO — o sistema perguntando, com o contexto já escrito.
//
// Dois campos, não dez: formulário de 3–5 campos converte o dobro de um com
// 11, e uma pergunta única no contexto certo chegou a 34% de resposta contra
// 1,8% por e-mail. Categoria, fase, atividade e impacto vêm preenchidos.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AIAssistButton } from "@/components/AIAssistButton";
import { TRIGGER_META, type LessonPrompt } from "@/lib/lessons";

interface Props {
  prompt: LessonPrompt;
  onRegister: (data: { problem: string; suggestion: string }) => Promise<void>;
  onDismiss: () => Promise<void>;
}

export function LessonPromptCard({ prompt, onRegister, onDismiss }: Props) {
  const meta = TRIGGER_META[prompt.trigger_type] ?? TRIGGER_META.bloqueio;
  const [problem, setProblem] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const submit = async () => {
    if (!problem.trim()) return;
    setSaving(true);
    await onRegister({ problem: problem.trim(), suggestion: suggestion.trim() });
    setSaving(false);
  };

  // FASE 4 — IA. O evento já descreve o cenário, então a IA recebe esse
  // contexto e trabalha o texto que a PESSOA escreveu. Ela nunca inventa a
  // lição: quem viveu o problema é quem sabe qual foi.
  const aiContext = [
    `Evento: ${meta.label}`,
    `Item: ${prompt.context_title}`,
    prompt.context_detail ? `Motivo: ${prompt.context_detail}` : null,
    prompt.impact_days ? `Impacto: ${prompt.impact_days} dia(s)` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3.5">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Badge className="bg-amber-500 text-white text-[10px] hover:bg-amber-500">Registre esta lição</Badge>
        <span className="text-[11px] text-muted-foreground">
          {meta.icon} {meta.label} · detectado automaticamente
        </span>
        {prompt.impact_days ? (
          <Badge variant="outline" className="text-[10px] tabular-nums ml-auto">
            {prompt.impact_days} dia(s) de impacto
          </Badge>
        ) : null}
      </div>

      {/* O contexto já vem escrito — a pessoa não precisa lembrar de nada */}
      <p className="text-[13px] text-foreground mb-3">
        {meta.question({
          title: prompt.context_title,
          detail: prompt.context_detail,
          days: prompt.impact_days,
        })}
      </p>

      {!open ? (
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" className="h-8 text-xs" onClick={() => setOpen(true)}>
            Registrar lição
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={onDismiss}>
            Não se aplica
          </Button>
          <span className="text-[11px] text-muted-foreground">Dois campos. Leva menos de um minuto.</span>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">O que aconteceu, e o que se esperava? *</Label>
              <AIAssistButton value={problem} onChange={setProblem} context="lesson_problem"
                extraContext={aiContext} actions={["correct", "improve"]} size="icon" />
            </div>
            <Textarea value={problem} onChange={(e) => setProblem(e.target.value)}
              placeholder="Ex.: o acesso dependia de aprovação da segurança, que não estava no plano."
              rows={2} autoFocus className="text-[13px]" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">O que fazer da próxima vez?</Label>
              <AIAssistButton value={suggestion} onChange={setSuggestion} context="lesson_suggestion"
                extraContext={aiContext} actions={["correct", "improve"]} size="icon" />
            </div>
            <Textarea value={suggestion} onChange={(e) => setSuggestion(e.target.value)}
              placeholder="Ex.: incluir a solicitação de acesso como tarefa da fase de preparação."
              rows={2} className="text-[13px]" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" className="h-8 text-xs" onClick={submit} disabled={saving || !problem.trim()}>
              {saving ? "Registrando..." : "Registrar"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Categoria, fase, atividade e impacto já vêm preenchidos.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
