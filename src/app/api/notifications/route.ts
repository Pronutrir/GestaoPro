import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/integrations/supabase/server';
import { getSupabaseServerUrl } from '@/integrations/supabase/config';
import { anyMatchesIdentity, buildUserCandidates, matchesIdentity } from '@/lib/identityMatch';

type NotificationRow = {
  id: string;
  project_id: string | null;
  activity_id: string | null;
  type: string;
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
  target_user_id: string | null;
};

type ActivityRow = {
  id: string;
  project_id: string;
  assigned_to: string | null;
  participants: string[] | null;
};

/**
 * Quantas notificações VISÍVEIS a resposta entrega por página.
 *
 * O corte é aplicado DEPOIS do filtro de permissão, não antes. Era esse o
 * defeito do teto anterior: o `limit` valia sobre a tabela inteira, então um
 * usuário comum recebia 500 linhas do banco que viravam poucas dezenas após o
 * filtro — e não havia como pedir mais. Agora a rota varre o acervo em lotes
 * até juntar uma página cheia de itens que a pessoa realmente pode ver.
 */
const PAGE_SIZE = 50;

/** Lote lido do banco por volta da varredura. */
const SCAN_CHUNK = 500;

/** Teto de segurança da varredura: 20 × 500 = 10.000 linhas por requisição. */
const MAX_SCANS = 20;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get('limit'));
  const pageSize = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 200)
    : PAGE_SIZE;
  const requestedOffset = Number(url.searchParams.get('offset'));
  const offset = Number.isFinite(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;
  // `unreadOnly=1` alimenta o filtro da UI sem baixar o histórico já lido.
  const unreadOnly = url.searchParams.get('unreadOnly') === '1';

  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const supabaseUrl =
    process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 });
  }

  const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey);

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    adminClient.from('profiles').select('id, full_name, email').eq('id', user.id).maybeSingle(),
    adminClient.from('user_roles').select('role').eq('user_id', user.id),
  ]);

  const isAdmin = (roleRows || []).some((row) => row.role === 'admin');

  const userCandidates = buildUserCandidates([
    profile?.id,
    profile?.full_name,
    profile?.email,
    user.id,
    user.email,
  ]);

  // Um lote do acervo, ordenado com as não lidas primeiro. `read_at` pode não
  // existir (migration pendente) — nesse caso relê sem a coluna.
  const COLUMNS_WITH_READ_AT =
    'id, project_id, activity_id, type, title, message, is_read, created_at, read_at, target_user_id';
  const COLUMNS_LEGACY =
    'id, project_id, activity_id, type, title, message, is_read, created_at, target_user_id';

  const fetchChunk = async (from: number, to: number) => {
    const build = (columns: string) => {
      let q = adminClient.from('notifications').select(columns);
      if (unreadOnly) q = q.eq('is_read', false);
      return q
        .order('is_read', { ascending: true })
        .order('created_at', { ascending: false })
        .range(from, to);
    };

    const withReadAt = await build(COLUMNS_WITH_READ_AT);

    const missingColumn =
      withReadAt.error &&
      (withReadAt.error.code === '42703' ||
        withReadAt.error.code === 'PGRST204' ||
        /read_at/i.test(withReadAt.error.message));

    if (!missingColumn) return withReadAt;
    return build(COLUMNS_LEGACY);
  };

  const [firstChunk, activitiesRes, membersRes, projectsRes] = await Promise.all([
    fetchChunk(0, SCAN_CHUNK - 1),
    adminClient
      .from('activities')
      .select('id, project_id, assigned_to, participants')
      .eq('is_trashed', false),
    adminClient
      .from('project_members')
      .select('project_id, invitation_status')
      .eq('user_id', user.id),
    adminClient
      .from('projects')
      .select('id, owner')
      .eq('is_trashed', false),
  ]);

  if (firstChunk.error || activitiesRes.error || membersRes.error || projectsRes.error) {
    const message =
      firstChunk.error?.message ||
      activitiesRes.error?.message ||
      membersRes.error?.message ||
      projectsRes.error?.message ||
      'Erro ao buscar notificações';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const activities = (activitiesRes.data || []) as ActivityRow[];
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));

  const accessibleProjectIds = new Set<string>();

  for (const member of membersRes.data || []) {
    const status = (member.invitation_status || 'accepted').toLowerCase();
    if (status !== 'declined') {
      accessibleProjectIds.add(member.project_id);
    }
  }

  for (const project of projectsRes.data || []) {
    if (matchesIdentity(project.owner, userCandidates)) {
      accessibleProjectIds.add(project.id);
    }
  }

  for (const activity of activities) {
    const participants = Array.isArray(activity.participants) ? activity.participants : [];
    if (matchesIdentity(activity.assigned_to, userCandidates) || anyMatchesIdentity(participants, userCandidates)) {
      accessibleProjectIds.add(activity.project_id);
    }
  }

  /** O usuário pode ver esta notificação? Mesma regra de antes. */
  const canSee = (notification: NotificationRow) => {
    if (isAdmin) return true;
    if (notification.target_user_id === user.id) return true;
    if (notification.target_user_id) return false;

    if (!notification.activity_id) {
      return !!notification.project_id && accessibleProjectIds.has(notification.project_id);
    }

    const activity = activityById.get(notification.activity_id);
    if (!activity) return false;
    if (matchesIdentity(activity.assigned_to, userCandidates)) return true;

    const participants = Array.isArray(activity.participants) ? activity.participants : [];
    if (anyMatchesIdentity(participants, userCandidates)) return true;

    return !!notification.project_id && accessibleProjectIds.has(notification.project_id);
  };

  /**
   * Varre o acervo em lotes até juntar a página pedida DE ITENS VISÍVEIS.
   *
   * A varredura é necessária porque a permissão não é expressável na consulta:
   * depende de atividades, participantes e vínculos de projeto. Ler um lote
   * grande e filtrar depois era o que fazia a lista parecer truncada.
   */
  const visiveis: NotificationRow[] = [];
  const precisaAte = offset + pageSize;
  let scans = 0;
  let chunk = firstChunk;
  let esgotou = false;
  let varreduraIncompleta = false;
  // Quando a varredura para cedo, ainda é preciso saber se TODAS as não lidas
  // já foram vistas: elas vêm primeiro na ordenação, então o primeiro item já
  // lido encontrado prova que não há mais nenhuma não lida adiante.
  let passouDasNaoLidas = false;

  while (true) {
    const linhas = (chunk.data || []) as unknown as NotificationRow[];
    for (const linha of linhas) {
      if (linha.is_read) passouDasNaoLidas = true;
      if (canSee(linha)) visiveis.push(linha);
    }

    // Lote menor que o pedido ⇒ chegou ao fim da tabela.
    if (linhas.length < SCAN_CHUNK) {
      esgotou = true;
      break;
    }
    // Só para cedo depois de ter varrido TODAS as não lidas — senão o
    // contador do sino sairia menor que a realidade, que foi o defeito
    // original desta tela.
    if (visiveis.length > precisaAte && (unreadOnly || passouDasNaoLidas)) break;

    scans += 1;
    if (scans >= MAX_SCANS) {
      // Teto de segurança: não varre o acervo inteiro numa requisição só.
      // `hasMore` continua true, então a UI oferece "carregar mais".
      varreduraIncompleta = true;
      break;
    }

    const from = scans * SCAN_CHUNK;
    chunk = await fetchChunk(from, from + SCAN_CHUNK - 1);
    if (chunk.error) {
      return NextResponse.json({ error: chunk.error.message }, { status: 500 });
    }
  }

  const pagina = visiveis.slice(offset, offset + pageSize).map((notification) => ({
    ...notification,
    read_at: notification.read_at ?? null,
  }));

  // Contagem de não lidas VISÍVEIS. É exata quando a varredura passou do
  // último item não lido (ou chegou ao fim) — um contador que mente é pior
  // que um que assume o próprio limite, e foi assim que esta tela enganou antes.
  const unreadCount = visiveis.filter((n) => !n.is_read).length;
  const unreadCountExact = esgotou || (passouDasNaoLidas && !varreduraIncompleta);
  const hasMore = !esgotou || visiveis.length > offset + pageSize;

  return NextResponse.json({
    notifications: pagina,
    hasMore,
    offset,
    limit: pageSize,
    unreadCount,
    unreadCountExact,
  });
}