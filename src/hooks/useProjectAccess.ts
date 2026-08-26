import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { anyMatchesIdentity, buildUserCandidates, matchesIdentity } from "@/lib/identityMatch";

const ACCESS_CACHE_TTL_MS = 60_000;
const memberIdsCacheByUser = new Map<string, { ids: Set<string>; soPorAtividade: Set<string>; ts: number }>();
const inflightByUser = new Map<string, Promise<{ ids: Set<string>; soPorAtividade: Set<string> }>>();

/**
 * Retorna os projetos visíveis para o usuário atual conforme o modelo v2.
 * Somente admins veem tudo. Usuários comuns veem apenas projetos onde são
 * membros explícitos ou líderes do projeto (owner por nome).
 */
export const useProjectAccess = () => {
  const { user, isAdmin, isGestor, canManage, profile, loading } = useAuth();
  const [memberProjectIds, setMemberProjectIds] = useState<Set<string>>(new Set());
  /**
   * Projetos onde o acesso vem SÓ do vínculo por atividade — sem ser membro,
   * dono, líder ou gestor. Nesses, as telas mostram apenas as atividades da
   * pessoa, e o Dashboard precisa contar o mesmo escopo.
   */
  const [projetosSoPorAtividade, setProjetosSoPorAtividade] = useState<Set<string>>(new Set());
  const [membershipsLoading, setMembershipsLoading] = useState(true);
  const lastRefreshRef = useRef(0);

  const loadMemberships = useCallback(async () => {
    if (loading) return;

    if (isAdmin || !user?.id) {
      setMemberProjectIds(new Set());
      setProjetosSoPorAtividade(new Set());
      setMembershipsLoading(false);
      return;
    }

    const cached = memberIdsCacheByUser.get(user.id);
    if (cached && Date.now() - cached.ts < ACCESS_CACHE_TTL_MS) {
      setMemberProjectIds(new Set(cached.ids));
      setProjetosSoPorAtividade(new Set(cached.soPorAtividade));
      setMembershipsLoading(false);
      return;
    }

    setMembershipsLoading(true);

    try {
      let inflight = inflightByUser.get(user.id);
      if (!inflight) {
        inflight = (async () => {
          const candidates = buildUserCandidates([
            profile?.full_name,
            profile?.email,
            user?.email,
          ]);

          const membersPromise = supabase
            .from("project_members")
            .select("project_id, invitation_status")
            .eq("user_id", user.id);

          // Buscado SEMPRE (não só quando há candidates): é a lista de projetos
          // vivos, usada abaixo para barrar os que estão na lixeira. Sem ela,
          // um vínculo de membro ou uma atividade viva dentro de um projeto
          // arquivado o traria de volta como "acessível".
          const projectsPromise = supabase
            .from("projects")
            .select("id, owner")
            .eq("is_trashed", false);

          const activitiesPromise = candidates.length > 0
            ? supabase
                .from("activities")
                .select("project_id, assigned_to, participants")
                .eq("is_trashed", false)
            : Promise.resolve({ data: [] as any[], error: null });

          const [membersRes, projectsRes, activitiesRes] = await Promise.all([
            membersPromise,
            projectsPromise,
            activitiesPromise,
          ]);

          // Projetos VIVOS. Todo caminho de acesso passa por aqui: nem vínculo
          // de membro nem atividade atribuída ressuscitam um projeto arquivado.
          // Era esse o furo — `projects` já vinha filtrado, mas os dois outros
          // caminhos adicionavam ids sem consultar essa lista.
          const vivos = new Set<string>((projectsRes.data || []).map((p: any) => p.id));

          const ids = new Set<string>();
          /**
           * Projetos onde o acesso vem SÓ do vínculo por atividade.
           *
           * O hook já distinguia isso internamente — só não devolvia. E a falta
           * aparecia no Dashboard: quem participa de 7 atividades em projetos
           * que somam 145 via os KPIs contarem as 145, incluindo atrasadas que
           * não consegue abrir. Medido em 25/08: 13 pessoas nessa situação.
           *
           * Membro, dono, líder e gestor NÃO entram aqui: eles enxergam o
           * projeto inteiro nas telas, e o painel deve concordar.
           */
          const amplos = new Set<string>();
          (membersRes.data || []).forEach((m: any) => {
            const status = (m.invitation_status || "accepted").toLowerCase();
            if (status !== "declined" && vivos.has(m.project_id)) {
              ids.add(m.project_id);
              amplos.add(m.project_id);
            }
          });

          if (candidates.length > 0) {
            (projectsRes.data || []).forEach((p: any) => {
              const ownerMatch = matchesIdentity(p.owner, candidates);
              if (ownerMatch) { ids.add(p.id); amplos.add(p.id); }
            });

            (activitiesRes.data || []).forEach((a: any) => {
              if (!vivos.has(a.project_id)) return;
              const isAssignedActor = matchesIdentity(a.assigned_to, candidates);
              const isParticipantActor = Array.isArray(a.participants) && anyMatchesIdentity(a.participants, candidates);

              if (isAssignedActor || isParticipantActor) {
                ids.add(a.project_id);
              }
            });
          }

          /**
           * `amplos` era montado e DESCARTADO.
           *
           * A função devolvia só `ids`, então `setProjetosSoPorAtividade` nunca
           * era chamado e o hook sempre entregava um Set vazio — o recorte de
           * KPI que o comentário acima descreve não acontecia. Achado no
           * inventário de 25/08/2026.
           *
           * "Só por atividade" é o que sobra: quem está em `ids` (alcança o
           * projeto) e NÃO em `amplos` (não é membro, dono, líder nem gestor).
           */
          const soPorAtividade = new Set<string>();
          ids.forEach((id) => { if (!amplos.has(id)) soPorAtividade.add(id); });
          return { ids, soPorAtividade };
        })().finally(() => {
          inflightByUser.delete(user.id);
        });

        inflightByUser.set(user.id, inflight);
      }

      const { ids, soPorAtividade } = await inflight;
      memberIdsCacheByUser.set(user.id, { ids: new Set(ids), soPorAtividade: new Set(soPorAtividade), ts: Date.now() });
      setMemberProjectIds(new Set(ids));
      setProjetosSoPorAtividade(new Set(soPorAtividade));
    } catch (error) {
      console.error("[useProjectAccess] loadMemberships failed", error);
      setMemberProjectIds(new Set());
      setProjetosSoPorAtividade(new Set());
    } finally {
      setMembershipsLoading(false);
    }
  }, [isAdmin, loading, user?.id, profile?.email, profile?.full_name]);

  useEffect(() => {
    loadMemberships();
  }, [loadMemberships]);

  // Mantemos a referência mais recente de loadMemberships sem refazer o effect
  // de subscribe (que recriaria o canal Realtime e quebraria com
  // "cannot add postgres_changes callbacks after subscribe()").
  const loadMembershipsRef = useRef(loadMemberships);
  useEffect(() => {
    loadMembershipsRef.current = loadMemberships;
  }, [loadMemberships]);

  useEffect(() => {
    if (loading || isAdmin || !user?.id) return;

    const refresh = () => {
      const now = Date.now();
      if (now - lastRefreshRef.current < 5_000) return;
      lastRefreshRef.current = now;
      loadMembershipsRef.current();
    };

    const handleFocus = () => refresh();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    // Nome único por mount: evita o singleton interno do supabase-js
    // (mesmo nome após remountagem rapida retorna o canal antigo já "joined"
    // e .on() lança "cannot add postgres_changes callbacks after subscribe()").
    const channelName = `project-memberships-${user.id}-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_members", filter: `user_id=eq.${user.id}` },
        refresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        refresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activities" },
        refresh
      )
      .subscribe();

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [isAdmin, loading, user?.id]);

  const filterProjects = useCallback(async <T extends { id: string }>(projects: T[]): Promise<T[]> => {
    if (isAdmin || !user) return projects;

    return projects.filter((p) => memberProjectIds.has(p.id));
  }, [isAdmin, memberProjectIds, user]);

  return {
    filterProjects,
    accessibleProjectIds: memberProjectIds,
    /** Ver o estado homônimo — o Dashboard usa para recortar os KPIs. */
    projetosSoPorAtividade,
    isAdmin,
    isGestor,
    canManage,
    user,
    loading: loading || membershipsLoading,
  };
};
