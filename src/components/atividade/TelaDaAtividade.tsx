'use client';

import { Diamond, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
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
  editarPessoas?: boolean;
  criarSubatividade?: boolean;
  concluir?: boolean;
  comentar?: boolean;
}

export interface DadosDaTela {
  id: string | null;
  projectId: string;
  wbs_code: string | null;
  title: string;
  descricao: string | null;
  tipoRotulo: string;
  ehMarco: boolean;
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
  aoCriarSubatividade?: () => void;
  aoComentar?: (t: string) => Promise<void>;
  aoMarcarLido?: () => void;
  aoConcluir?: () => void;
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
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-muted-foreground">{dados.tipoRotulo}</span>
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
              {/* BOTÃO SEM PERMISSÃO NÃO APARECE. Não é `disabled` — o desenho
                  é explícito: "nunca apagado". */}
              {capacidades.concluir && aoConcluir && (
                <button
                  type="button"
                  onClick={aoConcluir}
                  className="h-7 px-2.5 rounded-[4px] border border-border text-[12px] hover:bg-muted"
                >
                  Concluir
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
              pessoas={responsaveis}
              vazio="sem responsável"
              podeEditar={!!capacidades.editarPessoas}
            />
            <PessoasNoResumo
              rotulo="Participantes"
              pessoas={participantes}
              vazio="ninguém"
              podeEditar={!!capacidades.editarPessoas}
            />
            <CampoNoLugar
              rotulo="Previsto"
              valor={janela(dados.previstoInicio, dados.previstoFim)}
              vazio="sem data"
              aoGravar={gravador("previsto", capacidades.editarDatas)}
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
              vazio="sem estimativa"
              aoGravar={gravador("hours", capacidades.editarEsforco)}
            />
            <CampoNoLugar
              rotulo="GUT"
              valor={dados.gut ? `${dados.gut.g} × ${dados.gut.u} × ${dados.gut.t} = ${dados.gut.total}` : null}
              vazio={dados.ehMarco ? "não se aplica" : "sem prioridade"}
              aoGravar={dados.ehMarco ? undefined : gravador("gut", capacidades.editarGut)}
            />
            {/* Fase, Pacote e Origem são LEITURA sempre: mudam pela EAP, não
                por digitação. Editá-los aqui abriria uma segunda via de mover
                item na árvore, divergente do "Dentro de". */}
            <CampoNoLugar rotulo="Fase" valor={dados.faseRotulo} vazio="na raiz" />
            <CampoNoLugar rotulo="Pacote" valor={dados.pacoteRotulo} vazio="—" />
            <CampoNoLugar rotulo="Origem" valor={dados.origemRotulo} vazio="criada aqui" />
            <CampoNoLugar rotulo="Custo" valor={dados.custoRotulo} vazio="sem taxa cadastrada" />
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
              {capacidades.criarSubatividade && aoCriarSubatividade && (
                <button
                  type="button"
                  onClick={aoCriarSubatividade}
                  className="ml-auto inline-flex items-center gap-1 h-7 px-2.5 rounded-[4px] border border-border text-[12px] hover:bg-muted"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Subatividade
                </button>
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
  pessoas,
  vazio,
  podeEditar,
}: {
  rotulo: string;
  pessoas: PessoaDaAtividade[];
  vazio: string;
  podeEditar: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] text-muted-foreground">{rotulo}</span>
      {pessoas.length === 0 ? (
        <span className="text-[13px] text-muted-foreground/60">{vazio}</span>
      ) : (
        <div className="flex items-center gap-1.5 flex-wrap">
          {pessoas.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 min-w-0" title={p.nome}>
              <span className="w-[22px] h-[22px] rounded-full bg-muted text-muted-foreground text-[10px] font-semibold inline-flex items-center justify-center shrink-0">
                {p.iniciais}
              </span>
              <span className="text-[12.5px] truncate">{p.nome}</span>
            </span>
          ))}
          {podeEditar && (
            <button
              type="button"
              className="w-[22px] h-[22px] rounded-full border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary inline-flex items-center justify-center"
              title={`Incluir em ${rotulo.toLowerCase()}`}
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
