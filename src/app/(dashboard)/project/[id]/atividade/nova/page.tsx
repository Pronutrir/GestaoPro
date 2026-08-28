'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { TelaDaAtividade, type DadosDaTela } from "@/components/atividade/TelaDaAtividade";
import { carregarTrilha, type DegrauDaTrilha } from "@/lib/telaDaAtividadeDados";
import {
  resolveEapKind,
  eapTiposQuePodeCriar,
  eapMotivoNaoCriaDentro,
  eapToPersisted,
  EAP_LABELS,
  type EapKind,
} from "@/lib/eapModel";

/**
 * CRIAR — a MESMA tela, em estado vazio.
 *
 * ============================================================================
 * NÃO É UM DIÁLOGO À PARTE
 *
 * O desenho, seção 03: *"Criar é esta mesma tela vazia. Editar é ela com
 * conteúdo. Visualizar é ela sem os controles. Não são três telas para
 * manter."*
 *
 * Esta página não desenha nada: monta o estado inicial e entrega a
 * `TelaDaAtividade` com `estado="criar"`. Se ela renderizasse campos próprios,
 * seriam duas telas no dia seguinte.
 *
 * ============================================================================
 * "CRIAR E CONTINUAR CRIANDO"
 *
 * Cadastrar uma EAP é cadastrar vinte itens seguidos. O segundo botão salva e
 * reabre em branco, no mesmo pacote, com o código já avançado — em vez de
 * fechar, procurar o pacote de novo e clicar em "nova" vinte vezes.
 *
 * ============================================================================
 * O CÓDIGO EAP É PROVISÓRIO ATÉ SALVAR
 *
 * Ele aparece como sugestão (o próximo livre dentro do pai), e só vira real no
 * insert. Mostrar um código definitivo antes de existir a linha seria prometer
 * um lugar na árvore que outra pessoa pode ocupar enquanto se digita o nome.
 * ============================================================================
 */
export default function PaginaCriarAtividade() {
  const params = useParams();
  const router = useRouter();
  const busca = useSearchParams();
  const { user, profile } = useAuth();

  const projectId = typeof params?.id === "string" ? params.id : "";
  /** Dentro de quem nasce. `null` = raiz do projeto. */
  const paiId = busca?.get("pai") || null;

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<EapKind>("atividade");
  const [pai, setPai] = useState<Record<string, unknown> | null>(null);
  const [trilha, setTrilha] = useState<DegrauDaTrilha[]>([]);
  const [codigoSugerido, setCodigoSugerido] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const nomeDeQuemFez =
    ((profile as Record<string, unknown>)?.full_name as string) || user?.email || "alguém";

  /* ── o contexto: quem é o pai, e que código vem a seguir ───────────────── */
  const carregarContexto = useCallback(async () => {
    if (!paiId) { setPai(null); setTrilha([]); setCodigoSugerido(null); return; }

    const { data: p } = await supabase
      .from("activities").select("*").eq("id", paiId).single();
    setPai((p ?? null) as Record<string, unknown> | null);

    // A trilha do PAI mais o próprio pai: é onde o novo item vai nascer.
    const t = await carregarTrilha(paiId).catch(() => [] as DegrauDaTrilha[]);
    const doPai = p
      ? [{
          id: String((p as Record<string, unknown>).id),
          wbs_code: ((p as Record<string, unknown>).wbs_code as string) ?? null,
          title: String((p as Record<string, unknown>).title ?? ""),
          item_type: ((p as Record<string, unknown>).item_type as string) ?? null,
        }]
      : [];
    setTrilha([...t, ...doPai]);

    /**
     * O PRÓXIMO CÓDIGO LIVRE dentro do pai.
     *
     * Conta as filhas e soma um. Não é reserva: se outra pessoa criar antes, o
     * código muda no insert — e por isso ele é mostrado como provisório.
     */
    const { data: irmas } = await supabase
      .from("activities").select("wbs_code")
      .eq("parent_id", paiId).eq("is_trashed", false);
    const base = ((p as Record<string, unknown>)?.wbs_code as string) ?? "";
    const n = (irmas ?? []).length + 1;
    setCodigoSugerido(base ? `${base}.${n}` : String(n));
  }, [paiId]);

  useEffect(() => { void carregarContexto(); }, [carregarContexto]);

  /* ── os tipos oferecidos, pela seção 07 ────────────────────────────────── */
  const paiKind: EapKind | null = pai ? resolveEapKind(pai as never) : null;
  const oferecidos = useMemo(() => eapTiposQuePodeCriar(paiKind), [paiKind]);
  const motivoNaoCria = eapMotivoNaoCriaDentro(paiKind);

  useEffect(() => {
    // Se o tipo escolhido deixou de ser oferecido (o pai mudou), cai no
    // primeiro válido em vez de gravar algo que a regra não permite.
    if (oferecidos.length > 0 && !oferecidos.includes(tipo)) setTipo(oferecidos[0]);
  }, [oferecidos, tipo]);

  /* ── criar ─────────────────────────────────────────────────────────────── */
  const criar = useCallback(async (continuar: boolean) => {
    const titulo = nome.trim();
    // SÓ O NOME É OBRIGATÓRIO. O que ficar em branco aparece na faixa do
    // backlog como "falta prazo · falta responsável" — em vez de virar campo
    // obrigatório preenchido de qualquer jeito.
    if (!titulo) { setErro("O nome é obrigatório."); return; }

    setSalvando(true);
    setErro(null);
    try {
      const persistido = eapToPersisted(tipo);
      const { data, error } = await supabase
        .from("activities")
        .insert({
          project_id: projectId,
          title: titulo,
          parent_id: paiId,
          item_type: persistido.item_type,
          is_milestone: persistido.is_milestone,
          wbs_code: codigoSugerido,
          status: "pending",
        } as never)
        .select("id")
        .single();

      if (error) throw new Error(error.message);
      const novoId = String((data as Record<string, unknown>).id);

      // O "Raphael criou esta atividade" NÃO é escrito aqui: o histórico de
      // alterações já é gravado por trigger, e a view do feed o lê. Registrar
      // à mão produziria a linha duas vezes.

      if (continuar) {
        // Reabre em branco, no MESMO pacote, com o código já avançado.
        setNome("");
        await carregarContexto();
        setSalvando(false);
        return;
      }
      router.push(`/project/${projectId}/atividade/${novoId}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não foi possível criar");
      setSalvando(false);
    }
  }, [nome, tipo, projectId, paiId, codigoSugerido, router, user?.id, nomeDeQuemFez, carregarContexto]);

  /* ── dentro de marco não se cria ───────────────────────────────────────── */
  if (motivoNaoCria) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <p className="text-sm text-foreground">{motivoNaoCria}</p>
        <a href={`/project/${projectId}`} className="text-sm text-primary underline underline-offset-4">
          Voltar ao projeto
        </a>
      </div>
    );
  }

  const dados: DadosDaTela = {
    id: null,
    projectId,
    wbs_code: codigoSugerido,
    title: nome,
    descricao: null,
    tipoRotulo: `${EAP_LABELS[tipo]}${oferecidos.length > 1 ? "" : " (único tipo aqui)"}`,
    tipoKind: tipo,
    ehMarco: tipo === "marco",
    concluida: false,
    statusRotulo: "",
    statusCor: null,
    previstoInicio: null, previstoFim: null,
    realizadoInicio: null, realizadoFim: null,
    horasPrevistas: null, horasApontadas: null,
    gut: null,
    faseRotulo: trilha[0] ? `${trilha[0].wbs_code ?? ""} ${trilha[0].title}`.trim() : null,
    pacoteRotulo: pai ? String(pai.title ?? "") : null,
    origemRotulo: null,
    custoRotulo: null,
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {erro && (
        <div className="px-5 pt-3">
          <p className="text-[12.5px] text-destructive">{erro}</p>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <TelaDaAtividade
          estado="criar"
          dados={dados}
          trilha={trilha}
          pessoas={[]}
          totais={{ filhas: null, horas: null, termino: null, progresso: null }}
          subatividades={[]}
          feed={[]}
          naoLidos={0}
          capacidades={{ editarNome: !salvando, editarDescricao: false }}
          aoGravarCampo={async (campo, valor) => {
            if (campo === "title") setNome(valor);
          }}
          aoCriar={() => criar(false)}
          aoCriarEContinuar={() => criar(true)}
          aoCancelar={() => router.push(`/project/${projectId}`)}
        />
      </div>
    </div>
  );
}
