import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // O callback OAuth precisa rodar sem nenhuma chamada do middleware ao Supabase.
  // Cookies parciais do PKCE (vindos do redirect cross-site da Microsoft) podem
  // fazer `auth.getUser()` lançar e o NPM reportar como 502 Bad Gateway.
  if (request.nextUrl.pathname.startsWith('/auth/callback')) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });
  const initialSetupEnabled = process.env.NEXT_PUBLIC_ENABLE_INITIAL_SETUP === 'true';

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Não use getSession() — getUser() valida o JWT no servidor de forma segura
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (pathname === '/setup' && !initialSetupEnabled) {
    return NextResponse.redirect(new URL(user ? '/' : '/login', request.url));
  }

  const isPublicPath =
    pathname === '/login' ||
    pathname === '/pending-approval' ||
    (pathname === '/setup' && initialSetupEnabled);

  if (!user && !isPublicPath) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (user) {
    // Bloqueia usuários inativos (ex.: novo cadastro Azure aguardando aprovação)
    if (pathname !== '/pending-approval') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('id', user.id)
        .maybeSingle();

      if (profile && profile.is_active === false) {
        return NextResponse.redirect(new URL('/pending-approval', request.url));
      }
    }

    if (isPublicPath && pathname !== '/pending-approval') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Exclui rotas de API (auth via Bearer token) e assets estáticos
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
