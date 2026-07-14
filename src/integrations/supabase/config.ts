// URL do Supabase para código server-side (Node). Dentro do docker usa a rede
// interna (http://kong:8000). SUPABASE_INTERNAL_URL é runtime-only (sem NEXT_PUBLIC_).
export function getSupabaseServerUrl(): string {
  return process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

// Nome fixo do cookie de sessão. Sem isso o @supabase/ssr deriva o nome do
// hostname da URL — que difere entre o browser (domínio público) e o servidor
// (kong interno), quebrando PKCE e leitura de sessão no SSR.
export const SUPABASE_COOKIE_NAME = 'sb-gestaopro-auth-token';
