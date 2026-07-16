import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/integrations/supabase/server";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

const rateLimitStore =
  (globalThis as typeof globalThis & { __textAssistRateLimitStore?: Map<string, RateLimitEntry> })
    .__textAssistRateLimitStore ?? new Map<string, RateLimitEntry>();

(globalThis as typeof globalThis & { __textAssistRateLimitStore?: Map<string, RateLimitEntry> })
  .__textAssistRateLimitStore = rateLimitStore;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function enforceRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      retryAfterSeconds: 0,
    };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  rateLimitStore.set(key, current);
  return {
    allowed: true,
    remaining: Math.max(0, limit - current.count),
    retryAfterSeconds: 0,
  };
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const firstIp = xff.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

type Action = "correct" | "improve" | "summarize" | "expand";

const SYSTEM_PROMPTS: Record<Action, string> = {
  correct:
    "Você é um revisor de português brasileiro (PT-BR). Corrija APENAS erros de ortografia, gramática, pontuação e concordância. NÃO altere o sentido, o estilo ou a estrutura do texto. NÃO adicione informação nova. Mantenha o mesmo tamanho aproximado. Responda APENAS com o texto corrigido, sem aspas, sem comentários, sem cabeçalhos.",
  improve:
    "Você é um redator profissional especializado em comunicação corporativa em português brasileiro (PT-BR). Reescreva o texto melhorando clareza, fluidez e adotando um tom executivo, objetivo e profissional. Mantenha a essência e os fatos do texto original. NÃO invente informações. Responda APENAS com o texto reescrito, sem aspas, sem comentários, sem cabeçalhos.",
  summarize:
    "Você é um redator especialista em síntese executiva em português brasileiro (PT-BR). Resuma o texto em um único parágrafo curto, claro e direto, preservando os pontos essenciais. Use no máximo 3 frases. Responda APENAS com o resumo, sem aspas, sem comentários, sem cabeçalhos.",
  expand:
    "Você é um redator profissional em português brasileiro (PT-BR). Expanda o texto fornecido em uma versão mais completa e detalhada, mantendo o tom profissional e a coerência com a ideia original. NÃO invente fatos específicos (datas, nomes, números) que não estejam presentes ou implícitos. Responda APENAS com o texto expandido, sem aspas, sem comentários, sem cabeçalhos.",
};

const CONTEXT_HINTS: Record<string, string> = {
  project_title: "O texto é o TÍTULO de um projeto. Mantenha curto (máx 80 caracteres), direto e descritivo.",
  project_description: "O texto é a DESCRIÇÃO de um projeto corporativo.",
  activity_title: "O texto é o TÍTULO de uma atividade/tarefa. Mantenha curto (máx 100 caracteres), com verbo de ação no infinitivo quando possível.",
  activity_description: "O texto é a DESCRIÇÃO de uma atividade/tarefa de projeto.",
  meeting_title: "O texto é o TÍTULO de uma reunião. Mantenha curto e descritivo.",
  meeting_agenda: "O texto é a PAUTA de uma reunião corporativa.",
  meeting_minutes: "O texto é a ATA/MINUTA de uma reunião corporativa.",
  risk_description: "O texto descreve um RISCO de projeto.",
  risk_mitigation: "O texto descreve a MITIGAÇÃO de um risco de projeto.",
  risk_contingency: "O texto descreve a CONTINGÊNCIA para um risco.",
  assumption_description: "O texto descreve uma PREMISSA de projeto.",
  lesson_problem: "O texto descreve um PROBLEMA registrado em lição aprendida.",
  lesson_solution: "O texto descreve a SOLUÇÃO aplicada em lição aprendida.",
  lesson_suggestion: "O texto é uma SUGESTÃO/recomendação em lição aprendida.",
  story_narrative: "O texto é a NARRATIVA de uma história de usuário.",
  story_acceptance: "O texto é um critério de aceitação de história de usuário.",
  story_title: "O texto é o TÍTULO de uma história de usuário. Mantenha curto e direto.",
  comment: "O texto é um COMENTÁRIO em uma atividade de projeto. Mantenha tom conversacional e profissional.",
  meeting_decision: "O texto é uma DECISÃO tomada em reunião. Seja claro, objetivo e acionável.",
  meeting_action: "O texto é uma AÇÃO/tarefa derivada de reunião. Use verbo de ação no infinitivo, seja específico.",
  document_description: "O texto é a DESCRIÇÃO de um documento de projeto. Mantenha breve e informativo.",
  package_title: "O texto é o TÍTULO de um PACOTE de atividades. Curto e descritivo.",
  tap_objective: "O texto é o OBJETIVO de um projeto no Termo de Abertura (TAP).",
  tap_problem: "O texto é a DECLARAÇÃO DE PROBLEMA no Termo de Abertura (TAP).",
  tap_root_cause: "O texto é a CAUSA RAIZ no Termo de Abertura (TAP).",
  tap_scope: "O texto é o ESCOPO do projeto no Termo de Abertura (TAP).",
  tap_out_of_scope: "O texto é o NÃO-ESCOPO (out of scope) no TAP.",
  tap_benefits: "O texto descreve os BENEFÍCIOS ESPERADOS no TAP.",
  tap_restrictions: "O texto descreve as RESTRIÇÕES do projeto no TAP.",
  tap_regulatory: "O texto descreve REQUISITOS REGULATÓRIOS no TAP.",
  generic: "Texto corporativo genérico de gestão de projetos.",
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const limit = parsePositiveInt(process.env.OPENROUTER_TEXT_ASSIST_RATE_LIMIT, 12);
  const windowMs = parsePositiveInt(process.env.OPENROUTER_TEXT_ASSIST_RATE_WINDOW_MS, 60_000);
  const rateLimitKey = `${user.id}:${getClientIp(req)}`;
  const rate = enforceRateLimit(rateLimitKey, limit, windowMs);

  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Limite de requisições atingido. Tente novamente em instantes." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rate.retryAfterSeconds),
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY não configurada" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const action = body.action as Action | undefined;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const context = typeof body.context === "string" ? body.context : "generic";
  // Contexto adicional opcional (ex.: campos vizinhos de um formulário), para a
  // IA entender o cenário em torno do texto que está sendo reescrito.
  const extraContext =
    typeof body.extraContext === "string" ? body.extraContext.trim().slice(0, 2000) : "";

  if (!action || !["correct", "improve", "summarize", "expand"].includes(action)) {
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "Texto vazio. Escreva algo antes de usar a IA." }, { status: 400 });
  }
  if (text.length > 8000) {
    return NextResponse.json({ error: "Texto muito longo (máx 8000 caracteres)." }, { status: 400 });
  }

  const systemPrompt =
    SYSTEM_PROMPTS[action] +
    "\n\nContexto: " +
    (CONTEXT_HINTS[context] ?? CONTEXT_HINTS.generic) +
    (extraContext
      ? "\n\nInformações de referência sobre a demanda (NÃO as reescreva e NÃO as inclua na resposta; use apenas para entender o cenário e manter o texto coerente e específico). Escreva sempre da perspectiva de quem solicita, sobre o assunto do pedido — o setor do solicitante é apenas a origem da demanda, nunca o tema do texto:\n" +
        extraContext
      : "");

  const model = process.env.OPENROUTER_TEXT_ASSIST_MODEL
    ?? process.env.OPENROUTER_MODEL
    ?? "openai/gpt-4o-mini";

  try {
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      }),
    });

    if (aiResponse.status === 429) {
      return NextResponse.json(
        { error: "Limite de requisições atingido. Tente novamente em instantes." },
        { status: 429 }
      );
    }
    if (aiResponse.status === 402) {
      return NextResponse.json(
        { error: "Créditos de IA esgotados." },
        { status: 402 }
      );
    }
    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return NextResponse.json({ error: "Falha ao chamar IA." }, { status: 500 });
    }

    const data = await aiResponse.json();
    const result = data?.choices?.[0]?.message?.content?.trim() ?? "";

    if (!result) {
      return NextResponse.json({ error: "IA não retornou texto." }, { status: 500 });
    }

    return NextResponse.json(
      { result },
      {
        headers: {
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(rate.remaining),
        },
      }
    );
  } catch (e: unknown) {
    console.error("ai-text-assist error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}
