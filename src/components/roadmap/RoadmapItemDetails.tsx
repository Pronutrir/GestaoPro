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
  HelpCircle,
  Inbox,
  Lightbulb,
  MessageSquare,
  Pencil,
  Target,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  CRITERIOS,
  classificar,
  criteriosDoItem,
  indicePrioridade,
  statusLabels,
} from "@/components/roadmap/criterios";
import type { RoadmapItem } from "@/components/roadmap/types";
import { dateBR, diasRestantes, moneyBR } from "@/components/roadmap/format";
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
  /** admin/gestor: priorizar e arquivar são exclusivos deles. */
  canManage: boolean;
  /** Para liberar a edição da própria solicitação ao solicitante. */
  currentUserId?: string;
  onEdit: (item: RoadmapItem) => void;
  /** Arquiva a demanda (status "descartado") — não apaga o registro. */
  onArquivar: (item: RoadmapItem) => void;
}

/** Um campo de texto; não renderiza nada quando não há valor. */
function Field({
  label,
  value,
  className,
}: {
  label?: string;
  value?: React.ReactNode;
  className?: string;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className={cn("space-y-1", className)}>
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


/**
 * Exibe, em modo somente leitura, os dados enviados pelo solicitante.
 * A hierarquia segue o que o avaliador precisa decidir — prioridade, impacto e
 * prazo primeiro; o detalhamento do pedido depois.
 */
export function RoadmapItemDetails({
  item,
  open,
  onOpenChange,
  canManage,
  currentUserId,
  onEdit,
  onArquivar,
}: Props) {
  if (!item) return null;

  const isSolicitacao = item.origem === "formulario";

  /**
   * O solicitante edita o próprio pedido enquanto ninguém começou a avaliar —
   * espelha a policy de RLS em roadmap_items. Depois da priorização, mudar
   * horas ou custo invalidaria a nota sem deixar rastro.
   */
  const podeEditarSolicitacao =
    isSolicitacao &&
    !!currentUserId &&
    item.created_by === currentUserId &&
    item.status === "backlog" &&
    item.classificado_em == null;

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
      {/* Flex-col + corpo rolável: só o conteúdo rola, cabeçalho e rodapé de
          ações ficam fixos. max-h em svh (não vh) para não estourar sob a
          barra de endereço em navegadores móveis. */}
      {/* Largura cresce por breakpoint até 6xl: em telas grandes o modal ocupa
          o espaço disponível em vez de deixar faixas vazias nas laterais. */}
      <DialogContent className="flex w-[calc(100vw-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 max-h-[calc(100svh-2rem)] sm:w-[92vw] sm:max-h-[90svh] lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl">
        {/* ── Cabeçalho ── */}
        <DialogHeader className="shrink-0 space-y-3 border-b px-4 py-4 text-left sm:px-6 sm:py-5">
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
                  A priorizar
                </Badge>
              )}
              <Badge variant="outline" className="font-normal">
                {statusLabels[item.status] ?? item.status}
              </Badge>
              {/* Nome e área saíram daqui: agora aparecem rotulados na seção
                  "1. Identificação". Fica só a data de envio, que não é campo
                  do formulário. */}
              {isSolicitacao && item.created_at && (
                <span className="text-muted-foreground">
                  Enviada em{" "}
                  {new Date(item.created_at).toLocaleDateString("pt-BR")}
                </span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {!isSolicitacao ? (
            <Field label="Descrição" value={item.description} />
          ) : (
            <>
              {/* As seções seguem os 6 passos do formulário de solicitação, com
                  as mesmas perguntas — quem lê acompanha o que o solicitante
                  respondeu, na ordem em que respondeu. */}
              <Section icon={ClipboardList} title="1. Identificação">
                {/* Campos curtos: em telas largas cabem todos numa faixa só. */}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <Field label="Nome completo" value={item.solicitante_nome} />
                  <Field label="E-mail" value={item.solicitante_email} />
                  <Field label="Área/Departamento" value={item.area} />
                  <Field label="Cargo" value={item.solicitante_cargo} />
                  <Field label="Tipo de necessidade" value={tipoNecessidade} />
                </div>
              </Section>

              <Separator />

              <Section icon={AlertTriangle} title="2. Situação Atual e Problemas">
                {/* max-w-prose: texto corrido que atravessa 1400px vira uma
                    linha difícil de acompanhar — o olho perde o início da
                    próxima ao voltar. */}
                <Field
                  label="Como você obtém essa informação hoje?"
                  value={item.processo_atual}
                  className="max-w-prose"
                />
                {problemas.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Qual o principal problema hoje?
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
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field
                    label="Horas/semana gastas com isso"
                    value={item.horas_semana != null ? `${item.horas_semana}h` : null}
                  />
                  <Field
                    label="Pessoas envolvidas"
                    value={item.pessoas_envolvidas}
                  />
                  <Field
                    label="Custo atual aproximado"
                    value={moneyBR(item.custo_atual)}
                  />
                </div>
              </Section>

              <Separator />

              <Section icon={Target} title="3. Objetivo e Resultado Esperado">
                {/* Empilhados, não lado a lado: são textos longos de tamanhos
                    muito diferentes (uma frase vs. um parágrafo), e em colunas
                    a mais curta deixa um vão embaixo. max-w-prose mantém a
                    linha legível apesar da largura do modal.
                    O objetivo é o título do item, repetido aqui com a pergunta
                    original porque no cabeçalho aparece sem rótulo. */}
                <Field
                  label="Em uma frase: que decisão ou ação isso vai apoiar?"
                  value={item.title}
                  className="max-w-prose"
                />
                <Field
                  label="Que resultado você espera alcançar?"
                  value={item.resultado_esperado}
                  className="max-w-prose"
                />
              </Section>

              <Separator />

              <Section icon={HelpCircle} title="4. O Que Você Espera Receber">
                {tiposResultado.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Que tipo de resultado você quer?
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
                {/* Também empilhados: mesmo motivo da seção 3. */}
                <Field
                  label="Que perguntas esse relatório/painel precisa responder?"
                  value={item.perguntas}
                  className="max-w-prose"
                />
                <Field
                  label="Qual a primeira entrega (mínimo entregável)?"
                  value={item.minimo_entregavel}
                  className="max-w-prose"
                />
              </Section>

              <Separator />

              <Section icon={CalendarClock} title="5. Prazo e Urgência">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Quando você precisa disso funcionando?"
                    value={
                      dateBR(item.data_necessaria) && (
                        <span
                          className={cn(
                            prazoTone === "critical" && "font-medium text-destructive",
                            prazoTone === "warning" &&
                              "font-medium text-amber-600 dark:text-amber-500",
                          )}
                        >
                          {dateBR(item.data_necessaria)}
                          {/* Mantém o alerta de prazo que o painel de métricas dava. */}
                          {prazoLabel !== "Prazo desejado" && ` · ${prazoLabel}`}
                        </span>
                      )
                    }
                  />
                  <Field label="Por que essa data?" value={motivoPrazo} />
                </div>
              </Section>

              {item.observacoes && (
                <>
                  <Separator />
                  <Section icon={MessageSquare} title="6. Observações Finais">
                    <Field
                      label="Informações adicionais importantes"
                      value={item.observacoes}
                      className="max-w-prose"
                    />
                  </Section>
                </>
              )}
            </>
          )}

          {/* ── Priorização já feita ── */}
          {item.classificado_em && (
            <>
              <Separator />
              <section className="space-y-3 rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Priorização</h3>
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
        {/* shrink-0 em vez de sticky: agora quem rola é o corpo, então o rodapé
            já fica naturalmente fixo no rasgo do flex. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-background px-4 py-3 sm:px-6 sm:py-4">
          {canManage && item.status !== "descartado" && (
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
          {/* Ação do solicitante: edita o conteúdo do próprio pedido. Distinta
              de "Priorizar demanda", que é a avaliação por critérios. */}
          {podeEditarSolicitacao && (
            <Button variant="outline" asChild>
              <Link href={`/solicitacao?id=${item.id}`}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar solicitação
              </Link>
            </Button>
          )}
          {canManage && (
            <Button
              onClick={() => {
                onOpenChange(false);
                onEdit(item);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              {item.classificado_em ? "Reavaliar" : "Priorizar demanda"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
