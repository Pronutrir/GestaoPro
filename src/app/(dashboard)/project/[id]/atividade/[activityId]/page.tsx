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
  type DegrauDaTrilha,
  type PessoaDaAtividade,
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
      const [t, ps] = await Promise.all([
        carregarTrilha(activityId),
        carregarPessoas(activityId),
      ]);

      setAtividade(a as Record<string, unknown>);
      setProjeto((p ?? null) as Record<string, unknown> | null);
      setFilhas((fs ?? []) as Record<string, unknown>[]);
      setColuna((col ?? null) as Record<string, unknown> | null);
      setTrilha(t);
      setPessoas(ps);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não foi possível abrir a atividade");
    } finally {
      setCarregando(false);
    }
  }, [projectId, activityId]);

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

    await carregar();
  }, [activityId, carregar]);

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
        feed={[]}
        naoLidos={0}
        capacidades={capacidadesDaTela(caps)}
        avisoDePapel={
          soLeitura
            ? "Você acompanha esta atividade. Pode comentar; não pode alterar."
            : null
        }
        aoGravarCampo={gravarCampo}
        aoCancelar={() => router.push(`/project/${projectId}`)}
      />
    </div>
  );
}
