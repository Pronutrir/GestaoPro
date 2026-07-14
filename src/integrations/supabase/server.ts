import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseServerUrl, SUPABASE_COOKIE_NAME } from './config';
import type { Database } from './types';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    getSupabaseServerUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: SUPABASE_COOKIE_NAME },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll chamado de um Server Component — cookies de sessão
            // serão gerenciados pelo middleware.
          }
        },
      },
    }
  );
}
