import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/integrations/supabase/server';

/**
 * Cria notificações com service role.
 *
 * O insert direto do navegador não gravava — nenhuma linha aparecia, mesmo com
 * a policy permitindo INSERT autenticado e o mesmo payload funcionando com
 * service role. Em vez de seguir caçando a causa no cliente, a criação passa
 * pelo servidor, que é o padrão que a leitura (../route.ts) e o mark-read já
 * usam neste projeto.
 *
 * Ganho colateral: o destinatário é resolvido AQUI. Antes o cliente decidia
 * quem notificar a partir da lista de perfis que ele mesmo conseguia ler — se
 * o RLS escondesse alguém, a pessoa simplesmente não era avisada, sem erro.
 *
 * Body: { activityId, projectId?, body, mentionedNames[] }
 */

type Row = {
  target_user_id: string;
  activity_id: string | null;
  project_id: string | null;
  type: string;
  title: string;
  message: string;
};

// Casa nomes de forma tolerante a acento, caixa e espaço — os campos de pessoa
// no sistema são texto livre, não FK, então "José Silva" e "jose silva" são a
// mesma pessoa.
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export async function POST(request: Request) {
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

  let payload: {
    activityId?: string;
    projectId?: string | null;
    body?: string;
    mentionedNames?: string[];
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const { activityId, body } = payload;
  if (!activityId || !body) {
    return NextResponse.json({ error: 'activityId e body são obrigatórios' }, { status: 400 });
  }

  const admin = createSupabaseClient(supabaseUrl, serviceRoleKey);

  // Quem está escrevendo: o nome do perfil é o que aparece na mensagem e é o
  // que precisa ser removido da lista de destinatários (ninguém se autonotifica).
  const { data: profile } = await admin
    .from('profiles').select('id, full_name, email').eq('id', user.id).maybeSingle();
  const authorName = profile?.full_name?.trim() || profile?.email || user.email || 'Alguém';

  const { data: act } = await admin
    .from('activities')
    .select('assigned_to, participants, title, project_id')
    .eq('id', activityId)
    .maybeSingle();

  // Destinatários = citados + responsável + participantes.
  const names = new Set<string>();
  for (const n of payload.mentionedNames || []) if (n) names.add(n);
  if (act) {
    if (act.assigned_to) names.add(act.assigned_to as string);
    const parts = act.participants;
    if (Array.isArray(parts)) for (const p of parts) if (p) names.add(p as string);
  }
  names.delete(authorName);
  if (names.size === 0) return NextResponse.json({ created: 0 });

  // Resolve nome -> ids. Lista completa de perfis, lida com service role: o
  // cliente via só o que o RLS deixava, e quem ficasse de fora não era avisado.
  const { data: peopleRows } = await admin
    .from('profiles').select('id, full_name').eq('is_active', true);

  // Um nome pode ter MAIS DE UM perfil (a base tem "Williame Correia de Lima"
  // duas vezes). Mapear nome->id sobrescreveria, avisando só uma das contas.
  const idsByName = new Map<string, string[]>();
  for (const p of peopleRows || []) {
    if (!p.full_name) continue;
    const k = norm(p.full_name);
    idsByName.set(k, [...(idsByName.get(k) || []), p.id]);
  }

  const mentionedIds = new Set(
    (payload.mentionedNames || []).flatMap((n) => idsByName.get(norm(n)) || []),
  );
  const targetIds = Array.from(
    new Set(Array.from(names).flatMap((n) => idsByName.get(norm(n)) || [])),
  ).filter((id) => id !== user.id);

  if (targetIds.length === 0) return NextResponse.json({ created: 0 });

  const title = act?.title ?? 'atividade';
  const rows: Row[] = targetIds.map((uid) => ({
    target_user_id: uid,
    activity_id: activityId,
    project_id: (act?.project_id as string) ?? payload.projectId ?? null,
    type: mentionedIds.has(uid) ? 'activity_mention' : 'activity_note',
    title: mentionedIds.has(uid)
      ? `${authorName} citou você em "${title}"`
      : `Novo registro em "${title}"`,
    message: `${authorName}: ${body.slice(0, 120)}`,
  }));

  const { error } = await admin.from('notifications').insert(rows);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ created: rows.length });
}
