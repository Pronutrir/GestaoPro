import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Callback OAuth (Azure AD).
 * GoTrue redireciona aqui após o login no Microsoft com `?code=...`.
 * Trocamos o code por uma sessão (cookies httpOnly) e redirecionamos.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  if (error) {
    const url = new URL('/login', origin);
    url.searchParams.set('error', errorDescription ?? error);
    return NextResponse.redirect(url);
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', origin));
  }

  let response = NextResponse.redirect(new URL(next, origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    const url = new URL('/login', origin);
    url.searchParams.set('error', exchangeError.message);
    return NextResponse.redirect(url);
  }

  // Verifica se o profile está ativo
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (profile && profile.is_active === false) {
      return NextResponse.redirect(new URL('/pending-approval', origin));
    }
  }

  return response;
}
