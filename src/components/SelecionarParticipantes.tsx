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
  /**
   * Nomes que NÃO estão na equipe do projeto.
   *
   * Aparecem DESABILITADOS com o motivo, em vez de sumirem da lista. Sumir
   * sem explicação é o que faz a pessoa procurar o colega três vezes antes de
   * desistir — e a checagem de verdade está no banco (trigger
   * `trg_assignee_exige_equipe`, fase 02), então esconder aqui não protege
   * nada: protege a trigger, e a tela só explica.
   *
   * A regra por trás: atribuir alguém a uma atividade NUNCA dá a essa pessoa
   * acesso que ela não tinha ao projeto. Quem entra, entra pela equipe.
   */
  foraDaEquipe?: string[];
  /** Quem gerencia a equipe pode resolver ali mesmo; quem não, precisa saber a quem pedir. */
  podeGerenciarEquipe?: boolean;
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
  foraDaEquipe,
  podeGerenciarEquipe = false,
  equipeDoPai = [],
  rotuloDoPai,
  onIncluir,
  onCancelar,
}: Props) => {
  const [busca, setBusca] = useState("");
  const [setor, setSetor] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const foraSet = useMemo(
    () => new Set((foraDaEquipe || []).map(norm)),
    [foraDaEquipe],
  );
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
    // Fora da equipe: aparece, mas não seleciona — e diz por quê.
    const fora = foraSet.has(norm(nome));
    const bloqueado = ja || fora;
    return (
      <button
        key={p.id}
        type="button"
        disabled={bloqueado}
        onClick={() => { if (!bloqueado) alternar(nome); }}
        title={fora
          ? (podeGerenciarEquipe
              ? "Não está na equipe do projeto. Adicione em Editar projeto › Equipe."
              : "Não está na equipe do projeto. Peça a quem gerencia o projeto para incluir.")
          : undefined}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2 text-left border-b border-border last:border-b-0 transition-colors",
          bloqueado ? "opacity-50 cursor-default" : "hover:bg-muted/50",
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
        {!ja && fora && (
          <span className="shrink-0 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            fora da equipe
          </span>
        )}
      </button>
    );
  };

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

      {/* SETOR EM LISTA, NÃO EM FAIXA.
          Era uma tira horizontal de chips com rolagem lateral. Não coube: o
          painel vive dentro do diálogo da atividade, que reserva 400px fixos
          para a conversa à direita — sobra pouca largura, e oito setores viram
          uma barra de rolagem que esconde metade das opções.
          Vertical resolve: os oito ficam à vista de uma vez, cada um com a
          contagem, e a seleção é um clique sem procurar. */}
      <div className="flex items-stretch">
        <div className="w-[132px] shrink-0 border-r border-border max-h-[260px] overflow-y-auto">
          <button
            type="button"
            onClick={() => setSetor(null)}
            className={cn(
              "w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left text-xs border-b border-border/60 transition-colors",
              setor === null
                ? "bg-primary/10 text-primary font-semibold"
                : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            <span className="truncate flex-1">Todos</span>
            <span className="text-[10px] tabular-nums opacity-70">{pessoas.length}</span>
          </button>
          {porSetor.map(([nome, qtd]) => (
            <button
              key={nome}
              type="button"
              onClick={() => setSetor(setor === nome ? null : nome)}
              className={cn(
                "w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left text-xs border-b border-border/60 last:border-b-0 transition-colors",
                setor === nome
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
              title={nome}
            >
              <span className="truncate flex-1">{nome}</span>
              <span className="text-[10px] tabular-nums opacity-70">{qtd}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          {/* A ação do setor escolhido fica ao lado dele, não numa faixa
              própria: menos uma linha empurrando a lista para baixo. */}
          {setor && (() => {
            const doSetor = pessoas.filter(
              (p) => (p.sector?.trim() || SEM_SETOR) === setor && p.full_name,
            );
            const livres = doSetor.filter((p) => !incluidos.has(norm(p.full_name!)));
            const todasOn = livres.length > 0 && livres.every((p) => sel.has(p.full_name!));
            if (livres.length === 0) return null;
            return (
              <button
                type="button"
                onClick={() => alternarGrupo(doSetor)}
                className="shrink-0 px-3 py-1.5 text-left text-[11px] font-medium text-primary border-b border-border hover:bg-muted/50 transition-colors"
              >
                {todasOn ? "Desmarcar" : `Marcar`} {livres.length} de {setor}
              </button>
            );
          })()}

          <div className="max-h-[260px] overflow-y-auto">
        {visiveis.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground italic">
            Ninguém encontrado com esse filtro.
          </p>
        ) : (
          /* LISTA PLANA, sempre. Antes ela se agrupava por setor quando não
             havia filtro — com a coluna de setores ao lado, o cabeçalho de
             grupo repetiria a mesma informação e comeria altura num painel que
             já é curto. A pessoa vê o setor na própria linha. */
          visiveis.map(linhaPessoa)
        )}
          </div>
        </div>
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
