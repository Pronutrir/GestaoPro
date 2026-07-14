import { streamText, convertToModelMessages, stepCountIs, tool, type UIMessage } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getSupabaseServerUrl } from '@/integrations/supabase/config';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM_PROMPT = `Você é um assistente de teste em PT-BR para validar a integração com o OpenRouter.
Quando fizer sentido, use as ferramentas (tools) disponíveis em vez de inventar a resposta.
Seja breve e direto.`;

async function requireAdmin(req: Request) {
  const supabaseUrl = getSupabaseServerUrl();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return { error: Response.json({ error: 'Não autenticado' }, { status: 401 }) };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return { error: Response.json({ error: 'Não autenticado' }, { status: 401 }) };
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: roleData } = await adminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (!roleData) {
    return {
      error: Response.json(
        { error: 'Acesso restrito a administradores' },
        { status: 403 },
      ),
    };
  }

  return { user };
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'OPENROUTER_API_KEY ausente no servidor' },
      { status: 500 },
    );
  }

  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;

  const { messages } = (await req.json()) as { messages: UIMessage[] };

  const openrouter = createOpenRouter({ apiKey });
  const modelId = process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini';

  const result = streamText({
    model: openrouter.chat(modelId),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools: {
      getCurrentTime: tool({
        description:
          'Retorna a data e hora atual do servidor em formato ISO 8601 (UTC).',
        inputSchema: z.object({}),
        execute: async () => ({
          now: new Date().toISOString(),
        }),
      }),
      addNumbers: tool({
        description: 'Soma dois números e retorna o resultado.',
        inputSchema: z.object({
          a: z.number().describe('Primeiro número'),
          b: z.number().describe('Segundo número'),
        }),
        execute: async ({ a, b }) => ({
          result: a + b,
        }),
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
