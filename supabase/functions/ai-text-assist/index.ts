import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action as Action | undefined;
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const context = typeof body.context === "string" ? body.context : "generic";

    if (!action || !["correct", "improve", "summarize", "expand"].includes(action)) {
      return new Response(JSON.stringify({ error: "Ação inválida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!text) {
      return new Response(JSON.stringify({ error: "Texto vazio. Escreva algo antes de usar a IA." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (text.length > 8000) {
      return new Response(JSON.stringify({ error: "Texto muito longo (máx 8000 caracteres)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt =
      SYSTEM_PROMPTS[action] +
      "\n\nContexto: " +
      (CONTEXT_HINTS[context] ?? CONTEXT_HINTS.generic);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      }),
    });

    if (aiResponse.status === 429) {
      return new Response(
        JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aiResponse.status === 402) {
      return new Response(
        JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos em Configurações > Workspace > Uso." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "Falha ao chamar IA." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResponse.json();
    const result = data?.choices?.[0]?.message?.content?.trim() ?? "";

    if (!result) {
      return new Response(JSON.stringify({ error: "IA não retornou texto." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-text-assist error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});