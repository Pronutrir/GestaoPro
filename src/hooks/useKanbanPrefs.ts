/**
 * Hook das preferências de exibição do Kanban.
 *
 * Ordem de montagem (importa para a tela não pular):
 *   1. estado inicial = cache local, síncrono, no primeiro render
 *   2. efeito       = banco; se houver linha, ela vence e regrava o cache
 *   3. mudou        = cache na hora + banco com atraso
 *
 * O atraso existe porque preferência muda em rajada: arrastar a borda de uma
 * coluna dispara dezenas de larguras por segundo, e cada uma viraria um POST.
 * O debounce junta tudo num upsert só depois que a mão para.
 *
 * Ver lib/kanbanPrefs.ts para o formato e o porquê de filtro ficar de fora.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  KanbanPrefs,
  DEFAULT_PREFS,
  lerPrefsLocais,
  gravarPrefsLocais,
  migrarChavesAntigas,
  limparChavesAntigas,
  buscarPrefsRemotas,
  salvarPrefsRemotas,
} from "@/lib/kanbanPrefs";

/** Espera depois da última mudança antes de escrever no banco. */
const DEBOUNCE_MS = 800;

export function useKanbanPrefs(projectId: string, userId: string | null) {
  const [prefs, setPrefsState] = useState<KanbanPrefs>(() => {
    // Migra as chaves da versão anterior ANTES da primeira leitura: quem já
    // usava o quadro mantém larguras e campos escolhidos.
    const migrado = migrarChavesAntigas(projectId);
    return migrado ?? lerPrefsLocais(projectId);
  });

  /** false quando a migration ainda não rodou na VM — para de tentar gravar. */
  const remotoDisponivel = useRef(true);
  /** Evita que a resposta do banco sobrescreva uma mudança feita enquanto ela vinha. */
  const mexeuAntesDeCarregar = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Último valor pendente de gravação — o timer lê daqui, não do estado. */
  const pendente = useRef<KanbanPrefs | null>(null);

  // Limpa as chaves da era anterior uma vez por projeto.
  useEffect(() => { limparChavesAntigas(projectId); }, [projectId]);

  // Carrega do banco. O cache já pintou a tela; isto só corrige se divergir.
  useEffect(() => {
    if (!userId) return;
    let cancelado = false;
    mexeuAntesDeCarregar.current = false;

    (async () => {
      const remoto = await buscarPrefsRemotas(projectId, userId);
      // A pessoa mexeu no quadro enquanto a busca vinha: o gesto dela é mais
      // recente que a linha do banco, então o remoto não pode vencer.
      if (cancelado || !remoto || mexeuAntesDeCarregar.current) return;
      setPrefsState(remoto);
      gravarPrefsLocais(projectId, remoto);
    })();

    return () => { cancelado = true; };
  }, [projectId, userId]);

  const agendarGravacao = useCallback((next: KanbanPrefs) => {
    pendente.current = next;
    if (!userId || !remotoDisponivel.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const valor = pendente.current;
      if (!valor) return;
      const ok = await salvarPrefsRemotas(projectId, userId, valor);
      if (!ok) remotoDisponivel.current = false; // migration ausente: desiste
    }, DEBOUNCE_MS);
  }, [projectId, userId]);

  /** Atualiza uma fatia das preferências. Local é imediato; banco, com atraso. */
  const setPrefs = useCallback((patch: Partial<KanbanPrefs> | ((p: KanbanPrefs) => Partial<KanbanPrefs>)) => {
    mexeuAntesDeCarregar.current = true;
    setPrefsState((prev) => {
      const delta = typeof patch === "function" ? patch(prev) : patch;
      const next = { ...prev, ...delta };
      gravarPrefsLocais(projectId, next);
      agendarGravacao(next);
      return next;
    });
  }, [projectId, agendarGravacao]);

  /** Volta tudo ao padrão de fábrica (botão "Restaurar" do painel Exibição). */
  const restaurarPrefs = useCallback(() => {
    mexeuAntesDeCarregar.current = true;
    gravarPrefsLocais(projectId, DEFAULT_PREFS);
    agendarGravacao(DEFAULT_PREFS);
    setPrefsState(DEFAULT_PREFS);
  }, [projectId, agendarGravacao]);

  // Descarrega o que estiver pendente ao sair: trocar de projeto ou fechar a
  // aba dentro da janela do debounce perderia a última mudança.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      const valor = pendente.current;
      if (valor && userId && remotoDisponivel.current) {
        void salvarPrefsRemotas(projectId, userId, valor);
      }
    };
  }, [projectId, userId]);

  return { prefs, setPrefs, restaurarPrefs };
}
