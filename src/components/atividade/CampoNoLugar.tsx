'use client';

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * CAMPO EDITÁVEL NO LUGAR — a peça que faz "não existe modo edição".
 *
 * ============================================================================
 * A REGRA DO DESENHO
 *
 *   *"Não existe modo Editar. Cada campo é editável no lugar conforme as
 *   capacidades e salva sozinho. Campo sem permissão vira TEXTO, não controle
 *   desabilitado."*
 *
 * São quatro estados, e a diferença entre o terceiro e o quarto é o que
 * costuma se perder:
 *
 *   repouso     parece leitura — sem borda, sem fundo de input
 *   foco        vira controle NO LUGAR, sem pular de posição
 *   salvando    o valor já aparece novo; o aviso é discreto
 *   sem permissão  é TEXTO. Não é input apagado — simplesmente não é controle
 *
 * POR QUE "DESABILITADO" NÃO SERVE: um input cinza comunica "você poderia
 * mexer, mas está bloqueado agora", e convida ao clique. Quem não tem
 * permissão não está bloqueado temporariamente — aquele campo não é dele. O
 * desenho é explícito: *"botão sem permissão NÃO APARECE — nunca apagado."*
 *
 * ============================================================================
 * SAIR GRAVA, E POR QUE ISSO NÃO É PERIGOSO
 *
 * Não há botão "salvar". Sair do campo grava. Isso só é aceitável porque a
 * confirmação existe e é reversível: a linha aparece no feed com "desfazer".
 * Sem esse par, gravar ao sair seria gravação silenciosa — o defeito que a
 * regra do "sucesso sem escrita não é sucesso" já custou caro aqui.
 *
 * ESC CANCELA, e é o par do Enter: sem ele, quem começou a digitar por engano
 * não tem saída a não ser apagar de volta e torcer para lembrar o original.
 * ============================================================================
 */
export interface CampoNoLugarProps {
  /** O rótulo à esquerda. Sempre visível — inclusive quando o valor é vazio. */
  rotulo: string;
  /** O valor atual, já formatado para leitura. */
  valor: string | null | undefined;
  /**
   * O que dizer quando não há valor. **Nunca "—" nem "0"**: o desenho manda o
   * vazio dizer o que falta ("sem responsável", "sem data"), porque um traço
   * mudo não distingue "ninguém preencheu" de "não se aplica".
   */
  vazio: string;
  /** Sem isto, o campo é TEXTO. É assim que a permissão chega aqui. */
  aoGravar?: (novo: string) => Promise<void>;
  /**
   * O que vai NO INPUT ao editar, quando difere do que se lê. Ex.: Esforço lê
   * "24h previstas · 9h apontadas" mas edita "24". Sem isto, o campo colocaria a
   * string formatada no input e `Number(...)` viraria NaN.
   */
  valorEdicao?: string;
  /** Multilinha para descrição; uma linha para o resto. */
  multilinha?: boolean;
  /** Dica no estado de edição. */
  dica?: string;
  className?: string;
}

export function CampoNoLugar({
  rotulo,
  valor,
  vazio,
  aoGravar,
  valorEdicao,
  multilinha = false,
  dica,
  className,
}: CampoNoLugarProps) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const podeEditar = typeof aoGravar === "function";
  const temValor = !!(valor ?? "").trim();

  useEffect(() => {
    if (editando && ref.current) {
      ref.current.focus();
      // Cursor no fim, não selecionando tudo: quem clica num campo com conteúdo
      // quase sempre quer ajustar, não substituir.
      const n = ref.current.value.length;
      ref.current.setSelectionRange(n, n);
    }
  }, [editando]);

  // A base de comparação e o que vai no input: `valorEdicao` quando o que se lê
  // difere do que se edita (Esforço, custo).
  const base = valorEdicao ?? valor ?? "";

  const abrir = () => {
    if (!podeEditar) return;
    setRascunho(base);
    setErro(null);
    setEditando(true);
  };

  const gravar = async () => {
    if (!podeEditar) return;
    const novo = rascunho.trim();
    // Nada mudou: fecha sem escrever. Gravar igual gera linha no feed e
    // confunde quem lê o histórico depois.
    if (novo === base.trim()) {
      setEditando(false);
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await aoGravar(novo);
      setEditando(false);
    } catch (e) {
      // SEM FALLBACK SILENCIOSO: o campo VOLTA a mostrar o rascunho e diz o que
      // houve. Fechar como se tivesse gravado é o defeito do "sucesso sem
      // escrita" — a tela anunciando o que o banco recusou.
      setErro(e instanceof Error ? e.message : "não foi possível gravar");
    } finally {
      setSalvando(false);
    }
  };

  /* ── SEM PERMISSÃO: é texto, e acabou ────────────────────────────────── */
  if (!podeEditar) {
    return (
      <div className={cn("flex flex-col gap-0.5 min-w-0", className)}>
        <span className="text-[11px] text-muted-foreground">{rotulo}</span>
        <span className={cn("text-[13px]", temValor ? "text-foreground" : "text-muted-foreground/60")}>
          {temValor ? valor : vazio}
        </span>
      </div>
    );
  }

  /* ── EM EDIÇÃO ────────────────────────────────────────────────────────── */
  if (editando) {
    const comum = {
      ref: ref as never,
      value: rascunho,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setRascunho(e.target.value),
      onBlur: gravar,
      placeholder: dica,
      disabled: salvando,
      className: cn(
        "w-full bg-background border border-primary rounded-[4px] px-2 py-1 text-[13px]",
        "outline-none ring-2 ring-primary/20",
        salvando && "opacity-60",
      ),
    };
    return (
      <div className={cn("flex flex-col gap-0.5 min-w-0", className)}>
        <span className="text-[11px] text-muted-foreground">{rotulo}</span>
        {multilinha ? (
          <textarea
            {...comum}
            rows={4}
            onKeyDown={(e) => {
              // Multilinha: Enter quebra linha, Ctrl+Enter grava. Trocar isso
              // faria a descrição virar um campo de uma linha só.
              if (e.key === "Escape") { setEditando(false); }
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void gravar(); }
            }}
          />
        ) : (
          <input
            {...comum}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setEditando(false); }
              if (e.key === "Enter") { e.preventDefault(); void gravar(); }
            }}
          />
        )}
        {erro && <span className="text-[11px] text-destructive">{erro}</span>}
      </div>
    );
  }

  /* ── EM REPOUSO: parece leitura ───────────────────────────────────────── */
  return (
    <button
      type="button"
      onClick={abrir}
      className={cn(
        "flex flex-col gap-0.5 min-w-0 text-left rounded-[4px] -mx-1 px-1 py-0.5",
        "hover:bg-muted/60 transition-colors",
        className,
      )}
      title={`Clique para editar · ${rotulo}`}
    >
      <span className="text-[11px] text-muted-foreground">{rotulo}</span>
      <span className={cn("text-[13px]", temValor ? "text-foreground" : "text-muted-foreground/60")}>
        {temValor ? valor : vazio}
      </span>
    </button>
  );
}
