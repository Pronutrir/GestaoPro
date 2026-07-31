'use client';
// CICLO DA LIÇÃO — identificada → ação atribuída → aplicada.
//
// Distinção da OTAN, e é a que separa registro de aprendizado: uma lição só é
// "aprendida" quando algo mudou por causa dela. Até lá é apenas identificada.
//
// O fechamento é VERIFICADO, não autodeclarado: no sistema de lições da Defesa
// australiana, a ausência dessa etapa levou a equipe a marcar itens como
// resolvidos só para limpar a fila — o campo de status virou ficção.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PersonCombobox } from "@/components/PersonCombobox";
import { CheckCircle2, UserPlus, ArrowRight } from "lucide-react";
import { LIFECYCLE_META, type Lesson, type Lifecycle } from "@/lib/lessons";
import { cn } from "@/lib/utils";

interface Props {
  lesson: Lesson;
  people: { id: string; full_name: string; sector: string | null; role_title?: string | null; avatar_url?: string | null }[];
  canManage: boolean;
  onAssign: (ownerId: string, ownerName: string, action: string) => Promise<void>;
  onApply: () => Promise<void>;
}

export function LessonLifecycle({ lesson, people, canManage, onAssign, onApply }: Props) {
  const stage: Lifecycle = (lesson.lifecycle as Lifecycle) || "identificada";
  const meta = LIFECYCLE_META[stage];
  const [assignOpen, setAssignOpen] = useState(false);
  const [owner, setOwner] = useState<{ id: string; name: string } | null>(null);
  const [action, setAction] = useState("");
  const [saving, setSaving] = useState(false);

  const toneCls = {
    draft: "bg-muted text-muted-foreground",
    run: "bg-primary/10 text-primary",
    done: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  }[meta.tone];

  const submitAssign = async () => {
    if (!owner || !action.trim()) return;
    setSaving(true);
    await onAssign(owner.id, owner.name, action.trim());
    setSaving(false);
    setAssignOpen(false);
    setOwner(null);
    setAction("");
  };

  return (
    <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-border/60">
      <Badge className={cn("text-[10px]", toneCls)} variant="secondary" title={meta.hint}>
        {meta.label}
      </Badge>

      {stage === "identificada" && (
        <>
          <span className="text-[11px] text-muted-foreground">
            Ainda não mudou nada — sem ação, é só um registro.
          </span>
          {canManage && (
            <Button size="sm" variant="ghost" className="h-6 gap-1 text-[11px] ml-auto"
              onClick={() => setAssignOpen(true)}>
              <UserPlus className="w-3 h-3" /> Atribuir ação
            </Button>
          )}
        </>
      )}

      {stage === "acao_atribuida" && (
        <>
          <span className="text-[11px] text-muted-foreground truncate flex-1 min-w-0"
                title={lesson.action_text ?? ""}>
            <strong className="text-foreground">{lesson.owner_name}</strong>
            {lesson.action_text ? ` · ${lesson.action_text}` : ""}
          </span>
          {canManage && (
            <Button size="sm" variant="ghost" className="h-6 gap-1 text-[11px] shrink-0"
              onClick={onApply}>
              <CheckCircle2 className="w-3 h-3" /> Marcar como aplicada
            </Button>
          )}
        </>
      )}

      {stage === "aplicada" && (
        <span className="text-[11px] text-muted-foreground">
          Aplicada{lesson.applied_at ? ` em ${new Date(lesson.applied_at).toLocaleDateString("pt-BR")}` : ""}
          {lesson.applied_by_name ? ` por ${lesson.applied_by_name}` : ""}
          {lesson.action_text ? ` · ${lesson.action_text}` : ""}
        </span>
      )}

      {(lesson.reuse_count ?? 0) > 0 && (
        <Badge variant="outline" className="text-[10px] tabular-nums ml-auto"
               title="Vezes que esta lição apareceu no planejamento de outra atividade">
          reaproveitada {lesson.reuse_count}×
        </Badge>
      )}

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Atribuir ação</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-[12px] text-muted-foreground">
              Uma lição só vira aprendizado quando alguém muda alguma coisa. Quem faz, e o quê?
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Responsável *</Label>
              <PersonCombobox
                people={people}
                value={owner?.id ?? null}
                placeholder="Quem vai cuidar disso"
                onSelect={(p) => setOwner({ id: p.id, name: p.full_name })}
                onClear={() => setOwner(null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">O que muda *</Label>
              <Input value={action} onChange={(e) => setAction(e.target.value)}
                placeholder="Ex.: incluir solicitação de acesso no modelo de fase de preparação" />
              <p className="text-[11px] text-muted-foreground">
                Uma mudança concreta em processo, modelo ou checklist — não uma intenção.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>Cancelar</Button>
            <Button onClick={submitAssign} disabled={saving || !owner || !action.trim()}>
              {saving ? "Atribuindo..." : "Atribuir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
