'use client';

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Diamond, Plus, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { EAP_LABELS, type EapKind } from "@/lib/eapModel";
import { CampoNoLugar } from "./CampoNoLugar";
import { DescricaoRica } from "./DescricaoRica";
import { TrilhaDaAtividade } from "./TrilhaDaAtividade";
import { FeedDaAtividade, type DiaDoFeed } from "./FeedDaAtividade";
import type {
  DegrauDaTrilha,
  PessoaDaAtividade,
  TotaisDerivados,
} from "@/lib/telaDaAtividadeDados";
import { resumoDasSubatividades } from "@/lib/telaDaAtividadeDados";
import { formatarDataBR } from "@/lib/dataLocal";

/**
 * A TELA DA ATIVIDADE — uma tela, três estados.
 *
 * ============================================================================
 * NÃO SÃO TRÊS TELAS
 *
 * O desenho é explícito: *"Criar é esta mesma tela vazia. Editar é ela com
 * conteúdo. Visualizar é ela sem os controles. Não são três telas para
 * manter."*
 *
 * O que muda entre os estados **não é o layout** — é o que chega por
 * propriedade:
 *
 *   editar      capacidades preenchidas, atividade existente
 *   criar       `estado="criar"`, campos vazios, só o nome obrigatório
 *   visualizar  capacidades vazias → todo campo vira TEXTO, botões somem
 *
 * Não há `if (visualizar) return <OutraCoisa/>`. Se houvesse, em três meses
 * seriam três componentes divergindo — que é o defeito que esta revisão inteira
 * vem fechando (três fórmulas de progresso, três cópias da subida do ancestral,
 * duas listas de "quem agrupa").
 *
 * ============================================================================
 * O LAYOUT VEM DA SEÇÃO 02
 *
 *   grid-template-columns: 1fr 372px
 *
 * Corpo à esquerda, o sino à direita. O 372px é medida do desenho, não escolha.
 *
 * ============================================================================
 * OS TOTAIS VÊM DO SERVIDOR
 *
 * *"o total vem do servidor, não da soma da tela"* — e a razão está medida: a
 * lista de filhas passa pela RLS, então somar aqui encolheria o pai para quem
 * enxerga menos. `derived_*` são lidos, nunca recalculados.
 * ============================================================================
 */

export type EstadoDaTela = "criar" | "editar" | "visualizar";

/** O que a pessoa pode fazer. Campo sem capacidade vira texto. */
export interface CapacidadesDaTela {
  editarNome?: boolean;
  editarDescricao?: boolean;
  editarDatas?: boolean;
  editarEsforco?: boolean;
  editarGut?: boolean;
  editarCusto?: boolean;
  editarPessoas?: boolean;
  criarSubatividade?: boolean;
  concluir?: boolean;
  comentar?: boolean;
  /** Mudar Fase/Entrega/Atividade/Marco — é escopo, planejamento. */
  mudarTipo?: boolean;
  /** Promover do backlog para o quadro — decisão de escopo (planejamento). */
  promover?: boolean;
}

export interface DadosDaTela {
  id: string | null;
  projectId: string;
  wbs_code: string | null;
  title: string;
  descricao: string | null;
  tipoRotulo: string;
  tipoKind: EapKind;
  ehMarco: boolean;
  concluida: boolean;
  noBacklog: boolean;
  statusRotulo: string;
  statusCor: string | null;
  previstoInicio: string | null;
  previstoFim: string | null;
  realizadoInicio: string | null;
  realizadoFim: string | null;
  horasPrevistas: number | null;
  horasApontadas: number | null;
  gut: { g: number; u: number; t: number; total: number } | null;
  faseRotulo: string | null;
  pacoteRotulo: string | null;
  origemRotulo: string | null;
  custoRotulo: string | null;
  custoValor: number | null;
}

export interface SubatividadeNaTela {
  id: string;
  wbs_code: string | null;
  title: string;
  responsavel: string | null;
  horas: number | null;
  previsto: string | null;
  concluida: boolean;
  ehMarco: boolean;
}

export function TelaDaAtividade({
  estado,
  dados,
  trilha,
  pessoas,
  totais,
  subatividades,
  feed,
  naoLidos,
  capacidades,
  avisoDePapel,
  aoGravarCampo,
  aoCriarSubatividade,
  aoComentar,
  aoMarcarLido,
  aoConcluir,
  aoMudarTipo,
  aoMoverParaQuadro,
  aoAtribuir,
  aoRemoverPessoa,
  buscarPessoas,
  aoAbrirEditorAntigo,
  secaoDependencias,
  aoCriar,
  aoCriarEContinuar,
  aoCancelar,
}: {
  estado: EstadoDaTela;
  dados: DadosDaTela;
  trilha: DegrauDaTrilha[];
  pessoas: PessoaDaAtividade[];
  totais: TotaisDerivados;
  subatividades: SubatividadeNaTela[];
  feed: DiaDoFeed[];
  naoLidos: number;
  capacidades: CapacidadesDaTela;
  /** A faixa do estado "visualizar", explicando o papel. */
  avisoDePapel?: string | null;
  aoGravarCampo?: (campo: string, valor: string) => Promise<void>;
  aoCriarSubatividade?: (nome: string) => Promise<void>;
  aoComentar?: (t: string) => Promise<void>;
  aoMarcarLido?: () => void;
  aoConcluir?: () => void;
  aoMudarTipo?: (kind: EapKind) => Promise<void>;
  aoMoverParaQuadro?: () => void;
  aoAtribuir?: (userId: string, papel: "responsavel" | "participante") => Promise<void>;
  aoRemoverPessoa?: (userId: string) => Promise<void>;
  buscarPessoas?: (q: string) => Promise<{ id: string; nome: string }[]>;
  /** A PORTA ANTIGA: abre o formulário completo (13 campos). Temporária, até a
   *  tela editar tudo no lugar. */
  aoAbrirEditorAntigo?: () => void;
  /** A seção de Dependências, montada pela rota (que consulta) — a tela só a
   *  posiciona, para continuar pura. */
  secaoDependencias?: ReactNode;
  aoCriar?: () => Promise<void>;
  aoCriarEContinuar?: () => Promise<void>;
  aoCancelar?: () => void;
}) {
  const criando = estado === "criar";

  /**
   * O gravador de um campo. Devolve `undefined` quando não há capacidade — e é
   * assim que `CampoNoLugar` sabe virar texto. A permissão não é um `disabled`
   * passado adiante: ela é a AUSÊNCIA da função.
   */
  const gravador = (campo: string, pode?: boolean) =>
    pode && aoGravarCampo ? (v: string) => aoGravarCampo(campo, v) : undefined;

  const responsaveis = pessoas.filter((p) => p.papel === "responsavel");
  const participantes = pessoas.filter((p) => p.papel === "participante");

  const concluidas = subatividades.filter((s) => s.concluida).length;
  const resumoSubs = resumoDasSubatividades(totais, formatarDataBR, concluidas);

  const janela = (ini: string | null, fim: string | null, emCurso = false) => {
    if (!ini && !fim) return null;
    const a = ini ? formatarDataBR(ini) : "—";
    const b = fim ? formatarDataBR(fim) : emCurso ? "em curso" : "—";
    return `${a} → ${b}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_372px] min-h-0 h-full bg-[hsl(var(--muted))]">
      {/* ── CORPO ─────────────────────────────────────────────────────── */}
      <div className="min-w-0 overflow-y-auto p-5 flex flex-col gap-3">
        {/* A faixa do papel — só no estado visualizar. Ela explica POR QUE não
            há botões, em vez de deixar a pessoa procurando o que sumiu. */}
        {avisoDePapel && (
          <div className="rounded-[6px] border border-border bg-card px-3 py-2 text-[12.5px] text-muted-foreground">
            {avisoDePapel}
          </div>
        )}

        <TrilhaDaAtividade
          projectId={dados.projectId}
          degraus={trilha}
          atual={criando ? null : dados.wbs_code}
        />

        {/* ── CABEÇALHO ──────────────────────────────────────────────── */}
        <div className="rounded-[6px] border border-border bg-card p-4 flex flex-col gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {dados.ehMarco && (
              <Diamond className="w-4 h-4 fill-amber-500 text-amber-500 shrink-0 mt-1" aria-label="Marco" />
            )}
            <div className="min-w-0 flex-1">
              <CampoNoLugar
                rotulo={criando ? "Nome da atividade" : "Nome"}
                valor={dados.title}
                vazio={criando ? "escreva o nome — é o único campo obrigatório" : "sem nome"}
                aoGravar={gravador("title", capacidades.editarNome)}
                dica="O que precisa ser feito"
              />
            </div>
            {/* AS AÇÕES MORAM NO TOPO, À DIREITA. Botão sem permissão NÃO aparece
                (nunca `disabled`). Tipo é dropdown quando pode, texto quando não. */}
            <div className="flex items-center gap-2 shrink-0">
              {!criando && (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  {dados.statusCor && (
                    <span
                      className="w-[7px] h-[7px] rounded-full"
                      style={{ backgroundColor: dados.statusCor }}
                      aria-hidden="true"
                    />
                  )}
                  {dados.statusRotulo}
                </span>
              )}
              {!criando && capacidades.mudarTipo && aoMudarTipo ? (
                <DropdownTipo atual={dados.tipoKind} aoMudar={aoMudarTipo} />
              ) : (
                <span className="text-[11px] text-muted-foreground">{dados.tipoRotulo}</span>
              )}
              {capacidades.concluir && aoConcluir && (
                <button
                  type="button"
                  onClick={aoConcluir}
                  className="h-7 px-2.5 rounded-[4px] border border-border text-[12px] hover:bg-muted"
                >
                  {dados.concluida ? "Reabrir" : "Concluir"}
                </button>
              )}
              {/* MOVER PARA O QUADRO — só quando está no backlog e pode promover.
                  Promover é decisão de escopo; a trava do banco recusa agrupador
                  sem subitem em português. */}
              {!criando && dados.noBacklog && capacidades.promover && aoMoverParaQuadro && (
                <button
                  type="button"
                  onClick={aoMoverParaQuadro}
                  className="h-7 px-2.5 rounded-[4px] border border-border text-[12px] hover:bg-muted"
                >
                  Mover para o quadro
                </button>
              )}
              {/* A PORTA ANTIGA, em paralelo: o formulário completo, enquanto a
                  tela não edita todos os campos. Sai quando a tela estiver pronta. */}
              {!criando && aoAbrirEditorAntigo && (
                <button
                  type="button"
                  onClick={aoAbrirEditorAntigo}
                  className="h-7 px-2.5 rounded-[4px] border border-border text-[12px] hover:bg-muted"
                  title="Abrir o formulário completo (todos os campos)"
                >
                  Editar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── RESUMO ─────────────────────────────────────────────────── */}
        <div className="rounded-[6px] border border-border bg-card p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-3">
            <PessoasNoResumo
              rotulo="Responsáveis"
              papel="responsavel"
              pessoas={responsaveis}
              vazioTexto="sem responsável"
              vazioVerbo="+ atribuir alguém"
              bloqueiaSeVazio
              podeEditar={!!capacidades.editarPessoas}
              aoAtribuir={aoAtribuir}
              aoRemover={aoRemoverPessoa}
              buscarPessoas={buscarPessoas}
            />
            <PessoasNoResumo
              rotulo="Participantes"
              papel="participante"
              pessoas={participantes}
              vazioTexto="ninguém"
              vazioVerbo="+ incluir participante"
              podeEditar={!!capacidades.editarPessoas}
              aoAtribuir={aoAtribuir}
              aoRemover={aoRemoverPessoa}
              buscarPessoas={buscarPessoas}
            />
            <EditorDeJanela
              rotulo="Previsto"
              inicio={dados.previstoInicio}
              fim={dados.previstoFim}
              vazioVerbo="+ definir prazo"
              aoGravarInicio={gravador("start_date", capacidades.editarDatas)}
              aoGravarFim={gravador("end_date", capacidades.editarDatas)}
            />
            <CampoNoLugar
              rotulo="Realizado"
              valor={janela(dados.realizadoInicio, dados.realizadoFim, true)}
              vazio={criando ? "preenche sozinho ao começar" : "não começou"}
            />
            <CampoNoLugar
              rotulo="Esforço"
              valor={
                dados.horasPrevistas
                  ? `${dados.horasPrevistas}h previstas${
                      dados.horasApontadas ? ` · ${dados.horasApontadas}h apontadas` : ""
                    }`
                  : null
              }
              valorEdicao={dados.horasPrevistas != null ? String(dados.horasPrevistas) : ""}
              vazio="sem estimativa"
              dica="horas previstas — só o número"
              aoGravar={gravador("hours", capacidades.editarEsforco)}
            />
            <EditorGut
              g={dados.gut?.g ?? null}
              u={dados.gut?.u ?? null}
              t={dados.gut?.t ?? null}
              total={dados.gut?.total ?? null}
              ehMarco={dados.ehMarco}
              aoGravar={capacidades.editarGut && aoGravarCampo ? aoGravarCampo : undefined}
            />
            {/* Fase, Pacote e Origem são LEITURA sempre: mudam pela EAP, não
                por digitação. Editá-los aqui abriria uma segunda via de mover
                item na árvore, divergente do "Dentro de". */}
            <CampoNoLugar rotulo="Fase" valor={dados.faseRotulo} vazio="na raiz" />
            <CampoNoLugar rotulo="Pacote" valor={dados.pacoteRotulo} vazio="—" />
            <CampoNoLugar rotulo="Origem" valor={dados.origemRotulo} vazio="criada aqui" />
            <CampoNoLugar
              rotulo="Custo"
              valor={dados.custoRotulo}
              valorEdicao={dados.custoValor != null ? String(dados.custoValor) : ""}
              vazio="sem custo"
              dica="valor em reais — só o número"
              aoGravar={gravador("cost", capacidades.editarCusto)}
            />
          </div>
        </div>

        {/* ── DESCRIÇÃO ──────────────────────────────────────────────
            Texto rico de leitura: lista de conferência, link e @menção. A
            descrição continua sendo TEXTO no banco — ver lib/textoRico para
            por que não é um editor. */}
        <div className="rounded-[6px] border border-border bg-card p-4">
          <DescricaoRica
            valor={dados.descricao}
            aoGravar={gravador("description", capacidades.editarDescricao)}
          />
        </div>

        {/* ── SUBATIVIDADES — só quando a atividade existe ────────────── */}
        {!criando && (
          <div className="rounded-[6px] border border-border bg-card p-4">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-[13px] font-semibold text-foreground">Subatividades</h2>
              {resumoSubs && (
                <span className="text-[12px] text-muted-foreground" title="O total vem do servidor, não da soma da tela">
                  {resumoSubs}
                </span>
              )}
            </div>
            {subatividades.length === 0 ? (
              <p className="text-[12px] text-muted-foreground/70">
                Nenhuma subatividade. Quebrar em partes ajuda quando o trabalho passa de alguns dias.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {subatividades.map((s) => (
                  <li key={s.id} className="grid grid-cols-[68px_1fr_120px_56px_84px] gap-2 items-center py-1.5 text-[12.5px]">
                    <span className="font-mono text-[11px] text-muted-foreground truncate">
                      {s.ehMarco ? "◆" : s.wbs_code || "—"}
                    </span>
                    <span className={cn("truncate", s.concluida && "line-through text-muted-foreground")}>
                      {s.title}
                    </span>
                    <span className={cn("truncate text-[12px]", !s.responsavel && "text-muted-foreground/60")}>
                      {s.responsavel || "sem responsável"}
                    </span>
                    <span className="text-right tabular-nums text-[12px] text-muted-foreground">
                      {s.horas ? `${s.horas}h` : ""}
                    </span>
                    <span className={cn("text-[12px]", s.previsto ? "text-muted-foreground" : "text-muted-foreground/60")}>
                      {s.previsto ? formatarDataBR(s.previsto) : "sem data"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {/* + adicionar com uma linha só: nome + Enter cria a próxima.
                Subatividade não vira cartão sozinha — nasce no Backlog. */}
            {capacidades.criarSubatividade && aoCriarSubatividade && (
              <NovaSubatividade aoCriar={aoCriarSubatividade} />
            )}
          </div>
        )}

        {/* ── DEPENDÊNCIAS — a rota monta (consulta), a tela só posiciona ── */}
        {!criando && secaoDependencias && (
          <div className="rounded-[6px] border border-border bg-card p-4">
            {secaoDependencias}
          </div>
        )}

        {/* ── OS BOTÕES DE CRIAR ─────────────────────────────────────── */}
        {criando && (
          <div className="flex items-center gap-2 justify-end">
            {aoCancelar && (
              <button
                type="button"
                onClick={aoCancelar}
                className="h-8 px-3 rounded-[4px] border border-border text-[12.5px] hover:bg-muted"
              >
                Cancelar
              </button>
            )}
            {/* "Criar e continuar criando" existe por um motivo prático que o
                desenho explica: cadastrar uma EAP é cadastrar vinte itens
                seguidos. Salva e reabre em branco, no mesmo pacote. */}
            {aoCriarEContinuar && (
              <button
                type="button"
                onClick={() => void aoCriarEContinuar()}
                className="h-8 px-3 rounded-[4px] border border-border text-[12.5px] hover:bg-muted"
              >
                Criar e continuar criando
              </button>
            )}
            {aoCriar && (
              <button
                type="button"
                onClick={() => void aoCriar()}
                className="h-8 px-4 rounded-[4px] bg-primary text-primary-foreground text-[12.5px] font-medium hover:opacity-90"
              >
                Criar
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── O SINO ────────────────────────────────────────────────────── */}
      <FeedDaAtividade
        dias={criando ? [] : feed}
        naoLidos={criando ? 0 : naoLidos}
        aoMarcarLido={aoMarcarLido}
        aoComentar={capacidades.comentar ? aoComentar : undefined}
        className="min-h-0"
      />
    </div>
  );
}

/**
 * Responsáveis e participantes — no PLURAL.
 *
 * O diagnóstico da seção 01 abre com isto: *"Responsável no singular"* é o
 * primeiro item da lista do que falta. Uma atividade real tem mais de um dono,
 * e o campo texto `assigned_to` nunca conseguiu representar isso.
 */
function PessoasNoResumo({
  rotulo,
  papel,
  pessoas,
  vazioTexto,
  vazioVerbo,
  bloqueiaSeVazio = false,
  podeEditar,
  aoAtribuir,
  aoRemover,
  buscarPessoas,
}: {
  rotulo: string;
  papel: "responsavel" | "participante";
  pessoas: PessoaDaAtividade[];
  vazioTexto: string;
  vazioVerbo: string;
  bloqueiaSeVazio?: boolean;
  podeEditar: boolean;
  aoAtribuir?: (userId: string, papel: "responsavel" | "participante") => Promise<void>;
  aoRemover?: (userId: string) => Promise<void>;
  buscarPessoas?: (q: string) => Promise<{ id: string; nome: string }[]>;
}) {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<{ id: string; nome: string }[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (aberto) ref.current?.focus(); }, [aberto]);
  useEffect(() => {
    if (!aberto || !buscarPessoas) return;
    let vivo = true;
    buscarPessoas(q).then((r) => { if (vivo) setResultados(r); }).catch(() => {});
    return () => { vivo = false; };
  }, [q, aberto, buscarPessoas]);

  const escolher = async (id: string) => {
    if (!aoAtribuir) return;
    setOcupado(true);
    try { await aoAtribuir(id, papel); setAberto(false); setQ(""); } finally { setOcupado(false); }
  };

  const podeAtribuir = podeEditar && !!aoAtribuir && !!buscarPessoas;

  return (
    <div className="flex flex-col gap-1 min-w-0 relative">
      <span className="text-[11px] text-muted-foreground">{rotulo}</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {pessoas.map((p) => (
          <span
            key={p.id}
            className="group inline-flex items-center gap-1 min-w-0 rounded-full bg-muted/60 pl-0.5 pr-1.5 py-0.5"
            title={p.nome}
          >
            <span className="w-[20px] h-[20px] rounded-full bg-muted text-muted-foreground text-[10px] font-semibold inline-flex items-center justify-center shrink-0">
              {p.iniciais}
            </span>
            <span className="text-[12.5px] truncate">{p.nome}</span>
            {podeEditar && aoRemover && (
              <button
                type="button"
                onClick={() => void aoRemover(p.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                title={`Remover de ${rotulo.toLowerCase()}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}

        {/* VAZIO É CONVITE COM VERBO — âmbar quando o vazio trava (responsável).
            Sem permissão vira texto puro, sem verbo. */}
        {pessoas.length === 0 && !podeAtribuir && (
          <span className="text-[13px] text-muted-foreground/60">{vazioTexto}</span>
        )}
        {podeAtribuir && (
          pessoas.length === 0 ? (
            <button
              type="button"
              onClick={() => setAberto(true)}
              className={cn(
                "text-[13px] hover:underline",
                bloqueiaSeVazio ? "text-amber-600 dark:text-amber-500" : "text-primary",
              )}
            >
              {vazioVerbo}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setAberto(true)}
              className="w-[20px] h-[20px] rounded-full border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary inline-flex items-center justify-center"
              title={`Incluir em ${rotulo.toLowerCase()}`}
            >
              <Plus className="w-3 h-3" />
            </button>
          )
        )}
      </div>

      {aberto && (
        <>
          <button className="fixed inset-0 z-10 cursor-default" onClick={() => setAberto(false)} aria-hidden tabIndex={-1} />
          <div className="absolute z-20 top-full left-0 mt-1 w-64 rounded-[6px] border border-border bg-card shadow-md p-1">
            <input
              ref={ref}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setAberto(false); }}
              placeholder="buscar pessoa…"
              className="w-full bg-background border border-border rounded-[4px] px-2 py-1 text-[12.5px] outline-none focus:border-primary"
            />
            <ul className="max-h-52 overflow-y-auto mt-1">
              {resultados.length === 0 ? (
                <li className="px-2 py-1.5 text-[12px] text-muted-foreground">ninguém encontrado</li>
              ) : (
                resultados.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => void escolher(r.id)}
                      className="w-full text-left px-2 py-1.5 text-[12.5px] hover:bg-muted rounded-[4px] disabled:opacity-50"
                    >
                      {r.nome}
                    </button>
                  </li>
                ))
              )}
            </ul>
            <p className="px-2 py-1 text-[10.5px] text-muted-foreground/70">
              Quem estiver fora da equipe entra ao ser atribuído.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/* ── O DROPDOWN DE TIPO — Fase/Entrega/Atividade/Marco ────────────────────────
 * Fase e Entrega gravam igual (as duas agrupam); o rótulo exibido colapsa em
 * "Entrega" desde o E2. Mantê-las nas opções não muda o resultado. */
function DropdownTipo({ atual, aoMudar }: { atual: EapKind; aoMudar: (k: EapKind) => Promise<void> }) {
  const opcoes: EapKind[] = ["atividade", "entrega", "fase", "marco"];
  const valor = opcoes.includes(atual) ? atual : "atividade";
  return (
    <div className="relative inline-flex items-center">
      <select
        value={valor}
        onChange={(e) => void aoMudar(e.target.value as EapKind)}
        className="h-7 pl-2 pr-6 rounded-[4px] border border-border bg-card text-[12px] hover:bg-muted appearance-none cursor-pointer outline-none focus:border-primary"
        title="Tipo do item"
        aria-label="Tipo do item"
      >
        {opcoes.map((k) => (
          <option key={k} value={k}>{EAP_LABELS[k]}</option>
        ))}
      </select>
      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-1.5 pointer-events-none" />
    </div>
  );
}

/* ── EDITOR DE JANELA (Previsto) — duas datas nativas ─────────────────────────
 * O vazio que trava (sem prazo) é âmbar com verbo; o preenchido, texto. Cada
 * data grava ao sair. Não há "salvar". */
function EditorDeJanela({
  rotulo, inicio, fim, vazioVerbo, aoGravarInicio, aoGravarFim,
}: {
  rotulo: string;
  inicio: string | null;
  fim: string | null;
  vazioVerbo: string;
  aoGravarInicio?: (novo: string) => Promise<void>;
  aoGravarFim?: (novo: string) => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const pode = typeof aoGravarInicio === "function";
  const temValor = !!(inicio || fim);
  const texto = temValor
    ? `${inicio ? formatarDataBR(inicio) : "—"} → ${fim ? formatarDataBR(fim) : "—"}`
    : null;

  const inputCls = "bg-background border border-primary rounded-[4px] px-1.5 py-0.5 text-[12.5px] outline-none ring-2 ring-primary/20";

  if (!pode) {
    return (
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[11px] text-muted-foreground">{rotulo}</span>
        <span className={cn("text-[13px]", temValor ? "text-foreground" : "text-muted-foreground/60")}>{texto ?? "sem data"}</span>
      </div>
    );
  }

  if (aberto) {
    return (
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-[11px] text-muted-foreground">{rotulo}</span>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            defaultValue={inicio ?? ""}
            onBlur={(e) => { if (e.target.value !== (inicio ?? "")) void aoGravarInicio?.(e.target.value); }}
            className={inputCls}
          />
          <span className="text-[12px] text-muted-foreground">→</span>
          <input
            type="date"
            defaultValue={fim ?? ""}
            onBlur={(e) => { if (e.target.value !== (fim ?? "")) void aoGravarFim?.(e.target.value); }}
            className={inputCls}
          />
          <button type="button" onClick={() => setAberto(false)} className="text-[12px] text-muted-foreground hover:text-foreground">ok</button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setAberto(true)}
      className="flex flex-col gap-0.5 min-w-0 text-left rounded-[4px] -mx-1 px-1 py-0.5 hover:bg-muted/60 transition-colors"
      title={`Clique para ajustar · ${rotulo}`}
    >
      <span className="text-[11px] text-muted-foreground">{rotulo}</span>
      {temValor ? (
        <span className="text-[13px] text-foreground">{texto}</span>
      ) : (
        <span className="text-[13px] text-amber-600 dark:text-amber-500">{vazioVerbo}</span>
      )}
    </button>
  );
}

/* ── EDITOR DE GUT — três fatores (Gravidade × Urgência × Tendência) ──────────
 * Cada fator (1 a 5) grava ao mudar; o total recomputa no servidor. Marco não
 * tem GUT ("não se aplica"). Vazio é convite discreto (não trava trabalho). */
function EditorGut({
  g, u, t, total, ehMarco, aoGravar,
}: {
  g: number | null;
  u: number | null;
  t: number | null;
  total: number | null;
  ehMarco: boolean;
  aoGravar?: (campo: string, valor: string) => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const pode = typeof aoGravar === "function" && !ehMarco;
  const temValor = g != null && u != null && t != null;
  const texto = temValor ? `${g} × ${u} × ${t} = ${total}` : null;

  if (!pode) {
    return (
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[11px] text-muted-foreground">GUT</span>
        <span className={cn("text-[13px]", temValor ? "text-foreground" : "text-muted-foreground/60")}>
          {temValor ? texto : ehMarco ? "não se aplica" : "sem prioridade"}
        </span>
      </div>
    );
  }

  const fatores: [string, string, number | null][] = [
    ["gravity", "Gravidade", g],
    ["urgency", "Urgência", u],
    ["tendency", "Tendência", t],
  ];

  return (
    <div className="flex flex-col gap-0.5 min-w-0 relative">
      <span className="text-[11px] text-muted-foreground">GUT</span>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="text-left rounded-[4px] -mx-1 px-1 py-0.5 hover:bg-muted/60 transition-colors"
        title="Clique para dar prioridade"
      >
        {temValor ? (
          <span className="text-[13px] text-foreground">{texto}</span>
        ) : (
          <span className="text-[13px] text-primary">+ dar prioridade</span>
        )}
      </button>
      {aberto && (
        <>
          <button className="fixed inset-0 z-10 cursor-default" onClick={() => setAberto(false)} aria-hidden tabIndex={-1} />
          <div className="absolute z-20 top-full left-0 mt-1 w-56 rounded-[6px] border border-border bg-card shadow-md p-2 flex flex-col gap-2">
            {fatores.map(([campo, rot, val]) => (
              <label key={campo} className="flex items-center justify-between gap-2 text-[12.5px]">
                <span className="text-muted-foreground">{rot}</span>
                <select
                  value={val ?? ""}
                  onChange={(e) => void aoGravar!(campo, e.target.value)}
                  className="h-7 px-1.5 rounded-[4px] border border-border bg-background text-[12.5px] outline-none focus:border-primary"
                >
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            ))}
            <p className="text-[10.5px] text-muted-foreground/70">Gravidade × Urgência × Tendência (1 a 5 cada)</p>
          </div>
        </>
      )}
    </div>
  );
}

/* ── NOVA SUBATIVIDADE — uma linha, Enter cria a próxima ──────────────────── */
function NovaSubatividade({ aoCriar }: { aoCriar: (nome: string) => Promise<void> }) {
  const [ativo, setAtivo] = useState(false);
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (ativo) ref.current?.focus(); }, [ativo]);

  const criar = async () => {
    const t = nome.trim();
    if (!t) { setAtivo(false); return; }
    setSalvando(true);
    try {
      await aoCriar(t);
      setNome("");
      ref.current?.focus();
    } finally {
      setSalvando(false);
    }
  };

  if (!ativo) {
    return (
      <button
        type="button"
        onClick={() => setAtivo(true)}
        className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-primary hover:underline"
      >
        <Plus className="w-3.5 h-3.5" /> adicionar subatividade
      </button>
    );
  }

  return (
    <div className="mt-2">
      <input
        ref={ref}
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        disabled={salvando}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); void criar(); }
          if (e.key === "Escape") { setAtivo(false); setNome(""); }
        }}
        onBlur={() => { if (!nome.trim()) setAtivo(false); }}
        placeholder="nome da subatividade — Enter cria a próxima, Esc fecha"
        className="w-full bg-background border border-primary rounded-[4px] px-2 py-1 text-[12.5px] outline-none ring-2 ring-primary/20 disabled:opacity-60"
      />
    </div>
  );
}
