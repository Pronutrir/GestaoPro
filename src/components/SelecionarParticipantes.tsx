"use client";
// PAINEL DE PARTICIPANTES — um só, para quantas pessoas quiser.
//
// Antes cada pessoa exigia um clique em "+ Incluir participante", que criava
// uma LINHA VAZIA, e um seletor dentro dela. Para duas pessoas: dois cliques,
// dois seletores, duas buscas.
//
// Medido em 25/08/2026, e é o que orienta o desenho:
//
//   * 28 pessoas ativas em 8 setores — a lista cabe numa tela com rolagem,
//     não precisa de paginação nem de busca remota;
//   * 62 atividades têm participantes, e NENHUMA passa de 3 pessoas — por
//     isso não há "marcar todas as 28": seria usado por engano mais vezes que
//     de propósito, e desfazer custaria 28 cliques;
//   * 9 de 10 pacotes têm a MESMA equipe em todos os filhos — daí o botão de
//     herdar, que é o atalho para o padrão real de uso.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Users, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PessoaSelecionavel {
  id: string;
  full_name: string | null;
  sector?: string | null;
  role_title?: string | null;
}

interface Props {
  /** Todas as pessoas que podem participar. */
  pessoas: PessoaSelecionavel[];
  /** Nomes JÁ participantes — aparecem marcados e não são selecionáveis. */
  jaIncluidos: string[];
  /**
   * Equipe do agrupador pai, para o atalho de herdar. Vazio esconde a faixa.
   * São NOMES, no mesmo formato de `participants`.
   */
  equipeDoPai?: string[];
  /** Código e título do pai, só para a faixa dizer de onde vem. */
  rotuloDoPai?: string;
  onIncluir: (nomes: string[]) => void;
  onCancelar: () => void;
}

const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const iniciais = (nome: string) => {
  const p = (nome || "").trim().split(/\s+/);
  if (!p[0]) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
};

/** Setor vazio vira um rótulo próprio: some é pior que dizer que não tem. */
const SEM_SETOR = "Sem setor";

export const SelecionarParticipantes = ({
  pessoas,
  jaIncluidos,
  equipeDoPai = [],
  rotuloDoPai,
  onIncluir,
  onCancelar,
}: Props) => {
  const [busca, setBusca] = useState("");
  const [setor, setSetor] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const incluidos = useMemo(
    () => new Set(jaIncluidos.map(norm)),
    [jaIncluidos],
  );

  /** Quem do pai ainda NÃO está aqui — é o que o botão de herdar traz. */
  const faltamDoPai = useMemo(
    () => equipeDoPai.filter((n) => n && !incluidos.has(norm(n))),
    [equipeDoPai, incluidos],
  );

  const porSetor = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pessoas) {
      const s = p.sector?.trim() || SEM_SETOR;
      m.set(s, (m.get(s) || 0) + 1);
    }
    // Maior primeiro; empate pelo nome, para a ordem não dançar entre renders.
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [pessoas]);

  const visiveis = useMemo(() => {
    const q = norm(busca.trim());
    return pessoas.filter((p) => {
      if (!p.full_name) return false;
      if (setor && (p.sector?.trim() || SEM_SETOR) !== setor) return false;
      if (!q) return true;
      // Nome, setor e função — a mesma leitura do PersonCombobox, para quem
      // digita "Financeiro" achar as pessoas do Financeiro.
      return norm([p.full_name, p.sector || "", p.role_title || ""].join(" ")).includes(q);
    });
  }, [pessoas, setor, busca]);

  const alternar = (nome: string) => {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(nome)) n.delete(nome); else n.add(nome);
      return n;
    });
  };

  /** Marca ou desmarca um grupo inteiro — o "selecionar todos" na medida do setor. */
  const alternarGrupo = (doGrupo: PessoaSelecionavel[]) => {
    const livres = doGrupo
      .map((p) => p.full_name!)
      .filter((n) => n && !incluidos.has(norm(n)));
    if (livres.length === 0) return;
    const todosOn = livres.every((n) => sel.has(n));
    setSel((prev) => {
      const s = new Set(prev);
      livres.forEach((n) => (todosOn ? s.delete(n) : s.add(n)));
      return s;
    });
  };

  const herdar = () => {
    setSel((prev) => {
      const s = new Set(prev);
      faltamDoPai.forEach((n) => s.add(n));
      return s;
    });
  };

  const confirmar = () => {
    if (sel.size === 0) return;
    onIncluir([...sel]);
  };

  const linhaPessoa = (p: PessoaSelecionavel) => {
    const nome = p.full_name!;
    const ja = incluidos.has(norm(nome));
    const marcado = sel.has(nome);
    return (
      <button
        key={p.id}
        type="button"
        disabled={ja}
        onClick={() => alternar(nome)}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2 text-left border-b border-border last:border-b-0 transition-colors",
          ja ? "opacity-50 cursor-default" : "hover:bg-muted/50",
          marcado && "bg-primary/5",
        )}
      >
        <span
          className={cn(
            "w-4 h-4 shrink-0 rounded border flex items-center justify-center",
            marcado ? "bg-primary border-primary" : "border-border",
          )}
        >
          {marcado && <Check className="w-3 h-3 text-primary-foreground" />}
        </span>
        <span className="w-7 h-7 shrink-0 rounded-full bg-muted border border-border grid place-items-center text-[10px] font-semibold text-muted-foreground">
          {iniciais(nome)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-foreground truncate">{nome}</span>
          <span className="block text-xs text-muted-foreground truncate">
            {[p.sector, p.role_title].filter(Boolean).join(" · ") || "—"}
          </span>
        </span>
        {ja && (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-success bg-success/10 px-1.5 py-0.5 rounded">
            já participa
          </span>
        )}
      </button>
    );
  };

  const recorteAtivo = !!setor || !!busca.trim();

  return (
    <div className="rounded-md border border-border overflow-hidden">
      {/* HERDAR DO PAI — botão, não automático. Herança automática decidiria
          pela pessoa, e há o caso em dez com equipe própria. O botão oferece;
          ela aceita ou ignora. Some quando não há nada a herdar. */}
      {faltamDoPai.length > 0 && (
        <div className="flex items-center gap-2.5 flex-wrap px-3 py-2.5 border-b border-border bg-primary/5">
          <Users className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs text-foreground/85 flex-1 min-w-[180px]">
            <strong className="font-semibold">Herdar do agrupador</strong>
            {rotuloDoPai ? ` — ${rotuloDoPai}` : ""}
            <span className="text-primary"> · {faltamDoPai.join(", ")}</span>
          </span>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={herdar}>
            Usar essa equipe
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Nome, setor ou função…"
          className="h-7 border-0 px-0 shadow-none focus-visible:ring-0 text-sm"
        />
      </div>

      {/* SETORES em faixa própria, com rolagem lateral: os 8 cabem sem quebrar
          linha nem empurrar a lista para baixo. */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border overflow-x-auto">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0 pr-1">
          Setor
        </span>
        <button
          type="button"
          onClick={() => setSetor(null)}
          aria-pressed={setor === null}
          className={cn(
            "shrink-0 inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border text-xs transition-colors",
            setor === null
              ? "bg-primary border-primary text-primary-foreground font-semibold"
              : "border-border text-muted-foreground hover:border-primary/50",
          )}
        >
          Todos
          <span className="text-[10px] tabular-nums opacity-75">{pessoas.length}</span>
        </button>
        {porSetor.map(([nome, qtd]) => (
          <button
            key={nome}
            type="button"
            onClick={() => setSetor(setor === nome ? null : nome)}
            aria-pressed={setor === nome}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border text-xs whitespace-nowrap transition-colors",
              setor === nome
                ? "bg-primary border-primary text-primary-foreground font-semibold"
                : "border-border text-muted-foreground hover:border-primary/50",
            )}
          >
            {nome}
            <span className="text-[10px] tabular-nums opacity-75">{qtd}</span>
          </button>
        ))}
      </div>

      {/* Ação do setor escolhido: é o "marcar todas" na medida do grupo. */}
      {setor && (() => {
        const doSetor = pessoas.filter(
          (p) => (p.sector?.trim() || SEM_SETOR) === setor && p.full_name,
        );
        const livres = doSetor.filter((p) => !incluidos.has(norm(p.full_name!)));
        const todasOn = livres.length > 0 && livres.every((p) => sel.has(p.full_name!));
        return (
          <div className="flex items-center gap-2.5 flex-wrap px-3 py-2 border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <span>
              <strong className="text-foreground font-semibold">{setor}</strong> ·{" "}
              {livres.length} {livres.length === 1 ? "pessoa disponível" : "pessoas disponíveis"}
            </span>
            {livres.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 text-[11px] px-2"
                onClick={() => alternarGrupo(doSetor)}
              >
                {todasOn ? "Desmarcar todas" : "Marcar todas"}
              </Button>
            )}
          </div>
        );
      })()}

      <div className="max-h-[240px] overflow-y-auto">
        {visiveis.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground italic">
            Ninguém encontrado com esse filtro.
          </p>
        ) : recorteAtivo ? (
          // Com recorte, lista plana: o cabeçalho de grupo seria redundante.
          visiveis.map(linhaPessoa)
        ) : (
          // Sem recorte, agrupa por setor — dá para varrer os 8 sem clicar em
          // nada, e cada grupo tem a própria ação de marcar.
          porSetor.map(([nomeSetor]) => {
            const doGrupo = visiveis.filter(
              (p) => (p.sector?.trim() || SEM_SETOR) === nomeSetor,
            );
            if (doGrupo.length === 0) return null;
            const livres = doGrupo.filter((p) => !incluidos.has(norm(p.full_name!)));
            const todasOn = livres.length > 0 && livres.every((p) => sel.has(p.full_name!));
            return (
              <div key={nomeSetor}>
                <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-muted/70 backdrop-blur border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>{nomeSetor} · {doGrupo.length}</span>
                  {livres.length > 0 && (
                    <button
                      type="button"
                      onClick={() => alternarGrupo(doGrupo)}
                      className="ml-auto text-primary hover:underline uppercase tracking-wider"
                    >
                      {todasOn ? "desmarcar" : `marcar ${livres.length}`}
                    </button>
                  )}
                </div>
                {doGrupo.map(linhaPessoa)}
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap px-3 py-2 border-t border-border bg-muted/40">
        <span className="text-xs text-muted-foreground">
          {sel.size === 0
            ? "Nenhuma selecionada"
            : `${sel.size} ${sel.size === 1 ? "pessoa selecionada" : "pessoas selecionadas"}`}
        </span>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="button" size="sm" className="h-7 text-xs" disabled={sel.size === 0} onClick={confirmar}>
          {sel.size === 0 ? "Incluir" : `Incluir ${sel.size}`}
        </Button>
      </div>
    </div>
  );
};
