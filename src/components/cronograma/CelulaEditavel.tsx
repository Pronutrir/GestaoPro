'use client';
/**
 * Célula que vira campo ao ser clicada — na tabela do Cronograma.
 *
 * Antes, qualquer ajuste custava abrir o diálogo, achar a aba, salvar e
 * fechar. Para uma tabela de 40 linhas com prazo faltando, era 40 vezes o
 * mesmo caminho.
 *
 * NÃO É CONTROLE NOVO: a célula hospeda os mesmos componentes que a edição já
 * usa — `PersonCombobox`, `DateField`, e a lista de colunas do quadro. Mesma
 * validação, mesma permissão, mesmo comportamento. O que muda é só o caminho
 * até eles.
 *
 * TRÊS ESTADOS, e o terceiro é o raro:
 *
 *   1. parada  — texto simples, nada aceso; é assim quase sempre;
 *   2. hover   — fundo leve e um lápis: "isto se clica";
 *   3. aberta  — o seletor de verdade, uma célula por vez.
 *
 * Gravação OTIMISTA com reversão: o valor aparece na hora e volta atrás se o
 * banco recusar, com o motivo. A tela nunca mostra o que não gravou.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export type CelulaEditavelProps = {
  /** O que aparece quando a célula está parada. */
  children: ReactNode;
  /**
   * Pode editar? Quando false a célula não acende e o clique não faz nada —
   * `motivoBloqueio` explica no tooltip, em vez de deixar o usuário adivinhar.
   */
  editavel: boolean;
  motivoBloqueio?: string;
  /** Rótulo da coluna, para o aria-label ("Editar Responsável"). */
  rotulo: string;
  /**
   * O controle em si, recebendo o fechamento. `fechar(true)` = gravou (a
   * célula pisca); `fechar(false)` = cancelou.
   */
  editor: (fechar: (gravou: boolean) => void) => ReactNode;
  className?: string;
};

export function CelulaEditavel({
  children, editavel, motivoBloqueio, rotulo, editor, className,
}: CelulaEditavelProps) {
  const [aberta, setAberta] = useState(false);
  const [piscando, setPiscando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const fechar = (gravou: boolean) => {
    setAberta(false);
    if (!gravou) return;
    // O pisca confirma que foi: sem botão salvar, a única prova de que a
    // gravação aconteceu é a célula reagir.
    setPiscando(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPiscando(false), 700);
  };

  if (!editavel) {
    return (
      <span className={cn("inline-flex items-center", className)} title={motivoBloqueio}>
        {children}
      </span>
    );
  }

  if (aberta) return <>{editor(fechar)}</>;

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setAberta(true); }}
      aria-label={`Editar ${rotulo}`}
      className={cn(
        "group/cel inline-flex items-center gap-1.5 max-w-full text-left",
        "rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 transition-colors",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        piscando && "bg-emerald-500/15",
        className,
      )}
    >
      <span className="truncate">{children}</span>
      {/* O lápis só no hover: aceso sempre, viraria uma coluna de ícones
          competindo com o dado — que é o que a pessoa lê. */}
      <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover/cel:opacity-100 transition-opacity" />
    </button>
  );
}
