import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  ClipboardList,
  Clock,
  HelpCircle,
  Inbox,
  Lightbulb,
  MessageSquare,
  Pencil,
  Target,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CRITERIOS,
  classificar,
  criteriosDoItem,
  indicePrioridade,
  statusLabels,
} from "@/components/roadmap/criterios";
import type { RoadmapItem } from "@/components/roadmap/types";
import {
  MOTIVOS_PRAZO,
  PROBLEMAS,
  TIPOS_NECESSIDADE,
  TIPOS_RESULTADO,
  labelOf,
} from "@/components/roadmap/solicitacaoLabels";

interface Props {
  item: RoadmapItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (item: RoadmapItem) => void;
  /** Arquiva a demanda (status "descartado") — não apaga o registro. */
  onArquivar: (item: RoadmapItem) => void;
}

/** Um campo de texto; não renderiza nada quando não há valor. */
function Field({ label, value }: { label?: string; value?: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="space-y-1">
      {label && (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      )}
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  );
}

/** Seção com ícone semântico — o ícone diz do que se trata, sem numeração. */
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
      </h3>
      <div className="space-y-3 pl-6">{children}</div>
    </section>
  );
}

/** Métrica em destaque: o dado que importa vem antes do rótulo. */
function Metric({
  icon: Icon,
  value,
  label,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: React.ReactNode;
  label: string;
  tone?: "default" | "warning" | "critical";
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2.5">
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          tone === "critical" && "text-destructive",
          tone === "warning" && "text-amber-600 dark:text-amber-500",
          tone === "default" && "text-muted-foreground",
        )}
      />
      <div className="min-w-0">
        <p
          className={cn(
            "text-sm font-semibold leading-tight tabular-nums",
            tone === "critical" && "text-destructive",
          )}
        >
          {value}
        </p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

const dateBR = (iso?: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR") : null;

const moneyBR = (v?: number | null) =>
  v === null || v === undefined
    ? null
    : v.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      });

/** Dias até a data pedida (negativo = vencida). */
function diasRestantes(iso?: string | null): number | null {
  if (!iso) return null;
  const alvo = new Date(`${iso}T00:00:00`).getTime();
  const hoje = new Date().setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / 86_400_000);
}

/**
 * Exibe, em modo somente leitura, os dados enviados pelo solicitante.
 * A hierarquia segue o que o avaliador precisa decidir — prioridade, impacto e
 * prazo primeiro; o detalhamento do pedido depois.
 */
export function RoadmapItemDetails({
  item,
  open,
  onOpenChange,
  onEdit,
  onArquivar,
}: Props) {
  if (!item) return null;

  const isSolicitacao = item.origem === "formulario";

  const notas = criteriosDoItem(item);
  const indice = indicePrioridade(notas);
  const classe = classificar(indice);

  const problemas = [
    ...(item.problemas ?? []).map((p) => labelOf(PROBLEMAS, p)),
    ...(item.problemas_outro ? [item.problemas_outro] : []),
  ];

  const tiposResultado = [
    ...(item.tipos_resultado ?? []).map((t) => labelOf(TIPOS_RESULTADO, t)),
    ...(item.tipos_resultado_outro ? [item.tipos_resultado_outro] : []),
  ];

  const tipoNecessidade =
    item.tipo_necessidade === "outro"
      ? item.tipo_necessidade_outro
      : item.tipo_necessidade
        ? TIPOS_NECESSIDADE[item.tipo_necessidade] ?? item.tipo_necessidade
        : null;

  const motivoPrazo =
    item.motivo_prazo === "outro"
      ? item.motivo_prazo_outro
      : item.motivo_prazo
        ? MOTIVOS_PRAZO[item.motivo_prazo] ?? item.motivo_prazo
        : null;

  const dias = diasRestantes(item.data_necessaria);
  const prazoTone =
    dias === null ? "default" : dias < 0 ? "critical" : dias <= 30 ? "warning" : "default";
  const prazoLabel =
    dias === null
      ? "Prazo desejado"
      : dias < 0
        ? `Venceu há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"}`
        : `Faltam ${dias} dia${dias === 1 ? "" : "s"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* ── Cabeçalho ── */}
        <DialogHeader className="space-y-3 border-b px-6 py-5 text-left">
          <div className="flex items-center gap-2">
            {isSolicitacao ? (
              <Inbox className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <Lightbulb className="h-4 w-4 shrink-0 text-primary" />
            )}
            <DialogTitle className="text-[11px] font-semibold uppercase tracking-widest text-primary">
              {isSolicitacao ? "Solicitação de Projeto" : "Ideia do Roadmap"}
            </DialogTitle>
          </div>

          {/* O objetivo é a informação mais importante: vira o título real. */}
          <p className="pr-8 text-lg font-semibold leading-snug text-foreground text-balance">
            {item.title}
          </p>

          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {item.classificado_em ? (
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 font-bold tabular-nums",
                    classe.className,
                  )}
                >
                  {indice}% · {classe.label}
                </span>
              ) : (
                <Badge
                  variant="outline"
                  className="border-dashed font-normal text-muted-foreground"
                >
                  A classificar
                </Badge>
              )}
              <Badge variant="outline" className="font-normal">
                {statusLabels[item.status] ?? item.status}
              </Badge>
              {isSolicitacao && (
                <span className="text-muted-foreground">
                  {item.solicitante_nome}
                  {item.area && ` · ${item.area}`}
                  {item.created_at &&
                    ` · ${new Date(item.created_at).toLocaleDateString("pt-BR")}`}
                </span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-6 py-5">
          {!isSolicitacao ? (
            <Field label="Descrição" value={item.description} />
          ) : (
            <>
              {/* ── Métricas que decidem: impacto atual e prazo ── */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric
                  icon={Clock}
                  value={item.horas_semana != null ? `${item.horas_semana}h` : "—"}
                  label="Por semana"
                />
                <Metric
                  icon={Users}
                  value={item.pessoas_envolvidas ?? "—"}
                  label="Pessoas envolvidas"
                />
                <Metric
                  icon={Wallet}
                  value={moneyBR(item.custo_atual) ?? "—"}
                  label="Custo atual/mês"
                />
                <Metric
                  icon={CalendarClock}
                  value={dateBR(item.data_necessaria) ?? "—"}
                  label={prazoLabel}
                  tone={prazoTone}
                />
              </div>

              <Section icon={Target} title="O que se espera">
                <Field label="Resultado esperado" value={item.resultado_esperado} />
                {tiposResultado.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Entregáveis
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {tiposResultado.map((t) => (
                        <Badge key={t} variant="secondary" className="font-normal">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <Field
                  label="Primeira entrega (mínimo entregável)"
                  value={item.minimo_entregavel}
                />
              </Section>

              <Separator />

              <Section icon={AlertTriangle} title="Situação atual">
                <Field label="Como é feito hoje" value={item.processo_atual} />
                {problemas.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Problemas relatados
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {problemas.map((p) => (
                        <Badge
                          key={p}
                          variant="outline"
                          className="border-destructive/30 font-normal text-destructive"
                        >
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </Section>

              <Separator />

              <Section icon={HelpCircle} title="Perguntas a responder">
                <Field value={item.perguntas} />
              </Section>

              <Separator />

              <Section icon={ClipboardList} title="Pedido">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Tipo de necessidade" value={tipoNecessidade} />
                  <Field label="Motivo do prazo" value={motivoPrazo} />
                  <Field label="E-mail" value={item.solicitante_email} />
                  <Field label="Cargo" value={item.solicitante_cargo} />
                </div>
              </Section>

              {item.observacoes && (
                <>
                  <Separator />
                  <Section icon={MessageSquare} title="Observações">
                    <Field value={item.observacoes} />
                  </Section>
                </>
              )}
            </>
          )}

          {/* ── Classificação já feita ── */}
          {item.classificado_em && (
            <>
              <Separator />
              <section className="space-y-3 rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Classificação</h3>
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs font-bold tabular-nums",
                      classe.className,
                    )}
                  >
                    {indice}%
                  </span>
                </div>

                <div className="space-y-1.5">
                  {CRITERIOS.map((c) => {
                    const nota = notas[c.key];
                    return (
                      <div key={c.key} className="flex items-center gap-3">
                        <span className="flex-1 text-xs text-muted-foreground">
                          {c.label}
                        </span>
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${(nota / 5) * 100}%` }}
                          />
                        </div>
                        <span className="w-3 text-right text-xs font-bold tabular-nums">
                          {nota}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {item.custo_desenvolvimento != null && (
                  <div className="flex items-center justify-between border-t pt-2 text-xs">
                    <span className="text-muted-foreground">
                      Custo do desenvolvimento
                    </span>
                    <span className="font-semibold tabular-nums">
                      {moneyBR(item.custo_desenvolvimento)}
                    </span>
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        {/* ── Ação ── */}
        <div className="sticky bottom-0 flex items-center gap-2 border-t bg-background px-6 py-4">
          {item.status !== "descartado" && (
            <Button
              variant="ghost"
              onClick={() => {
                onOpenChange(false);
                onArquivar(item);
              }}
              className="text-muted-foreground"
            >
              <Archive className="mr-2 h-4 w-4" />
              Arquivar
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="ml-auto"
          >
            Fechar
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onEdit(item);
            }}
          >
            <Pencil className="mr-2 h-4 w-4" />
            {item.classificado_em ? "Reavaliar" : "Classificar demanda"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
