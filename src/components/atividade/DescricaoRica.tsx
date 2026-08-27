'use client';

import { useState } from "react";
import { cn } from "@/lib/utils";
import { lerTextoRico, progressoDaConferencia, alternarItem } from "@/lib/textoRico";

/**
 * A DESCRIÇÃO — texto que vira lista de conferência, link e @menção.
 *
 * ============================================================================
 * OS QUATRO ESTADOS DE UM CAMPO (seção 06), aqui
 *
 *   repouso   o texto renderizado, com as caixas clicáveis
 *   foco      a área de edição, com o texto CRU — a marcação aparece
 *   salvando  o valor já mudou; o aviso é discreto
 *   sem permissão  renderiza igual, e a caixa não responde ao clique
 *
 * A caixa de conferência é o único controle que funciona **em repouso**, e é
 * de propósito: marcar um item feito é o gesto mais frequente numa descrição,
 * e obrigar a entrar no modo de edição para isso o tornaria caro o bastante
 * para ninguém fazer. O desenho da seção 04 confirma o limite: *"as caixas
 * aparecem, mas não respondem ao clique"* para quem só visualiza.
 * ============================================================================
 */
export function DescricaoRica({
  valor,
  aoGravar,
  resolverMencao,
}: {
  valor: string | null | undefined;
  /** Sem isto, é leitura: as caixas não respondem e não há edição. */
  aoGravar?: (novo: string) => Promise<void>;
  /** Para a @menção virar nome de gente em vez de apelido cru. */
  resolverMencao?: (apelido: string) => string | null;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const texto = valor ?? "";
  const linhas = lerTextoRico(texto);
  const conf = progressoDaConferencia(linhas);
  const podeEditar = typeof aoGravar === "function";

  const gravar = async (novo: string) => {
    if (!aoGravar) return;
    setErro(null);
    try {
      await aoGravar(novo);
      setEditando(false);
    } catch (e) {
      // SEM FALLBACK SILENCIOSO: mantém o rascunho e diz o que houve.
      setErro(e instanceof Error ? e.message : "não foi possível gravar");
    }
  };

  if (editando) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Descrição</p>
        <textarea
          autoFocus
          rows={8}
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={() => void gravar(rascunho)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditando(false);
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void gravar(rascunho); }
          }}
          className="w-full bg-background border border-primary rounded-[4px] px-2 py-1.5 text-[13px] outline-none ring-2 ring-primary/20 font-mono"
        />
        <p className="text-[10.5px] text-muted-foreground">
          {"Use [ ] para lista de conferência, @nome para citar alguém, e cole links direto. Esc cancela."}
        </p>
        {erro && <p className="text-[11px] text-destructive">{erro}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Descrição</p>
        {/* "3 de 5" só quando há lista. Sem lista, dizer "0 de 0" seria
            inventar uma pendência que não existe. */}
        {conf && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {conf.feitos} de {conf.total}
          </span>
        )}
      </div>

      {!texto.trim() ? (
        <button
          type="button"
          disabled={!podeEditar}
          onClick={() => { setRascunho(""); setEditando(true); }}
          className={cn(
            "text-left text-[13px] text-muted-foreground/60 rounded-[4px] -mx-1 px-1 py-0.5",
            podeEditar && "hover:bg-muted/60",
          )}
        >
          {podeEditar ? "clique para escrever" : "sem descrição"}
        </button>
      ) : (
        <div
          className={cn(
            "text-[13px] text-foreground/90 rounded-[4px] -mx-1 px-1 py-0.5",
            podeEditar && "hover:bg-muted/40",
          )}
        >
          {linhas.map((linha, i) => {
            // O índice do item na lista, para o clique saber qual alternar.
            const indiceItem = linhas.slice(0, i + 1).filter((l) => l.conferencia).length - 1;
            const corpo = (
              <>
                {linha.pedacos.map((p, j) => {
                  if (p.tipo === "link") {
                    return (
                      <a
                        key={j}
                        href={p.valor}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2 break-all"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {p.valor}
                      </a>
                    );
                  }
                  if (p.tipo === "mencao") {
                    const nome = resolverMencao?.(p.valor) ?? p.valor;
                    return (
                      <span key={j} className="text-primary font-medium" title={`Menção a ${nome}`}>
                        @{nome}
                      </span>
                    );
                  }
                  return <span key={j}>{p.valor}</span>;
                })}
              </>
            );

            if (linha.conferencia) {
              return (
                <label
                  key={i}
                  className={cn(
                    "flex items-start gap-2 py-0.5",
                    podeEditar ? "cursor-pointer" : "cursor-default",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={linha.conferencia.feito}
                    disabled={!podeEditar}
                    onChange={() => void gravar(alternarItem(texto, indiceItem))}
                    className="mt-[3px] shrink-0 accent-[hsl(var(--primary))]"
                  />
                  <span className={cn(linha.conferencia.feito && "line-through text-muted-foreground")}>
                    {corpo}
                  </span>
                </label>
              );
            }

            return (
              <p
                key={i}
                className="whitespace-pre-wrap"
                onDoubleClick={podeEditar ? () => { setRascunho(texto); setEditando(true); } : undefined}
              >
                {corpo}
              </p>
            );
          })}

          {podeEditar && (
            <button
              type="button"
              onClick={() => { setRascunho(texto); setEditando(true); }}
              className="mt-1 text-[11px] text-muted-foreground hover:text-primary underline underline-offset-2"
            >
              editar descrição
            </button>
          )}
        </div>
      )}
      {erro && <p className="text-[11px] text-destructive">{erro}</p>}
    </div>
  );
}
