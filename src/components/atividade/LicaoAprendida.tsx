'use client';

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { registrarEvento } from "@/lib/telaDaAtividadeDados";

/**
 * TRANSFORMAR EM LIÇÃO APRENDIDA — seção 08 do desenho.
 *
 * ============================================================================
 * QUATRO CAMPOS, E NENHUM A MAIS
 *
 *   o que aconteceu · a causa · a categoria · o que fazer da próxima vez
 *
 * `lessons_learned` tem 30 colunas. Oferecer as 30 aqui transformaria um
 * registro de trinta segundos num formulário que ninguém preenche — e lição
 * não preenchida não existe. As outras colunas continuam disponíveis na tela de
 * Lições, para quem quiser detalhar depois.
 *
 * ============================================================================
 * "CONCLUIR A ATIVIDADE TAMBÉM" NASCE DESMARCADA
 *
 * O desenho é explícito, e a razão é a ordem natural do gesto: registrar o que
 * se aprendeu **não** é o mesmo que dizer que o trabalho acabou. Muita lição
 * nasce no meio — "isto não funcionou, vamos por outro caminho" — e marcar por
 * padrão faria a atividade fechar sozinha justamente nesse caso.
 *
 * Quem quer as duas coisas marca uma caixa. Quem não percebeu a caixa não perde
 * a atividade.
 *
 * ============================================================================
 * O VÍNCULO É NOS DOIS SENTIDOS
 *
 * `source_activity_id` liga a lição à atividade. A atividade encontra a lição
 * pela mesma coluna, na direção contrária. Sem isso a lição vira um texto solto
 * numa lista que ninguém abre — que é o defeito que o próprio módulo de Lições
 * já teve.
 * ============================================================================
 */

/** As categorias que a tela oferece. Rótulo em português, valor no banco. */
const CATEGORIAS: { valor: string; rotulo: string }[] = [
  { valor: "processo", rotulo: "Processo" },
  { valor: "tecnica", rotulo: "Técnica" },
  { valor: "pessoas", rotulo: "Pessoas" },
  { valor: "fornecedor", rotulo: "Fornecedor" },
  { valor: "prazo", rotulo: "Prazo" },
  { valor: "general", rotulo: "Outra" },
];

export function LicaoAprendida({
  activityId,
  projectId,
  tituloDaAtividade,
  autorId,
  autorNome,
  aoFechar,
  aoConcluirAtividade,
}: {
  activityId: string;
  projectId: string;
  tituloDaAtividade: string;
  autorId?: string | null;
  autorNome: string;
  aoFechar: () => void;
  /** Sem isto, a caixa "concluir também" não aparece — quem não pode concluir
   *  não deve ver a opção. Botão sem permissão NÃO APARECE. */
  aoConcluirAtividade?: () => Promise<void>;
}) {
  const [oQueAconteceu, setOQueAconteceu] = useState("");
  const [causa, setCausa] = useState("");
  const [categoria, setCategoria] = useState("processo");
  const [proximaVez, setProximaVez] = useState("");
  const [concluirTambem, setConcluirTambem] = useState(false); // DESMARCADA
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gravar = async () => {
    const problema = oQueAconteceu.trim();
    if (!problema) { setErro("Diga o que aconteceu — é o único campo obrigatório."); return; }

    setSalvando(true);
    setErro(null);
    try {
      const { error } = await supabase.from("lessons_learned").insert({
        project_id: projectId,
        source_activity_id: activityId,
        source_trigger: "tela_da_atividade",
        problem: problema,
        solution: causa.trim() || null,
        suggestion: proximaVez.trim() || null,
        category: categoria,
        reported_by: autorNome,
      } as never);
      if (error) throw new Error(error.message);

      await registrarEvento({
        activityId,
        tipo: "licao",
        texto: `${autorNome} registrou uma lição aprendida: “${problema.slice(0, 80)}”`,
        autorId, autorNome,
      }).catch(() => {});

      // A CONCLUSÃO VEM DEPOIS, e só se pedida. Se ela falhar, a lição já está
      // gravada — e é melhor ter a lição sem a conclusão do que perder as duas.
      if (concluirTambem && aoConcluirAtividade) {
        await aoConcluirAtividade();
      }

      aoFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não foi possível registrar");
      setSalvando(false);
    }
  };

  const campo = "w-full bg-background border border-border rounded-[4px] px-2 py-1.5 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-[13px] font-semibold text-foreground">Transformar em lição aprendida</p>
        <p className="text-[11.5px] text-muted-foreground">
          De “{tituloDaAtividade}”. Fica em Lições, ligada a esta atividade.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          O que aconteceu
        </span>
        <textarea
          rows={3} className={campo} value={oQueAconteceu}
          onChange={(e) => setOQueAconteceu(e.target.value)}
          placeholder="O fato, sem interpretação."
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">A causa</span>
        <textarea
          rows={2} className={campo} value={causa}
          onChange={(e) => setCausa(e.target.value)}
          placeholder="Por que aconteceu."
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Categoria</span>
        <select className={campo} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          {CATEGORIAS.map((c) => (
            <option key={c.valor} value={c.valor}>{c.rotulo}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          O que fazer da próxima vez
        </span>
        <textarea
          rows={2} className={campo} value={proximaVez}
          onChange={(e) => setProximaVez(e.target.value)}
          placeholder="A recomendação, para quem passar por isto depois."
        />
      </label>

      {/* DESMARCADA por padrão. Registrar o que se aprendeu não é dizer que o
          trabalho acabou — muita lição nasce no meio. */}
      {aoConcluirAtividade && (
        <label className="flex items-center gap-2 text-[12.5px]">
          <input
            type="checkbox"
            checked={concluirTambem}
            onChange={(e) => setConcluirTambem(e.target.checked)}
            className="accent-[hsl(var(--primary))]"
          />
          Concluir a atividade também
        </label>
      )}

      {erro && <p className="text-[12px] text-destructive">{erro}</p>}

      <div className="flex items-center gap-2 justify-end">
        <button
          type="button" onClick={aoFechar} disabled={salvando}
          className="h-8 px-3 rounded-[4px] border border-border text-[12.5px] hover:bg-muted"
        >
          Cancelar
        </button>
        <button
          type="button" onClick={() => void gravar()} disabled={salvando}
          className={cn(
            "h-8 px-4 rounded-[4px] bg-primary text-primary-foreground text-[12.5px] font-medium",
            salvando ? "opacity-60" : "hover:opacity-90",
          )}
        >
          {salvando ? "Registrando…" : "Registrar lição"}
        </button>
      </div>
    </div>
  );
}
