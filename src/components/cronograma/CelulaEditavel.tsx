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
  /**
   * A célula está SEM VALOR? Ela então se desenha como campo por preencher —
   * borda tracejada e o que falta escrito — em vez de um "—" mudo.
   */
  vazio?: boolean;
  /** O texto da célula vazia. Padrão: "Definir". */
  rotuloVazio?: string;
  className?: string;
};

export function CelulaEditavel({
  children, editavel, motivoBloqueio, rotulo, editor,
  vazio = false, rotuloVazio = "Definir", className,
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
    // `px-1.5` casa com o padding do botão: sem isso, uma linha bloqueada
    // ficaria 3px deslocada das editáveis, na mesma coluna.
    return (
      <span className={cn("inline-flex items-center px-1.5", className)} title={motivoBloqueio}>
        {children}
      </span>
    );
  }

  // O editor herda o alinhamento da célula: o <td> já é center ou left, e o
  // seletor precisa nascer no mesmo eixo — senão ele abre deslocado e a coluna
  // "pula" ao ser clicada.
  if (aberta) {
    return <span className="inline-flex w-full justify-center">{editor(fechar)}</span>;
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setAberta(true); }}
      aria-label={`Editar ${rotulo}`}
      title={vazio ? `Clique para definir ${rotulo.toLowerCase()}` : `Clique para editar ${rotulo.toLowerCase()}`}
      className={cn(
        "group/cel inline-flex items-center gap-1.5 max-w-full",
        "rounded px-1.5 py-0.5 transition-colors",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // VAZIA PARECE CAMPO. Um "—" solto não se anuncia clicável: ninguém
        // passa o mouse sobre um traço para descobrir se ele faz algo. Com
        // borda tracejada e o texto do que falta, a célula se lê como campo
        // por preencher — que é exatamente o que ela é.
        vazio && "border border-dashed border-muted-foreground/35 text-muted-foreground hover:border-primary/50 hover:text-foreground",
        piscando && "bg-emerald-500/15",
        className,
      )}
    >
      <span className="truncate">{vazio ? rotuloVazio : children}</span>
      {/* O lápis fica no hover para a célula PREENCHIDA — aceso sempre, viraria
          uma coluna de ícones competindo com o dado, que é o que a pessoa lê.
          Na vazia ele é permanente: ali não há dado com que competir, e é o
          que fecha a leitura de "campo a preencher". */}
      <Pencil className={cn(
        "h-3 w-3 shrink-0 text-muted-foreground transition-opacity",
        vazio ? "opacity-60" : "opacity-0 group-hover/cel:opacity-100",
      )} />
    </button>
  );
}
