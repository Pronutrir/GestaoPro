'use client';

import { Diamond } from "lucide-react";
import { cn } from "@/lib/utils";
import { iniciaisDe } from "@/lib/telaDaAtividadeDados";

/**
 * O SINO — "O que andou", a coluna de 372px à direita.
 *
 * ============================================================================
 * FEED, NÃO CHAT
 *
 * O diagnóstico da seção 01 do desenho é direto: *"o histórico é um chat, não
 * um feed."* A diferença não é estética.
 *
 * Um chat mostra o que as pessoas **disseram**. Um feed mostra o que
 * **aconteceu** — e o que aconteceu inclui o que ninguém digitou: uma
 * subatividade concluída, horas apontadas, um marco que ficou pronto para
 * confirmação porque a última predecessora fechou.
 *
 * Por isso o feed mistura evento e comentário na mesma coluna, em ordem de
 * tempo. Separá-los em duas abas — que é o estado atual — obriga a pessoa a
 * conferir dois lugares para saber o que houve hoje.
 *
 * ============================================================================
 * A SUBATIVIDADE APARECE AQUI
 *
 * O desenho marca "na subatividade" nos eventos vindos das filhas. É o que
 * fecha o par com a decisão do quadro: a subatividade **não vira cartão
 * sozinha**, então o que acontece nela precisa chegar a quem olha o pai. Sem
 * isso, o trabalho das filhas fica invisível nos dois lugares.
 *
 * ============================================================================
 * O QUE ESTE COMPONENTE NÃO FAZ
 *
 * Não consulta nada. Recebe os eventos prontos e desenha. A leitura vive em
 * `lib/`, pelo mesmo motivo de sempre: três telas consumindo a mesma fonte não
 * divergem; três telas consultando cada uma a sua, sim.
 * ============================================================================
 */
export interface EventoDoFeed {
  id: string;
  /** Quem fez. `null` para evento do sistema (o marco que ficou pronto). */
  autor: string | null;
  /** O que aconteceu, já em português e sem UUID nem enum. */
  texto: string;
  /** "14:12" — só a hora; a data vem do agrupador. */
  hora: string;
  /** Veio de uma filha? O desenho marca isso explicitamente. */
  naSubatividade?: boolean;
  /** Evento de marco ganha o losango, como no resto do sistema. */
  marco?: boolean;
  /** Comentário aparece entre aspas, evento não. */
  ehComentario?: boolean;
}

export interface DiaDoFeed {
  /** "Hoje", "Ontem", "12/08" — resolvido por quem chama. */
  rotulo: string;
  eventos: EventoDoFeed[];
}

export function FeedDaAtividade({
  dias,
  naoLidos,
  aoMarcarLido,
  aoComentar,
  className,
}: {
  dias: DiaDoFeed[];
  naoLidos: number;
  aoMarcarLido?: () => void;
  /** Sem isto, o campo de comentar não aparece — quem só visualiza pode
   *  comentar, mas quem nem isso pode, não vê a caixa. */
  aoComentar?: (texto: string) => Promise<void>;
  className?: string;
}) {
  const vazio = dias.every((d) => d.eventos.length === 0);

  return (
    <aside className={cn("flex flex-col min-h-0 border-l border-border bg-card", className)}>
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-[13px] font-semibold text-foreground">O que andou</h2>
        {naoLidos > 0 && (
          <span
            className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold tabular-nums"
            aria-label={`${naoLidos} não lidos`}
          >
            {naoLidos}
          </span>
        )}
        {naoLidos > 0 && aoMarcarLido && (
          <button
            type="button"
            onClick={aoMarcarLido}
            className="ml-auto text-[11px] text-muted-foreground hover:text-primary underline underline-offset-2"
          >
            marcar como lido
          </button>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        {vazio ? (
          /* O vazio DIZ O QUE FALTA, como manda o desenho — e aqui o que falta
             não é dado, é tempo: a atividade acabou de nascer. */
          <p className="text-[12px] text-muted-foreground/70">
            Nada aconteceu ainda. O que for feito aqui e nas subatividades aparece nesta coluna.
          </p>
        ) : (
          dias.map((dia) => (
            <section key={dia.rotulo} className="mb-4 last:mb-0">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2">
                {dia.rotulo}
              </h3>
              <ul className="flex flex-col gap-2.5">
                {dia.eventos.map((e) => (
                  <li key={e.id} className="flex gap-2 min-w-0">
                    {e.marco ? (
                      <Diamond
                        className="w-[14px] h-[14px] fill-amber-500 text-amber-500 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                    ) : e.autor ? (
                      <span
                        className="shrink-0 w-[22px] h-[22px] rounded-full bg-muted text-muted-foreground text-[10px] font-semibold inline-flex items-center justify-center"
                        aria-hidden="true"
                      >
                        {iniciaisDe(e.autor)}
                      </span>
                    ) : (
                      <span className="shrink-0 w-[22px]" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] text-foreground leading-snug">
                        {e.ehComentario ? `“${e.texto}”` : e.texto}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70">
                        {e.autor && <span>{e.autor} · </span>}
                        {e.naSubatividade && (
                          <span className="text-primary/70">na subatividade · </span>
                        )}
                        {e.hora}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {aoComentar && <CaixaDeComentario aoComentar={aoComentar} />}
    </aside>
  );
}

/**
 * A caixa de comentar.
 *
 * Separada porque tem estado próprio, e porque ela **aparece para quem
 * visualiza**: o desenho diz *"Pode comentar; não pode alterar."* Comentar não
 * é alterar — é a via que quem acompanha tem para participar.
 */
function CaixaDeComentario({ aoComentar }: { aoComentar: (t: string) => Promise<void> }) {
  return (
    <form
      className="shrink-0 border-t border-border p-3"
      onSubmit={async (ev) => {
        ev.preventDefault();
        const el = (ev.currentTarget.elements.namedItem("texto") as HTMLTextAreaElement);
        const t = el.value.trim();
        if (!t) return;
        await aoComentar(t);
        el.value = "";
      }}
    >
      <textarea
        name="texto"
        rows={2}
        placeholder="Escreva algo — use @ para citar alguém"
        className="w-full resize-none bg-background border border-border rounded-[4px] px-2 py-1.5 text-[12.5px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </form>
  );
}
