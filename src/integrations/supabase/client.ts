import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_COOKIE_NAME } from './config';
import type { Database } from './types';

export const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { cookieOptions: { name: SUPABASE_COOKIE_NAME } }
);
