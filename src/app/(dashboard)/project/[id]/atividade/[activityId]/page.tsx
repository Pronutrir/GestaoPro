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
import { ActivityDependencies } from "@/components/ActivityDependencies";
import { ActivityAttachments } from "@/components/ActivityAttachments";
import {
  carregarTrilha,
  carregarPessoas,
  lerTotaisDerivados,
  carregarFeed,
  contarNaoLidos,
  marcarFeedVisto,
  fraseDoEvento,
  agruparPorDia,
  type DegrauDaTrilha,
  type PessoaDaAtividade,
  type EventoDoBanco,
} from "@/lib/telaDaAtividadeDados";
import { capacidadesNaAtividade } from "@/lib/activityAccess";
import { resolveEapKind, eapToPersisted, EAP_LABELS, type EapKind } from "@/lib/eapModel";
import { gutScore } from "@/lib/gutPriority";

// activity_assignees é da fase 02 e não está nos tipos gerados do Supabase —
// mesmo contorno de lib/telaDaAtividadeDados: casta o nome para escapar do tipo.
const tabelaSemTipo = (nome: string) => supabase.from(nome as never);

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
    // Cada campo grava numa coluna. Os que viram número/data limpam para NULL
    // quando vazios — "" numa coluna de data é erro de tipo, não "sem data".
    const numerico = new Set(["hours", "cost", "gravity", "urgency", "tendency"]);
    const dataCol = new Set(["start_date", "end_date"]);
    const texto = new Set(["title", "description"]);
    const coluna = [...numerico, ...dataCol, ...texto].find((c) => c === campo);
    if (!coluna) throw new Error(`campo "${campo}" ainda não é editável por aqui`);

    const patch: Record<string, unknown> = numerico.has(coluna)
      ? { [coluna]: valor.trim() === "" ? null : Number(valor) }
      : { [coluna]: valor.trim() === "" ? null : valor };

    const { error, count } = await supabase
      .from("activities")
      .update(patch as never, { count: "exact" })
      .eq("id", activityId);

    if (error) throw new Error(error.message);
    if (!count) throw new Error("o banco recusou a alteração — você tem permissão sobre esta atividade?");

    /**
     * A CONFIRMAÇÃO É A LINHA NO FEED — e ela é automática.
     *
     * Não registro evento à mão aqui: o histórico de alterações já é gravado
     * por trigger, e a view `activity_feed_events` o lê como tipo 'alteracao'.
     * Registrar de novo produziria a mesma mudança duas vezes na coluna.
     *
     * Foi o que a conferência do banco mostrou antes de eu aplicar: a fase 08
     * já tinha entregue conversa + histórico numa linha do tempo só.
     */

    await carregar();
  }, [activityId, carregar, user?.id, nomeDeQuemFez]);

  /* ── AS AÇÕES — cada uma grava e recarrega; a confirmação é a linha no feed ── */

  // CONCLUIR — status vira 'completed' e o realizado FECHA (a data nasce do
  // trabalho, não da digitação: aqui é o ato de concluir que a define).
  const aoConcluir = useCallback(async () => {
    const jaConcluida = String((atividade as Record<string, unknown>)?.status) === "completed";
    const patch = jaConcluida
      ? { status: "in_progress", actual_end_date: null }
      : { status: "completed", actual_end_date: new Date().toISOString().slice(0, 10) };
    const { error, count } = await supabase
      .from("activities").update(patch as never, { count: "exact" }).eq("id", activityId);
    if (error) { toast({ title: "Não deu para concluir", description: error.message, variant: "destructive" }); return; }
    if (!count) { toast({ title: "O banco recusou", description: "Você tem permissão de execução nesta atividade?", variant: "destructive" }); return; }
    await carregar();
  }, [activityId, atividade, carregar, toast]);

  // MUDAR O TIPO — traduz o EapKind para (item_type, is_milestone) pela ponte
  // única. A trava do banco pode barrar (agrupador sem subitem no quadro); o
  // recado sobe para a tela em português, não como código.
  const aoMudarTipo = useCallback(async (kind: EapKind) => {
    const { item_type, is_milestone } = eapToPersisted(kind);
    const { error, count } = await supabase
      .from("activities").update({ item_type, is_milestone } as never, { count: "exact" }).eq("id", activityId);
    if (error) { toast({ title: "Não deu para mudar o tipo", description: error.message, variant: "destructive" }); return; }
    if (!count) { toast({ title: "O banco recusou", description: "Você tem permissão de planejamento nesta atividade?", variant: "destructive" }); return; }
    await carregar();
  }, [activityId, carregar, toast]);

  // MOVER PARA O QUADRO — promove do backlog para a coluna de ENTRADA (ou a
  // primeira visível não-backlog). A trava do banco recusa agrupador sem subitem
  // em português; count:"exact" pega a recusa silenciosa da RLS.
  const aoMoverParaQuadro = useCallback(async () => {
    const { data: stages } = await supabase.from("workflow_stages")
      .select("id, is_entry_point, is_visible, categoria").eq("project_id", projectId);
    const lista = ((stages ?? []) as Record<string, unknown>[]).filter(
      (s) => s.is_visible !== false && String(s.categoria ?? "").toLowerCase() !== "backlog",
    );
    const alvo = (lista.find((s) => s.is_entry_point) ?? lista[0]) as Record<string, unknown> | undefined;
    if (!alvo?.id) { toast({ title: "Sem coluna no quadro", description: "Este projeto não tem coluna visível fora do backlog.", variant: "destructive" }); return; }
    const { error, count } = await supabase.from("activities")
      .update({ workflow_stage_id: alvo.id } as never, { count: "exact" }).eq("id", activityId);
    if (error) { toast({ title: "Não deu para mover ao quadro", description: error.message, variant: "destructive" }); return; }
    if (!count) { toast({ title: "O banco recusou", description: "Você tem permissão de planejamento nesta atividade?", variant: "destructive" }); return; }
    await carregar();
  }, [activityId, projectId, carregar, toast]);

  // SUBATIVIDADE — cria uma filha com nome só; nasce no Backlog (não vira cartão
  // sozinha, a regra continua). O resto se preenche na tela dela.
  const aoCriarSubatividade = useCallback(async (nome: string) => {
    const titulo = nome.trim();
    if (!titulo) return;
    const { data: backlog } = await supabase
      .from("workflow_stages").select("id")
      .eq("project_id", projectId).eq("categoria", "backlog").limit(1).maybeSingle();
    const { error } = await supabase.from("activities").insert({
      project_id: projectId, parent_id: activityId, title: titulo,
      item_type: "atividade", is_milestone: false, status: "not_started",
      workflow_stage_id: (backlog as Record<string, unknown> | null)?.id ?? null,
    } as never);
    if (error) { toast({ title: "Não deu para criar a subatividade", description: error.message, variant: "destructive" }); return; }
    await carregar();
  }, [activityId, projectId, carregar, toast]);

  // ATRIBUIR — dois caminhos, e a regra inviolável no meio.
  //   1) DIRETO: a pessoa já está na equipe → insere o vínculo de atividade. O
  //      gatilho trg_assignee_exige_equipe barra quem está fora, e é esse "não"
  //      que separa os dois casos sem uma consulta extra — quem só tem canAssign
  //      (e não gerencia equipe) atribui um colega de equipe por aqui.
  //   2) DE FORA: cai na RPC incluir_e_atribuir, que inclui na equipe E atribui
  //      na MESMA transação (só quem gerencia equipe pode). Assina como
  //      participante; para responsável, promove o papel depois.
  const aoAtribuir = useCallback(async (userId: string, papel: "responsavel" | "participante") => {
    const { error: eDireto } = await tabelaSemTipo("activity_assignees").insert({
      activity_id: activityId, user_id: userId, papel, created_by: user?.id ?? null,
    } as never);

    if (eDireto) {
      const { error: eRpc } = await supabase.rpc("incluir_e_atribuir" as never, {
        p_activity_id: activityId, p_user_id: userId,
      } as never);
      if (eRpc) { toast({ title: "Não deu para atribuir", description: eRpc.message, variant: "destructive" }); return; }
      if (papel === "responsavel") {
        const { error: eP } = await tabelaSemTipo("activity_assignees")
          .update({ papel: "responsavel" } as never).eq("activity_id", activityId).eq("user_id", userId);
        if (eP) toast({ title: "Atribuído como participante", description: `Não deu para tornar responsável: ${eP.message}`, variant: "destructive" });
      }
    }
    await carregar();
  }, [activityId, user?.id, carregar, toast]);

  // REMOVER da atividade — tira o vínculo de responsável/participante. NÃO mexe
  // na equipe do projeto (isso é outro ato, de quem gerencia equipe).
  const aoRemoverPessoa = useCallback(async (userId: string) => {
    const { error } = await tabelaSemTipo("activity_assignees")
      .delete().eq("activity_id", activityId).eq("user_id", userId);
    if (error) { toast({ title: "Não deu para remover", description: error.message, variant: "destructive" }); return; }
    await carregar();
  }, [activityId, carregar, toast]);

  // DUPLICAR — clona os campos de PLANEJAMENTO (nome, descrição, tipo, esforço,
  // custo, GUT, posição, coluna), zera o que nasce do trabalho (datas/status).
  // Vai para a cópia.
  const aoDuplicar = useCallback(async () => {
    const a = (atividade ?? {}) as Record<string, unknown>;
    const { data: nova, error } = await supabase.from("activities").insert({
      project_id: projectId,
      parent_id: a.parent_id ?? null,
      title: `Cópia de ${a.title ?? "atividade"}`,
      description: a.description ?? null,
      item_type: a.item_type ?? "atividade",
      is_milestone: a.is_milestone ?? false,
      status: "not_started",
      hours: a.hours ?? null,
      cost: a.cost ?? null,
      gravity: a.gravity ?? null,
      urgency: a.urgency ?? null,
      tendency: a.tendency ?? null,
      workflow_stage_id: a.workflow_stage_id ?? null,
    } as never).select("id").single();
    if (error) { toast({ title: "Não deu para duplicar", description: error.message, variant: "destructive" }); return; }
    if (nova && (nova as Record<string, unknown>).id) {
      router.push(`/project/${projectId}/atividade/${String((nova as Record<string, unknown>).id)}`);
    }
  }, [atividade, projectId, router, toast]);

  // ARQUIVAR — is_trashed=true e sai da atividade (ela some das listas). É a via
  // do quadro/backlog para arquivar; a policy de DELETE não aceita o ator.
  const aoArquivar = useCallback(async () => {
    const { error, count } = await supabase.from("activities")
      .update({ is_trashed: true } as never, { count: "exact" }).eq("id", activityId);
    if (error) { toast({ title: "Não deu para arquivar", description: error.message, variant: "destructive" }); return; }
    if (!count) { toast({ title: "O banco recusou", description: "Você tem permissão de planejamento nesta atividade?", variant: "destructive" }); return; }
    router.push(`/project/${projectId}`);
  }, [activityId, projectId, router, toast]);

  // TRANSFORMAR EM LIÇÃO — cria uma lição SEMEADA pela atividade (source_activity_id),
  // no estado "identificada". Problema/solução se completam em Lições.
  const aoCriarLicao = useCallback(async () => {
    const a = (atividade ?? {}) as Record<string, unknown>;
    const { error } = await supabase.from("lessons_learned").insert({
      project_id: projectId,
      category: "Geral",
      problem: `A partir de "${a.title ?? "atividade"}"`,
      source_activity_id: activityId,
      source_trigger: "atividade",
      reported_by: nomeDeQuemFez,
      reported_by_id: user?.id ?? null,
      lifecycle: "identificada",
    } as never);
    if (error) { toast({ title: "Não deu para criar a lição", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Lição criada", description: "Complete o problema e a solução na aba Lições." });
  }, [atividade, activityId, projectId, nomeDeQuemFez, user?.id, toast]);

  // BUSCAR pessoas para atribuir: perfis ativos, filtrados pelo texto. A
  // inclusão na equipe (se faltar) acontece dentro de incluir_e_atribuir.
  const buscarPessoas = useCallback(async (q: string): Promise<{ id: string; nome: string }[]> => {
    let query = supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name").limit(8);
    if (q.trim()) query = query.ilike("full_name", `%${q.trim()}%`);
    const { data } = await query;
    return ((data ?? []) as Record<string, unknown>[]).map((p) => ({ id: String(p.id), nome: String(p.full_name ?? "sem nome") }));
  }, []);

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
      tipoKind: kind,
      ehMarco: !!a.is_milestone,
      concluida: String(a.status) === "completed",
      noBacklog: String((coluna?.categoria as string) ?? "").toLowerCase() === "backlog",
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
      custoValor: (a.cost as number) ?? null,
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
            id: e.evento_id,
            autor: e.autor,
            // A frase vem de fraseDoEvento — o de-para mora num lugar só.
            texto: fraseDoEvento(e),
            hora: new Date(e.ocorrido_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            // `ehraiz: false` é o que a função devolve para o que veio de uma
            // filha. É o "na subatividade" do desenho.
            naSubatividade: !e.ehraiz,
            ehComentario: e.tipo === "comentario",
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
        aoConcluir={aoConcluir}
        aoMudarTipo={aoMudarTipo}
        aoMoverParaQuadro={aoMoverParaQuadro}
        aoCriarSubatividade={aoCriarSubatividade}
        aoAtribuir={aoAtribuir}
        aoRemoverPessoa={aoRemoverPessoa}
        buscarPessoas={buscarPessoas}
        aoAbrirEditorAntigo={soLeitura ? undefined : () => router.push(`/project/${projectId}?activity=${activityId}`)}
        secaoDependencias={<ActivityDependencies activityId={activityId} projectId={projectId} podeEditar={!soLeitura} />}
        secaoAnexos={<ActivityAttachments activityId={activityId} projectId={projectId} />}
        aoDuplicar={caps.canEditPlanejamento ? aoDuplicar : undefined}
        aoArquivar={caps.canEditPlanejamento ? aoArquivar : undefined}
        aoCriarLicao={(caps.canEditExecucao || caps.canComment) ? aoCriarLicao : undefined}
        aoMarcarLido={user?.id ? async () => {
          await marcarFeedVisto(activityId, user.id).catch(() => {});
          setNaoLidos(0);
        } : undefined}
        aoComentar={caps.canComment ? async (texto: string) => {
          // Grava em activity_comments, que é de onde a view do feed lê. Uma
          // segunda tabela de comentários faria a conversa existir em dois
          // lugares e divergir.
          const { error } = await supabase.from("activity_comments").insert({
            activity_id: activityId, content: texto,
            author: nomeDeQuemFez, created_by: user?.id ?? null,
          } as never);
          if (error) throw new Error(error.message);
          await carregar();
        } : undefined}
        aoCancelar={() => router.push(`/project/${projectId}`)}
      />
    </div>
  );
}
