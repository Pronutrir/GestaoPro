'use client';
// Painel de DETALHE do card (Item 2 da rodada final): clicar no card abre
// leitura, como Linear/Jira/Trello/Notion — editar vira botão explícito.
// Comentários e anexos reusam os componentes completos que já existiam.
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Circle, Pencil, Flag, Hourglass, Diamond, Layers } from "lucide-react";
// Mesmo componente do diálogo de edição: os dois liam/gravavam a MESMA tabela
// (activity_comments) com nomes diferentes. Este tem histórico, comentários das
// subatividades e @menção — o antigo ActivityComments era a versão plana.
import { ActivityRegistro } from "@/components/ActivityRegistro";
import { ActivityAttachments } from "@/components/ActivityAttachments";
import { normalizeGut, GUT_META } from "@/lib/gutPriority";
import { ROTULO_GUT_VAZIO } from "@/lib/mesaDePlanejamento";
import { resolveEapKind } from "@/lib/eapModel";
import { SubatividadesNoCorpo } from "@/components/atividade/SubatividadesNoCorpo";
import { TrilhaDaAtividade } from "@/components/atividade/TrilhaDaAtividade";
import { carregarTrilha, carregarPessoas, type DegrauDaTrilha, type PessoaDaAtividade } from "@/lib/telaDaAtividadeDados";
import { getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";
import { getStageDisplayTitle, type Activity, type WorkflowStage, type Phase } from "./shared";
import { cn } from "@/lib/utils";

const fmtBr = (ymd?: string | null) => {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
};

export function ActivityDetailPanel({
  activity,
  stages,
  phases,
  projectId,
  profilesMap = {},
  profileAvatarMap = {},
  waitingOnCount,
  onClose,
  onEdit,
  onToggleComplete,
}: {
  activity: Activity | null;
  stages: WorkflowStage[];
  phases: Phase[];
  projectId: string;
  profilesMap?: Record<string, string>;
  profileAvatarMap?: Record<string, string>;
  waitingOnCount?: number;
  onClose: () => void;
  onEdit: (a: Activity) => void;
  onToggleComplete: (a: Activity) => void;
}) {
  const [trilha, setTrilha] = useState<DegrauDaTrilha[]>([]);
  const [pessoas, setPessoas] = useState<PessoaDaAtividade[]>([]);
  // Atalhos com o painel aberto: E edita, espaço conclui/reabre.
  // Esc já fecha pelo próprio Sheet. Digitando (comentário), nada dispara.
  useEffect(() => {
    if (!activity) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        onEdit(activity);
      } else if (e.key === " ") {
        e.preventDefault();
        onToggleComplete(activity);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activity, onEdit, onToggleComplete]);

  /**
   * A TRILHA — "1 › 1.1 › 1.1.1", lendo activity_breadcrumb.
   *
   * A view existe desde a P00 e NENHUMA tela a usava. É o que dá contexto a
   * quem chega à atividade só por atribuição: sem ela, a pessoa recebe uma
   * tarefa solta, sem saber de que fase faz parte.
   *
   * O erro NÃO vira trilha vazia: uma trilha vazia diria "isto é de raiz", que
   * é informação errada. Fica só sem trilha, e o resto do painel funciona.
   */
  useEffect(() => {
    if (!activity?.id) { setTrilha([]); return; }
    let vivo = true;
    carregarTrilha(activity.id)
      .then((t) => { if (vivo) setTrilha(t); })
      .catch(() => { if (vivo) setTrilha([]); });
    return () => { vivo = false; };
  }, [activity?.id]);

  /**
   * Responsáveis no PLURAL, de activity_assignees.
   *
   * Falha em silêncio de propósito AQUI, e só aqui: se a tabela não responder,
   * o painel cai no `assigned_to` texto, que é o dado antigo e continua
   * válido. Não é fallback silencioso — é ordem de precedência declarada,
   * e o campo texto some da tela no dia em que a conversão terminar.
   */
  useEffect(() => {
    if (!activity?.id) { setPessoas([]); return; }
    let vivo = true;
    carregarPessoas(activity.id)
      .then((ps) => { if (vivo) setPessoas(ps); })
      .catch(() => { if (vivo) setPessoas([]); });
    return () => { vivo = false; };
  }, [activity?.id]);

  if (!activity) return null;

  const stage = stages.find((s) => s.id === activity.workflow_stage_id);
  const phase = activity.phase_id ? phases.find((p) => p.id === activity.phase_id) : null;
  const kind = resolveEapKind(activity, false);
  const gut = GUT_META[normalizeGut(activity.priority)];
  const assignee = activity.assigned_to ? (profilesMap[activity.assigned_to] ?? activity.assigned_to) : null;
  const assigneeAvatar = activity.assigned_to
    ? resolveAvatarFromLookup(activity.assigned_to, assignee ?? "", profileAvatarMap)
    : undefined;
  const done = activity.status === "completed";
  const responsaveis = pessoas.filter((p) => p.papel === "responsavel");

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b space-y-2 text-left">
          {/* A TRILHA vem primeiro: é o que situa a atividade antes de a pessoa
              ler o nome dela. Some quando o item é de raiz — não há o que
              mostrar, e uma trilha de um degrau só seria ruído. */}
          {trilha.length > 0 && (
            <TrilhaDaAtividade
              projectId={projectId}
              degraus={trilha}
              atual={activity.wbs_code ?? null}
            />
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {activity.wbs_code && (
              <span className="inline-flex items-center h-[17px] px-1.5 rounded border bg-muted font-mono text-[10px] text-muted-foreground">
                {activity.wbs_code}
              </span>
            )}
            {kind === "marco"
              ? <Badge variant="outline" className="text-[10px] gap-1"><Diamond className="w-3 h-3" /> Marco</Badge>
              : kind === "fase"
                ? <Badge variant="outline" className="text-[10px] gap-1"><Layers className="w-3 h-3" /> Fase / Entrega</Badge>
                : null}
            {stage && (
              <Badge variant="outline" className="text-[10px] gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                {getStageDisplayTitle(stage.title)}
              </Badge>
            )}
            {activity.is_blocked && (
              <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/50 text-amber-600">
                <Flag className="w-3 h-3 fill-current" /> Bloqueada
              </Badge>
            )}
          </div>
          <SheetTitle className={cn("text-base leading-snug", done && "line-through text-muted-foreground")}>
            {activity.title}
          </SheetTitle>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => onEdit(activity)} title="Editar (E)">
              <Pencil className="w-3.5 h-3.5" /> Editar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => onToggleComplete(activity)}
              title={done ? "Reabrir (espaço)" : "Concluir (espaço)"}
            >
              {done
                ? <><CheckCircle2 className="w-3.5 h-3.5 text-success" /> Reabrir</>
                : <><Circle className="w-3.5 h-3.5" /> Concluir</>}
            </Button>
          </div>
        </SheetHeader>

        <div className="px-5 py-4 space-y-4">
          {(waitingOnCount ?? 0) > 0 && (
            <div className="flex items-center gap-2 text-xs font-medium text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
              <Hourglass className="w-3.5 h-3.5" />
              Aguarda {waitingOnCount} predecessora{(waitingOnCount ?? 0) > 1 ? "s" : ""} não concluída{(waitingOnCount ?? 0) > 1 ? "s" : ""}
            </div>
          )}
          {activity.is_blocked && activity.blocked_reason && (
            <div className="text-xs text-muted-foreground bg-muted/50 border rounded-md px-3 py-2">
              <span className="font-medium text-foreground">Motivo do bloqueio: </span>
              {activity.blocked_reason}
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Prioridade</p>
              {normalizeGut(activity.priority) === "pendente" ? (
                /* "Sem avaliação GUT" descrevia o CAMPO; "Prioridade não
                   avaliada" descreve a SITUAÇÃO — e é o que a pessoa precisa
                   resolver. Fonte do rótulo: lib/mesaDePlanejamento. */
                <p className="text-sm text-muted-foreground">{ROTULO_GUT_VAZIO}</p>
              ) : (
                <p className="text-sm flex items-center gap-1.5">
                  <span className={cn("w-2 h-2 rounded-full", gut.dotClass)} />
                  {gut.label}
                </p>
              )}
            </div>
            {/* RESPONSÁVEIS, NO PLURAL — o primeiro item do diagnóstico da
                seção 01 é "Responsável no singular". Lê activity_assignees, a
                tabela da fase 02; o campo texto `assigned_to` entra só como
                complemento, para não perder quem ainda não foi convertido.

                O vazio DIZ O QUE FALTA: "sem responsável", nunca "—" mudo. Um
                traço não distingue "ninguém assumiu" de "não se aplica". */}
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
                {responsaveis.length > 1 ? "Responsáveis" : "Responsável"}
              </p>
              {responsaveis.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {responsaveis.map((r) => (
                    <p key={r.id} className="text-sm flex items-center gap-1.5 min-w-0">
                      <Avatar className="h-[18px] w-[18px]">
                        <AvatarFallback className="text-[7px] font-semibold">{r.iniciais}</AvatarFallback>
                      </Avatar>
                      <span className="truncate">{r.nome}</span>
                    </p>
                  ))}
                </div>
              ) : assignee ? (
                <p className="text-sm flex items-center gap-1.5">
                  <Avatar className="h-[18px] w-[18px]">
                    {assigneeAvatar ? <AvatarImage src={assigneeAvatar} alt={assignee} /> : null}
                    <AvatarFallback className="text-[7px] font-semibold">{getAvatarInitials(assignee)}</AvatarFallback>
                  </Avatar>
                  <span className="truncate">{assignee}</span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground/60">sem responsável</p>
              )}
            </div>
            {/* PREVISTO e REALIZADO lado a lado — o diagnóstico da seção 01
                diz "uma data só, sem realizado". Planejar é decidir quando
                começa e quando termina; acompanhar é ver o que de fato
                aconteceu. Mostrar só o previsto esconde metade da decisão. */}
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Previsto</p>
              <p className={cn("text-sm tabular-nums", !activity.start_date && !activity.end_date && "text-muted-foreground/60")}>
                {activity.start_date || activity.end_date
                  ? `${fmtBr(activity.start_date)} → ${fmtBr(activity.end_date)}`
                  : "sem data"}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Realizado</p>
              <p className={cn("text-sm tabular-nums", !activity.actual_start_date && "text-muted-foreground/60")}>
                {activity.actual_start_date
                  ? `${fmtBr(activity.actual_start_date)} → ${activity.actual_end_date ? fmtBr(activity.actual_end_date) : "em curso"}`
                  : "não começou"}
              </p>
            </div>
            {phase && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Fase</p>
                <p className="text-sm truncate">{phase.title}</p>
              </div>
            )}
            {Number(activity.hours) > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Horas planejadas</p>
                <p className="text-sm tabular-nums">{Number(activity.hours)}h</p>
              </div>
            )}
            {activity.participants && activity.participants.length > 0 && (
              <div className="col-span-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">Participantes</p>
                <p className="text-sm">{activity.participants.map((p) => profilesMap[p] ?? p).join(", ")}</p>
              </div>
            )}
          </div>

          {activity.description && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Descrição</p>
              <p className="text-sm whitespace-pre-wrap text-foreground/90">{activity.description}</p>
            </div>
          )}

          {/* AS SUBATIVIDADES NO CORPO — fecha o "nenhuma subatividade à vista,
              embora existam 6" do diagnóstico da seção 01. O componente some
              sozinho quando não há filhas. */}
          <Separator />
          <SubatividadesNoCorpo
            activityId={activity.id}
            atividade={activity as never}
            resolverNome={(bruto) => profilesMap[bruto] ?? bruto}
          />

          <Separator />
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Anexos</p>
            <ActivityAttachments activityId={activity.id} projectId={projectId} />
          </div>

          <Separator />
          <div>
            {/* "O QUE ANDOU", não "Conversa" — o diagnóstico da seção 01 diz
                "o histórico é um chat, não um feed". Chat mostra o que
                disseram; feed mostra o que ACONTECEU, inclusive o que ninguém
                digitou. `includeSubActivities` já traz o que andou nas filhas,
                que é o par da regra do quadro: a filha não vira cartão sozinha,
                então o que acontece nela precisa chegar a quem olha o pai. */}
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">O que andou</p>
            <ActivityRegistro
              activityId={activity.id}
              projectId={projectId}
              phaseId={activity.phase_id ?? null}
              includeSubActivities
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
