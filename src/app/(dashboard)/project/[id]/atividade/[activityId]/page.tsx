'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  TelaDaAtividade,
  type DadosDaTela,
  type SubatividadeNaTela,
} from "@/components/atividade/TelaDaAtividade";
import { capacidadesDaTela } from "@/lib/capacidadesDaTelaDaAtividade";
import {
  carregarTrilha,
  carregarPessoas,
  lerTotaisDerivados,
  carregarFeed,
  contarNaoLidos,
  marcarFeedVisto,
  registrarEvento,
  agruparPorDia,
  type DegrauDaTrilha,
  type PessoaDaAtividade,
  type EventoDoBanco,
} from "@/lib/telaDaAtividadeDados";
import { capacidadesNaAtividade } from "@/lib/activityAccess";
import { resolveEapKind, EAP_LABELS } from "@/lib/eapModel";
import { gutScore } from "@/lib/gutPriority";

/**
 * A TELA DA ATIVIDADE, EM ROTA PRÓPRIA — `/project/:id/atividade/:activityId`
 *
 * ============================================================================
 * ANTES ESTA PÁGINA SÓ REDIRECIONAVA
 *
 * Ela mandava para `/project/:id?activity=<id>`, que abre o painel lateral
 * antigo — o mesmo cujo diagnóstico abre a seção 01 do desenho: *"Responsável
 * no singular · uma data só, sem realizado · nenhuma subatividade à vista,
 * embora existam 6 · sem trilha até a fase · o histórico é um chat, não um
 * feed."*
 *
 * O redirecionamento tinha uma justificativa boa na época: não duplicar as
 * regras de acesso. Ela deixou de valer quando `capacidadesNaAtividade` passou
 * a existir em `lib/` — agora a regra tem UM dono, e consumi-la aqui não
 * duplica nada.
 *
 * ============================================================================
 * O QUE ESTA PÁGINA FAZ, E O QUE ELA NÃO FAZ
 *
 * Faz: carregar, traduzir para o vocabulário da tela, e gravar.
 * Não faz: decidir permissão (é `lib/activityAccess`), somar agregado (é o
 * servidor, via `derived_*`), nem montar a trilha (é `lib/telaDaAtividadeDados`).
 *
 * A tela em si não sabe consultar nada — recebe tudo por propriedade. É o que
 * permite os três estados sem três componentes.
 * ============================================================================
 */
export default function PaginaDaAtividade() {
  const params = useParams();
  const router = useRouter();
  const { user, profile } = useAuth();
  const { toast } = useToast();

  /** O nome que vai para o feed. Nunca UUID: o histórico é para gente ler. */
  const nomeDeQuemFez =
    ((profile as Record<string, unknown>)?.full_name as string) || user?.email || "alguém";

  const projectId = typeof params?.id === "string" ? params.id : "";
  const activityId = typeof params?.activityId === "string" ? params.activityId : "";

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atividade, setAtividade] = useState<Record<string, unknown> | null>(null);
  const [projeto, setProjeto] = useState<Record<string, unknown> | null>(null);
  const [trilha, setTrilha] = useState<DegrauDaTrilha[]>([]);
  const [pessoas, setPessoas] = useState<PessoaDaAtividade[]>([]);
  const [filhas, setFilhas] = useState<Record<string, unknown>[]>([]);
  const [coluna, setColuna] = useState<Record<string, unknown> | null>(null);
  const [eventos, setEventos] = useState<EventoDoBanco[]>([]);
  const [naoLidos, setNaoLidos] = useState(0);

  const carregar = useCallback(async () => {
    if (!projectId || !activityId) return;
    setCarregando(true);
    setErro(null);
    try {
      const { data: a, error: eA } = await supabase
        .from("activities").select("*").eq("id", activityId).single();
      if (eA) throw new Error(eA.message);

      const { data: p } = await supabase
        .from("projects").select("*").eq("id", projectId).single();

      const { data: fs } = await supabase
        .from("activities").select("*")
        .eq("parent_id", activityId).eq("is_trashed", false)
        .order("wbs_code", { ascending: true });

      const stageId = (a as Record<string, unknown>)?.workflow_stage_id;
      const { data: col } = stageId
        ? await supabase.from("workflow_stages").select("*").eq("id", String(stageId)).single()
        : { data: null };

      // A trilha e as pessoas têm módulo próprio — e SOBEM o erro em vez de
      // devolver vazio. Uma trilha vazia por falha silenciosa faria o item
      // parecer de raiz, que é informação errada, não informação ausente.
      /**
       * O FEED entra aqui, e a falha dele NÃO derruba a tela.
       *
       * A trilha e as pessoas sobem o erro porque sem elas a tela mente — um
       * item sem trilha parece de raiz. O feed é diferente: sem ele a tela
       * fica incompleta, não errada. Derrubar a atividade inteira porque o
       * histórico não carregou seria trocar uma falha pequena por uma grande.
       *
       * A coluna do sino mostra o que houver; se não houver nada, diz isso.
       */
      const [t, ps, evs, nl] = await Promise.all([
        carregarTrilha(activityId),
        carregarPessoas(activityId),
        carregarFeed(activityId).catch(() => [] as EventoDoBanco[]),
        user?.id ? contarNaoLidos(activityId, user.id).catch(() => 0) : Promise.resolve(0),
      ]);

      setAtividade(a as Record<string, unknown>);
      setProjeto((p ?? null) as Record<string, unknown> | null);
      setFilhas((fs ?? []) as Record<string, unknown>[]);
      setColuna((col ?? null) as Record<string, unknown> | null);
      setTrilha(t);
      setPessoas(ps);
      setEventos(evs);
      setNaoLidos(nl);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não foi possível abrir a atividade");
    } finally {
      setCarregando(false);
    }
  }, [projectId, activityId, user?.id]);

  useEffect(() => { void carregar(); }, [carregar]);

  /* ── AS CAPACIDADES — de lib/, não reimplementadas aqui ────────────────── */
  const caps = useMemo(() => {
    const c = capacidadesNaAtividade(
      atividade as never,
      projeto as never,
      {
        id: user?.id,
        profileId: (profile as Record<string, unknown>)?.id as string | undefined,
        fullName: (profile as Record<string, unknown>)?.full_name as string | undefined,
        email: user?.email,
        isAdmin: !!(profile as Record<string, unknown>)?.is_admin,
        ehVisualizador: false,
      } as never,
    );
    return c;
  }, [atividade, projeto, user, profile]);

  /* ── GRAVAR UM CAMPO ───────────────────────────────────────────────────
   *
   * `count: "exact"` NÃO é zelo: um UPDATE recusado pela RLS volta do PostgREST
   * como SUCESSO com zero linhas. Sem conferir a contagem, a tela anunciaria
   * uma gravação que o banco recusou — o defeito que já custou caro aqui.
   */
  const gravarCampo = useCallback(async (campo: string, valor: string) => {
    const mapa: Record<string, string> = {
      title: "title",
      description: "description",
      hours: "hours",
    };
    const coluna = mapa[campo];
    if (!coluna) throw new Error(`campo "${campo}" ainda não é editável por aqui`);

    const patch: Record<string, unknown> =
      coluna === "hours" ? { hours: Number(valor) || null } : { [coluna]: valor || null };

    const { error, count } = await supabase
      .from("activities")
      .update(patch as never, { count: "exact" })
      .eq("id", activityId);

    if (error) throw new Error(error.message);
    if (!count) throw new Error("o banco recusou a alteração — você tem permissão sobre esta atividade?");

    /**
     * A CONFIRMAÇÃO É A LINHA NO FEED.
     *
     * Não há "salvo com sucesso": sair do campo grava, e o que diz que gravou é
     * o evento aparecendo na coluna da direita. Sem isso, gravar ao sair seria
     * gravação silenciosa — e a regra do "sucesso sem escrita não é sucesso"
     * exige que a pessoa VEJA o resultado, não que confie nele.
     *
     * O evento só é registrado DEPOIS de o count confirmar a escrita: um feed
     * que anuncia o que o banco recusou é pior que feed nenhum.
     *
     * A frase é montada AQUI, onde se sabe o que mudou — nunca na leitura.
     */
    const rotulo: Record<string, string> = {
      title: "o nome", description: "a descrição", hours: "as horas previstas",
    };
    await registrarEvento({
      activityId,
      tipo: "mudou_campo",
      texto: `${nomeDeQuemFez} alterou ${rotulo[campo] ?? campo}`,
      dados: { campo, valor },
      autorId: user?.id ?? null,
      autorNome: nomeDeQuemFez,
    }).catch(() => {
      // O evento é registro, não a operação. Se ele falhar, a alteração já
      // aconteceu — e esconder isso seria pior que um feed com um buraco.
    });

    await carregar();
  }, [activityId, carregar, user?.id, nomeDeQuemFez]);

  /* ── TRADUÇÃO PARA O VOCABULÁRIO DA TELA ───────────────────────────────── */
  const dados: DadosDaTela | null = useMemo(() => {
    if (!atividade) return null;
    const a = atividade;
    // gutScore CALCULA (G×U×T); normalizeGut só normaliza o RÓTULO. Usei o
    // segundo por engano e o tsc pegou — os três fatores vêm das colunas.
    const g = (a.gravity as number) ?? null;
    const u = (a.urgency as number) ?? null;
    const t = (a.tendency as number) ?? null;
    const total = gutScore(g, u, t);
    const kind = resolveEapKind(a as never);
    return {
      id: String(a.id),
      projectId,
      wbs_code: (a.wbs_code as string) ?? null,
      title: String(a.title ?? ""),
      descricao: (a.description as string) ?? null,
      tipoRotulo: EAP_LABELS[kind] ?? "Atividade",
      ehMarco: !!a.is_milestone,
      statusRotulo: String((coluna?.title as string) ?? "sem coluna"),
      statusCor: (coluna?.color as string) ?? null,
      previstoInicio: (a.start_date as string) ?? null,
      previstoFim: (a.end_date as string) ?? null,
      realizadoInicio: (a.actual_start_date as string) ?? null,
      realizadoFim: (a.actual_end_date as string) ?? null,
      horasPrevistas: (a.hours as number) ?? null,
      horasApontadas: (a.consumed_hours_manual as number) ?? null,
      // Marco tem GUT AUSENTE, não vazio: "não se aplica" é o que a tela diz,
      // e a decisão de 27/08 pôs CHECK no banco para não voltar a sujar.
      gut: total && g && u && t ? { g, u, t, total } : null,
      faseRotulo: trilha[0] ? `${trilha[0].wbs_code ?? ""} ${trilha[0].title}`.trim() : null,
      pacoteRotulo: trilha.length > 1
        ? `${trilha[trilha.length - 1].wbs_code ?? ""} ${trilha[trilha.length - 1].title}`.trim()
        : null,
      origemRotulo: (a.origem as string) ?? null,
      custoRotulo: (a.cost as number) ? `R$ ${a.cost}` : null,
    };
  }, [atividade, coluna, trilha, projectId]);

  const subatividades: SubatividadeNaTela[] = useMemo(
    () => filhas.map((f) => ({
      id: String(f.id),
      wbs_code: (f.wbs_code as string) ?? null,
      title: String(f.title ?? ""),
      responsavel: (f.assigned_to as string) ?? null,
      horas: (f.hours as number) ?? null,
      previsto: (f.end_date as string) ?? null,
      concluida: String(f.status) === "completed",
      ehMarco: !!f.is_milestone,
    })),
    [filhas],
  );

  if (carregando) {
    return <div className="p-8 text-sm text-muted-foreground">Abrindo a atividade…</div>;
  }

  if (erro || !dados) {
    /* O erro DIZ o que houve e oferece saída — não um spinner eterno nem um
       "algo deu errado" que não ajuda ninguém a decidir o passo seguinte. */
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <p className="text-sm text-foreground">Não foi possível abrir esta atividade.</p>
        {erro && <p className="text-xs text-muted-foreground max-w-md">{erro}</p>}
        <a href={`/project/${projectId}`} className="text-sm text-primary underline underline-offset-4">
          Ir para o projeto
        </a>
      </div>
    );
  }

  const soLeitura = !caps.canEditExecucao && !caps.canEditPlanejamento;

  return (
    <div className="h-[calc(100vh-4rem)]">
      <TelaDaAtividade
        estado={soLeitura ? "visualizar" : "editar"}
        dados={dados}
        trilha={trilha}
        pessoas={pessoas}
        totais={lerTotaisDerivados(atividade as never)}
        subatividades={subatividades}
        feed={agruparPorDia(eventos, new Date().toISOString()).map((d) => ({
          rotulo: d.rotulo,
          eventos: d.eventos.map((e) => ({
            id: e.id,
            autor: e.autor_nome,
            texto: e.texto,
            hora: new Date(e.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            // O evento que subiu de uma filha traz activity_id ≠ feed_de. É o
            // que o desenho marca como "na subatividade".
            naSubatividade: e.activity_id !== e.feed_de,
            marco: e.tipo === "marco_pronto",
            ehComentario: e.tipo === "comentou",
          })),
        }))}
        naoLidos={naoLidos}
        capacidades={capacidadesDaTela(caps)}
        avisoDePapel={
          soLeitura
            ? "Você acompanha esta atividade. Pode comentar; não pode alterar."
            : null
        }
        aoGravarCampo={gravarCampo}
        aoMarcarLido={user?.id ? async () => {
          await marcarFeedVisto(activityId, user.id).catch(() => {});
          setNaoLidos(0);
        } : undefined}
        aoComentar={caps.canComment ? async (texto: string) => {
          await registrarEvento({
            activityId, tipo: "comentou", texto,
            autorId: user?.id ?? null, autorNome: nomeDeQuemFez,
          });
          await carregar();
        } : undefined}
        aoCancelar={() => router.push(`/project/${projectId}`)}
      />
    </div>
  );
}
