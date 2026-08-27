'use client';

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { traduzirErroDoBanco } from "@/lib/erroDoBanco";

/**
 * INCLUIR NA EQUIPE E ATRIBUIR — o conserto de verdade.
 *
 * ============================================================================
 * O ERRO QUE ISTO FAZ DESAPARECER
 *
 * Atribuir alguém de fora da equipe devolvia, na cara do usuário:
 *
 *   "usuario 0eb3047e-… nao esta na equipe do projeto dcf977e9-… | P0001"
 *
 * Traduzir a frase resolve metade — a pessoa passa a entender. Este diálogo
 * resolve a outra: **o erro deixa de acontecer**, porque ela é incluída ali
 * mesmo, no gesto em que se descobriu que faltava.
 *
 * ============================================================================
 * DUAS PERGUNTAS, COM PADRÃO SEGURO
 *
 * O desenho (seção 08) pede duas: **qual papel** e **quanto enxerga**. E os
 * padrões não são neutros — são os mais restritos:
 *
 *   papel   "Visualizar e comentar"
 *   escopo  "só esta atividade e a trilha"
 *
 * Porque a regra inviolável do CLAUDE.md é: *"atribuir alguém a uma atividade
 * nunca dá a essa pessoa acesso que ela não tinha ao projeto."* Quem quiser dar
 * mais, escolhe — mas o silêncio não concede.
 *
 * ============================================================================
 * UMA TRANSAÇÃO, E POR ISSO É RPC
 *
 * O vínculo e a atribuição vão juntos, na função `incluir_e_atribuir`. Dois
 * inserts daqui não seriam transação: entre eles cabe a rede cair, e o
 * resultado seria o pior estado possível — pessoa atribuída a uma atividade de
 * um projeto que ela não alcança. Ela apareceria como responsável e não
 * conseguiria abrir o item.
 * ============================================================================
 */

const PAPEIS = [
  { valor: "visualizar_comentar", rotulo: "Visualizar e comentar", ajuda: "Acompanha e comenta. Não altera nada." },
  { valor: "editar", rotulo: "Editar", ajuda: "Altera as atividades em que participa." },
  { valor: "gerenciar", rotulo: "Gerenciar", ajuda: "Administra o projeto e a equipe." },
];

const ESCOPOS = [
  { valor: "atividade_e_trilha", rotulo: "Só esta atividade e a trilha até a fase" },
  { valor: "projeto", rotulo: "O projeto inteiro" },
];

export function IncluirEAtribuir({
  activityId,
  pessoa,
  nomeDoProjeto,
  podeGerenciarEquipe,
  aoFechar,
  aoConcluir,
}: {
  activityId: string;
  pessoa: { id: string; nome: string };
  nomeDoProjeto?: string;
  /** Sem isto, o diálogo mostra o motivo e a saída — não o formulário. */
  podeGerenciarEquipe: boolean;
  aoFechar: () => void;
  aoConcluir?: () => void;
}) {
  const [papel, setPapel] = useState("visualizar_comentar");
  const [escopo, setEscopo] = useState("atividade_e_trilha");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<{ titulo: string; detalhe?: string } | null>(null);

  /* ── QUEM NÃO PODE VÊ O MOTIVO E A SAÍDA ──────────────────────────────────
   *
   * Não um botão apagado: o desenho é explícito — *"os demais veem o motivo e
   * 'solicitar ao gestor'"*. Um controle desabilitado comunica "você poderia,
   * mas está bloqueado agora", e não é isso: incluir na equipe é ato de quem
   * gerencia equipe.
   */
  if (!podeGerenciarEquipe) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-semibold text-foreground">
          {pessoa.nome} não está na equipe {nomeDoProjeto ? `de "${nomeDoProjeto}"` : "deste projeto"}.
        </p>
        <p className="text-[12.5px] text-muted-foreground">
          Incluir alguém na equipe é decisão de quem gerencia o projeto. Você pode
          pedir a inclusão — depois dela, a atribuição funciona normalmente.
        </p>
        <div className="flex items-center gap-2 justify-end">
          <button
            type="button" onClick={aoFechar}
            className="h-8 px-3 rounded-[4px] border border-border text-[12.5px] hover:bg-muted"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={() => {
              // Não inventa um canal que não existe: copia o texto pronto para
              // a pessoa mandar por onde já fala com o gestor.
              void navigator.clipboard?.writeText(
                `Preciso incluir ${pessoa.nome} na equipe ${nomeDoProjeto ? `de "${nomeDoProjeto}"` : "do projeto"} para atribuir uma atividade.`,
              );
              aoFechar();
            }}
            className="h-8 px-4 rounded-[4px] bg-primary text-primary-foreground text-[12.5px] font-medium hover:opacity-90"
          >
            Copiar pedido ao gestor
          </button>
        </div>
      </div>
    );
  }

  const incluir = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const { error } = await supabase.rpc("incluir_e_atribuir" as never, {
        p_activity_id: activityId,
        p_user_id: pessoa.id,
        p_papel: papel,
        p_escopo: escopo,
      } as never);
      if (error) throw error;
      aoConcluir?.();
      aoFechar();
    } catch (e) {
      // Traduzido, sempre: sem UUID, sem P0001.
      setErro(traduzirErroDoBanco(e, { projetos: {}, pessoas: { [pessoa.id]: pessoa.nome } }));
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[13px] font-semibold text-foreground">
          Incluir {pessoa.nome} na equipe
        </p>
        <p className="text-[11.5px] text-muted-foreground">
          {pessoa.nome} ainda não faz parte {nomeDoProjeto ? `de "${nomeDoProjeto}"` : "deste projeto"}.
          Incluir agora atribui a atividade no mesmo passo.
        </p>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
          Qual papel
        </legend>
        {PAPEIS.map((p) => (
          <label key={p.valor} className="flex items-start gap-2 text-[12.5px] cursor-pointer">
            <input
              type="radio" name="papel" value={p.valor}
              checked={papel === p.valor}
              onChange={() => setPapel(p.valor)}
              className="mt-[3px] accent-[hsl(var(--primary))]"
            />
            <span className="min-w-0">
              <span className="text-foreground">{p.rotulo}</span>
              <span className="block text-[11px] text-muted-foreground">{p.ajuda}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
          Quanto enxerga
        </legend>
        {ESCOPOS.map((e) => (
          <label key={e.valor} className="flex items-center gap-2 text-[12.5px] cursor-pointer">
            <input
              type="radio" name="escopo" value={e.valor}
              checked={escopo === e.valor}
              onChange={() => setEscopo(e.valor)}
              className="accent-[hsl(var(--primary))]"
            />
            <span className="text-foreground">{e.rotulo}</span>
          </label>
        ))}
      </fieldset>

      {erro && (
        <div className="text-[12px] text-destructive">
          <p className="font-medium">{erro.titulo}</p>
          {erro.detalhe && <p className="text-destructive/80">{erro.detalhe}</p>}
        </div>
      )}

      <div className="flex items-center gap-2 justify-end">
        <button
          type="button" onClick={aoFechar} disabled={salvando}
          className="h-8 px-3 rounded-[4px] border border-border text-[12.5px] hover:bg-muted"
        >
          Cancelar
        </button>
        <button
          type="button" onClick={() => void incluir()} disabled={salvando}
          className={cn(
            "h-8 px-4 rounded-[4px] bg-primary text-primary-foreground text-[12.5px] font-medium",
            salvando ? "opacity-60" : "hover:opacity-90",
          )}
        >
          {salvando ? "Incluindo…" : "Incluir e atribuir"}
        </button>
      </div>
    </div>
  );
}
