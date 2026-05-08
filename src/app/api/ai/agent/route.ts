import { streamText, convertToModelMessages, stepCountIs, tool, type UIMessage } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  anyMatchesIdentity,
  buildUserCandidates,
  matchesIdentity,
} from '@/lib/identityMatch';

export const runtime = 'nodejs';
export const maxDuration = 90;

function getEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}


// Prioridade para projetos (inglês)
const PROJECT_PRIORITY_MAP: Record<string, 'low' | 'medium' | 'high'> = {
  alta: 'high', alto: 'high', high: 'high',
  média: 'medium', medio: 'medium', médio: 'medium', medium: 'medium',
  baixa: 'low', baixo: 'low', low: 'low',
};

// Prioridade para atividades (português — valores do banco)
const ACTIVITY_PRIORITY_MAP: Record<string, string> = {
  alta: 'alta', alto: 'alta', high: 'alta', crítica: 'critica', critica: 'critica',
  média: 'media', medio: 'media', médio: 'media', medium: 'media',
  baixa: 'baixa', baixo: 'baixa', low: 'baixa',
  urgente: 'urgente',
};

const STATUS_MAP: Record<string, string> = {
  'ideação': 'ideacao', ideacao: 'ideacao',
  poc: 'poc',
  mvp: 'mvp',
  'em execução': 'em-execucao', 'em-execucao': 'em-execucao', execução: 'em-execucao',
  bloqueado: 'blocked', blocked: 'blocked', bloqueio: 'blocked',
  gaveta: 'drawer', drawer: 'drawer',
};

/**
 * Normaliza um valor usando um mapa de conversão
 * @param val Valor a normalizar
 * @param map Mapa de conversão (chaves normalizadas em lowercase)
 * @param defaultValue Valor padrão se não encontrado
 */
function normalizeValue<T>(val: string | undefined, map: Record<string, T>, defaultValue: T): T {
  return map[val?.toLowerCase().trim() ?? ''] ?? defaultValue;
}

function normalizeProjectPriority(val?: string): 'low' | 'medium' | 'high' {
  return normalizeValue(val, PROJECT_PRIORITY_MAP, 'medium');
}

function normalizeActivityPriority(val?: string): string {
  return normalizeValue(val, ACTIVITY_PRIORITY_MAP, 'media');
}

function projectPriorityToActivityPriority(priority?: string): string {
  const normalized = normalizeProjectPriority(priority);
  if (normalized === 'high') return 'alta';
  if (normalized === 'low') return 'baixa';
  return 'media';
}

function normalizeStatus(val?: string): string {
  return normalizeValue(val, STATUS_MAP, 'ideacao');
}

type GlpiTaskSuggestion = {
  title: string;
  description: string;
  subtasks: string[];
  estimated_hours: number;
  status: string;
};

type ProjectPlanTask = {
  title: string;
  description?: string;
  priority?: string;
  start_date?: string;
  end_date?: string;
  estimated_hours?: number;
  subtasks?: Array<{
    title: string;
    description?: string;
    priority?: string;
    start_date?: string;
    end_date?: string;
    estimated_hours?: number;
  }>;
};

function buildDefaultAppProjectTasks(): ProjectPlanTask[] {
  return [
    {
      title: 'Descoberta e alinhamento do produto',
      description: 'Definir escopo, objetivos e restricoes do aplicativo.',
      priority: 'alta',
      estimated_hours: 8,
      subtasks: [
        { title: 'Mapear objetivos e metricas de sucesso', estimated_hours: 2 },
        { title: 'Levantar requisitos funcionais e nao funcionais', estimated_hours: 4 },
        { title: 'Definir backlog inicial priorizado', estimated_hours: 2 },
      ],
    },
    {
      title: 'UX e prototipacao',
      description: 'Desenhar fluxo principal e validar a experiencia do usuario.',
      priority: 'media',
      estimated_hours: 10,
      subtasks: [
        { title: 'Criar fluxos de navegacao e jornadas', estimated_hours: 3 },
        { title: 'Prototipar telas principais', estimated_hours: 5 },
        { title: 'Revisar prototipo com stakeholders', estimated_hours: 2 },
      ],
    },
    {
      title: 'Implementacao frontend',
      description: 'Construir interface, estados e integracoes no cliente.',
      priority: 'alta',
      estimated_hours: 20,
      subtasks: [
        { title: 'Configurar estrutura de paginas e componentes', estimated_hours: 6 },
        { title: 'Implementar formularios e validacoes', estimated_hours: 8 },
        { title: 'Integrar consumo de API no frontend', estimated_hours: 6 },
      ],
    },
    {
      title: 'Implementacao backend e dados',
      description: 'Estruturar persistencia, regras de negocio e seguranca.',
      priority: 'alta',
      estimated_hours: 20,
      subtasks: [
        { title: 'Modelar entidades e esquema de dados', estimated_hours: 6 },
        { title: 'Implementar endpoints e regras de negocio', estimated_hours: 10 },
        { title: 'Configurar autenticacao e autorizacao', estimated_hours: 4 },
      ],
    },
    {
      title: 'Qualidade e testes',
      description: 'Validar comportamento funcional e reduzir regressao.',
      priority: 'media',
      estimated_hours: 12,
      subtasks: [
        { title: 'Definir cenarios de teste principais', estimated_hours: 3 },
        { title: 'Executar testes funcionais e correcao de bugs', estimated_hours: 7 },
        { title: 'Realizar validacao final com usuario-chave', estimated_hours: 2 },
      ],
    },
    {
      title: 'Publicacao e acompanhamento inicial',
      description: 'Preparar deploy, monitoramento e rotina de melhorias.',
      priority: 'media',
      estimated_hours: 8,
      subtasks: [
        { title: 'Configurar ambiente de producao', estimated_hours: 3 },
        { title: 'Publicar versao inicial e checklist de release', estimated_hours: 3 },
        { title: 'Monitorar erros e coletar feedback inicial', estimated_hours: 2 },
      ],
    },
  ];
}

type VisibleActivityRow = {
  project_id: string | null;
  assigned_to: string | null;
  participants: string[] | null;
};

type VisibleProjectRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  description: string | null;
  due_date: string | null;
  created_by: string | null;
  owner: string | null;
  manager: string | null;
  assignees: string[] | null;
};

type ParentActivityRow = {
  id: string;
  title: string | null;
  description: string | null;
  item_type: string | null;
};

type ExistingStoryRow = {
  activity_id: string | null;
};

type InsertedStoryRow = {
  id: string;
  title: string;
  activity_id: string;
};

function normalizeTextForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeStageName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isVisibleKanbanStage(stage: { display_order?: number | null; is_visible?: boolean | null }): boolean {
  return (stage.display_order ?? 0) > 0 && stage.is_visible !== false;
}

function stageNameMatchesInput(stageTitle: string, requestedStageName: string): boolean {
  const requested = normalizeStageName(requestedStageName);
  const title = normalizeStageName(stageTitle);

  if (title === requested) return true;

  // Compatibilidade: usuário pode dizer apenas "Backlog".
  if (requested === 'backlog' && title.includes('backlog')) return true;

  return false;
}

/**
 * Sistema de scoring para inferências semânticas
 * Permite fuzzy matching e ponderação de keywords
 */
function findBestMatch(
  text: string,
  matches: Array<{ keywords: string[]; weight: number; result: string }>,
  defaultResult: string,
): string {
  const normalized = normalizeTextForMatch(text);
  const words = new Set(normalized.split(/\s+/).filter(w => w.length > 2));

  let bestScore = 0;
  let bestResult = defaultResult;

  for (const option of matches) {
    let score = 0;
    for (const keyword of option.keywords) {
      // Exact match
      if (normalized.includes(keyword)) {
        score += option.weight * 2;
      }
      // Partial match (palavra contém keyword ou vice-versa)
      else if (Array.from(words).some(w => w.includes(keyword) || keyword.includes(w))) {
        score += option.weight;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestResult = option.result;
    }
  }

  return bestResult;
}

function inferPersonaFromTicket(text: string): string {
  return findBestMatch(
    text,
    [
      { keywords: ['paciente', 'health', 'medic', 'cancer', 'cid'], weight: 3, result: 'paciente' },
      { keywords: ['cliente', 'customer', 'consumer', 'comprador'], weight: 3, result: 'cliente' },
      { keywords: ['equipe', 'time', 'equip', 'colega', 'membro'], weight: 2, result: 'membro da equipe' },
      { keywords: ['gestor', 'coordenador', 'gerente', 'manager', 'responsavel'], weight: 2, result: 'gestor' },
    ],
    'usuário interno',
  );
}

function inferActionFromTicket(text: string): string {
  return findBestMatch(
    text,
    [
      { keywords: ['pesquisa', 'survey', 'research', 'dados'], weight: 3, result: 'responder uma pesquisa estruturada' },
      { keywords: ['formulario', 'questionario', 'form', 'formulário'], weight: 3, result: 'preencher um formulário' },
      { keywords: ['relatorio', 'report', 'dashboard', 'indicador', 'metrica'], weight: 2, result: 'acompanhar indicadores e resultados' },
      { keywords: ['atualizar', 'corrigir', 'fix', 'update', 'modificar'], weight: 2, result: 'atualizar informações cadastrais' },
    ],
    'executar o fluxo solicitado no chamado',
  );
}

function inferBenefitFromTicket(text: string): string {
  return findBestMatch(
    text,
    [
      { keywords: ['contato', 'comunicacao', 'comunicação', 'entrar em contato', 'outreach'], weight: 3, result: 'permitir contato direcionado com quem demonstrar interesse' },
      { keywords: ['acompanhamento', 'follow', 'tracking', 'seguimento'], weight: 2, result: 'melhorar o acompanhamento dos casos' },
      { keywords: ['grupo', 'comunidade', 'rede', 'engajamento', 'adesao', 'adesão'], weight: 2, result: 'aumentar adesão e suporte ao público alvo' },
      { keywords: ['eficiencia', 'eficacia', 'performance', 'velocidade'], weight: 2, result: 'otimizar tempo e recursos do processo' },
    ],
    'gerar resultado mensurável para o processo de negócio',
  );
}

function inferGutFromText(text: string): {
  gravity: number;
  urgency: number;
  tendency: number;
  rationale: string;
} {
  const normalized = normalizeTextForMatch(text);

  // Gravity: risco de impacto à saúde/financeiro
  let gravity = 3;
  const gravityScores: Record<number, number> = { 3: 0, 4: 0, 5: 0 };
  
  if (normalized.match(/(paciente|cid|cancer|mama|saude|saúde|critico)/gi)) gravityScores[5] += 3;
  if (normalized.match(/(cliente|financeiro|sistema critico|sistema crítico|down|indisponivel|indisponível)/gi)) gravityScores[4] += 2;
  if (normalized.match(/(melhor|melhoria|feature|novo)/gi)) gravityScores[3] += 1;

  gravity = Number(Object.entries(gravityScores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 3);

  // Urgency: prazo e importância temporal
  let urgency = 3;
  const urgencyScores: Record<number, number> = { 3: 0, 4: 0, 5: 0 };
  
  if (normalized.match(/(urgente|imediat|hoje|agora|critico|critica|critico|crítico|crítica|pls|please|asap)/gi)) urgencyScores[5] += 3;
  if (normalized.match(/(em breve|proxim|próxim|esta semana|está semana|envi|necessario|necessário|deve|envio)/gi)) urgencyScores[4] += 2;
  if (normalized.match(/(quando possivel|quando possível|backlog)/gi)) urgencyScores[3] += 1;

  urgency = Number(Object.entries(urgencyScores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 3);

  // Tendency: risco de não fazer vs fazer
  let tendency = 3;
  const tendencyScores: Record<number, number> = { 3: 0, 4: 0, 5: 0 };
  
  if (normalized.match(/(risco|perda|falha|nao fazer|não fazer|sem contato|impacto negativo|prejuizo|prejuízo)/gi)) tendencyScores[4] += 3;
  if (normalized.match(/(nao conseguir|não conseguir|impossivel|impossível|bloqueado|bloqueada)/gi)) tendencyScores[5] += 2;
  if (normalized.match(/(opcional|depois|em breve)/gi)) tendencyScores[3] += 1;

  // Se nenhuma tendência foi detectada, manter default
  const tendencyMax = Math.max(...Object.values(tendencyScores));
  if (tendencyMax > 0) {
    tendency = Number(Object.entries(tendencyScores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 3);
  }

  const rationale = `G=${gravity}, U=${urgency}, T=${tendency} inferido por análise contextual de palavras-chave de impacto, prazo e risco no chamado.`;
  return { gravity, urgency, tendency, rationale };
}

function gutToActivityPriority(gravity: number, urgency: number, tendency: number): string {
  const score = gravity * urgency * tendency;
  if (score >= 80) return 'urgente';
  if (score >= 50) return 'alta';
  if (score >= 24) return 'media';
  return 'baixa';
}

function inferMainTitleFromTicket(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const first = lines[0] ?? 'Implementar demanda do chamado';
  return first.length > 120 ? `${first.slice(0, 117)}...` : first;
}

function extractStoryParts(text?: string | null): { persona: string; action: string; benefit: string } | null {
  if (!text) return null;

  const trimmed = text.trim();
  if (!trimmed) return null;

  const narrativeRegex = /como\s+(.+?),\s*quero\s+(.+?),\s*para\s+(.+?)(?:\.|$)/i;
  const match = trimmed.match(narrativeRegex);

  if (!match) return null;

  const [, persona, action, benefit] = match;
  return {
    persona: persona.trim(),
    action: action.trim(),
    benefit: benefit.trim(),
  };
}

function buildGlpiTaskSuggestions(text: string): GlpiTaskSuggestion[] {
  const normalized = normalizeTextForMatch(text);

  const tasks: GlpiTaskSuggestion[] = [];

  tasks.push({
    title: 'Mapear requisitos e critérios do chamado',
    description: 'Consolidar regras de negócio e critérios de elegibilidade descritos no chamado.',
    subtasks: [
      'Ler o chamado completo e extrair requisitos explícitos',
      'Validar critérios com o solicitante',
      'Registrar escopo e premissas na descrição da história',
    ],
    estimated_hours: 2,
    status: 'pending',
  });

  if (normalized.includes('pesquisa') || normalized.includes('questionario')) {
    tasks.push({
      title: 'Estruturar pesquisa/questionário',
      description: 'Definir perguntas, campos obrigatórios e formato de resposta.',
      subtasks: [
        'Definir perguntas objetivas e campos de identificação',
        'Revisar linguagem e clareza do questionário',
        'Aprovar versão final para envio',
      ],
      estimated_hours: 4,
      status: 'pending',
    });
  }

  tasks.push({
    title: 'Implementar identificação do público alvo',
    description: 'Garantir seleção correta dos registros elegíveis para a ação.',
    subtasks: [
      'Aplicar filtros de negócio no dataset',
      'Validar amostra de registros antes do disparo',
      'Registrar evidência dos filtros aplicados',
    ],
    estimated_hours: 5,
    status: 'pending',
  });

  if (normalized.includes('whatsapp') || normalized.includes('enviar')) {
    tasks.push({
      title: 'Executar disparo de comunicação',
      description: 'Enviar a pesquisa para o público elegível e controlar retorno.',
      subtasks: [
        'Preparar mensagem padrão de envio',
        'Executar disparo no canal definido',
        'Registrar data/hora e volume enviado',
      ],
      estimated_hours: 3,
      status: 'pending',
    });
  }

  tasks.push({
    title: 'Consolidar respostas e planejar follow-up',
    description: 'Identificar interessados e preparar próxima ação de contato.',
    subtasks: [
      'Consolidar respostas recebidas',
      'Separar lista de interessados',
      'Definir plano de contato e responsáveis',
    ],
    estimated_hours: 3,
    status: 'pending',
  });

  return tasks.slice(0, 8);
}

function getSystemDateReference() {
  const now = new Date();
  const dateStr = format(now, 'yyyy-MM-dd');
  const dayOfWeek = format(now, 'EEEE', { locale: ptBR });
  return {
    today: dateStr,
    dayOfWeek: dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1),
  };
}

function buildSystemPrompt(userName: string) { return `Você é um assistente de gerenciamento de projetos integrado ao Insight Finder Pal.
O usuário logado atualmente é: ${userName}
Você tem acesso direto ao banco de dados da aplicação e pode criar, consultar e atualizar projetos e tarefas em nome do usuário.

REGRA CRÍTICA — formatted_response:
Quando uma ferramenta retornar um campo "formatted_response", você DEVE copiar esse texto EXATAMENTE como sua resposta, sem adicionar, remover ou alterar nada. Não adicione introduções, explicações ou conclusões.

Referência de datas do sistema:
- Use a ferramenta getSystemDateReference SEMPRE que o usuário mencionar datas relativas ("amanhã", "próxima segunda", "próxima semana", etc.)
- Com a data de referência (hoje), você consegue calcular corretamente as datas no formato YYYY-MM-DD exigido pelos campos start_date e end_date
- Exemplo: Se hoje for 2026-05-07 (quarta-feira) e o usuário disser "criar tarefa para amanhã", você saberá que amanhã é 2026-05-08 (quinta-feira)

Diretrizes gerais:
- Responda sempre em português (PT-BR)
- Quando o usuário pedir para criar ou atualizar algo, use as ferramentas disponíveis — nunca simule
- Antes de qualquer ação que altere dados (criar, atualizar, mover, vincular ou backfill), apresente um resumo curto do que será feito e peça confirmação explícita
- Só execute a ferramenta mutável depois de uma confirmação clara do usuário como "sim", "confirmar", "pode criar", "pode atualizar", "pode mover" ou equivalente
- Se ainda não houver confirmação explícita, permaneça em modo de planejamento e refinamento; não grave nada
- Depois de executar, confirme o que foi criado/atualizado citando o nome e o ID retornado pela ferramenta
- Se o usuário enviar um chamado GLPI (texto livre), chame analyzeGlpiTicket IMEDIATAMENTE e use a sugestão para preencher o máximo de dados
- Após validar projeto/coluna, para criar tarefa principal+subtarefas de chamado GLPI e vincular a história na aba da tarefa, use createGlpiWorkPackage
- Para vincular histórias em tarefas GLPI antigas (sem história na aba), use backfillGlpiTaskStories
- Para criar uma atividade: chame listProjects IMEDIATAMENTE — a ferramenta retornará um formatted_response, copie-o exatamente
- Após o usuário escolher o projeto: chame listWorkflowStages IMEDIATAMENTE — a ferramenta retornará um formatted_response, copie-o exatamente
- Quando precisar atribuir um usuário (responsável de tarefa/projeto): chame listUsers IMEDIATAMENTE — a ferramenta retornará um formatted_response, copie-o exatamente
- Para buscar tarefas por texto no projeto, use searchActivities
- Para inspecionar os detalhes completos de uma tarefa específica, use getActivityDetails
- Para alterar dados de uma tarefa existente, use updateActivity
- Para mover uma tarefa entre colunas, use moveActivityToStage
- Só após ter projeto E coluna escolhidos, colete as demais informações (título, prioridade, etc.)
- Status válidos para projetos: ideacao, poc, mvp, em-execucao, blocked, drawer (padrão: ideacao)
- Seja conciso mas informativo
- Sempre que possível, feche sua resposta com a próxima ação clara para o usuário escolher

Perguntas de esclarecimento — regras obrigatórias:
- NUNCA liste todas as perguntas de uma vez. Faça EXATAMENTE UMA pergunta, aguarde a resposta e só então faça a próxima
- NUNCA use bullet points ou listas numeradas para coletar informações
- Em chamado GLPI, preencha automaticamente: user story (persona/ação/benefício), tarefas, subtarefas, horas e GUT usando analyzeGlpiTicket/suggestGutPriority
- Em chamado GLPI, crie UMA tarefa principal por chamado; os subchamados/itens derivados devem virar subtarefas dessa tarefa
- Em chamado GLPI, preencha automaticamente: user story (persona/ação/benefício), tarefas, subtarefas, horas e GUT usando analyzeGlpiTicket/suggestGutPriority
- Em chamado GLPI, só pergunte o que faltar para execução (ex.: projeto, coluna e confirmação final)
- Fluxo obrigatório para criar tarefa: (1) projeto → (2) coluna/stage → (3) título → (4) responsável → (5) prioridade → (6) prazo (opcional) → executar
- Ao perguntar o responsável, ofereça sempre o usuário logado como primeira opção clicável: [${userName}] | [Outro]
- Se o usuário escolher "Outro", chame listUsers IMEDIATAMENTE e copie o formatted_response exatamente
- Fluxo obrigatório para criar projeto: (1) nome → (2) objetivo/descrição → (3) prioridade → (4) prazo (opcional) → executar
- Quando o pedido envolver "projeto de aplicativo", "projeto de sistema" ou "projeto de software", NUNCA use createProject direto
- Para esses casos, use createProjectWithTasks e siga o fluxo: (1) nome → (2) objetivo/descrição → (3) prioridade → (4) prazo (opcional) → (5) tarefas principais com subtarefas → (6) confirmação final
- Se o usuário não informar tarefas/subtarefas, proponha uma estrutura inicial e peça confirmação antes de executar
- Se o usuário confirmar criação sem detalhar tarefas/subtarefas, use o template padrao automaticamente em createProjectWithTasks
- Campos opcionais: pergunte "Tem data de entrega? Se não, pode pular." — se o usuário disser "não" ou "pular", siga sem esse campo
- Se o usuário fornecer detalhes suficientes desde o início, ainda assim faça um resumo final curto e peça confirmação antes de executar

Fluxo GLPI — createGlpiWorkPackage (REGRA OBRIGATÓRIA):
- Quando o usuário disser "Sim, criar estrutura" (ou similar) APÓS uma análise GLPI, você DEVE usar os valores JÁ CALCULADOS de persona, action, benefit, gravity, urgency, tendency
- NÃO PERGUNTE novamente esses valores — pegue-os da resposta anterior do analyzeGlpiTicket
- Passe os valores de gravity, urgency, tendency EXPLICITAMENTE para createGlpiWorkPackage (não deixe como opcional/padrão)

Formatação de opções clicáveis:
- Sempre que oferecer opções fixas de escolha, coloque-as em uma linha separada no formato: [Opção 1] | [Opção 2] | [Opção 3]
- Use rótulos em português, nunca em inglês (ex: [Alta] [Média] [Baixa] em vez de high/medium/low)
- Quando estiver aguardando confirmação para ação mutável, termine com opções clicáveis como: [Confirmar] | [Ajustar] | [Cancelar]
- Exemplos corretos:
  Qual a prioridade?
  [Alta] | [Média] | [Baixa]

  Qual o status inicial?
  [Ideação] | [POC] | [MVP] | [Em Execução]
- Use esse formato APENAS para opções de escolha predefinidas, nunca para campos de texto livre`; }

async function requireAuth(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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

  return { user };
}

export async function POST(req: Request) {
  try {
  console.log('[agent] POST recebido');
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'OPENROUTER_API_KEY ausente no servidor' }, { status: 500 });
  }

  const auth = await requireAuth(req);
  if ('error' in auth) return auth.error;
  const { user } = auth;

  const { messages } = (await req.json()) as { messages: UIMessage[] };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: profile } = await adminClient
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .maybeSingle();

  const userName = profile?.full_name ?? user.email ?? 'Usuário';
  const userEmail = profile?.email ?? user.email ?? '';

  const openrouter = createOpenRouter({ apiKey });
  const modelId = process.env.OPENROUTER_MODEL ?? 'openai/gpt-4.1';
  const maxSteps = getEnvNumber('OPENROUTER_MAX_STEPS', 11);

  let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>> = [];
  try {
    modelMessages = await convertToModelMessages(messages);
  } catch (e) {
    console.error('[agent] convertToModelMessages falhou, reiniciando conversa:', e);
    modelMessages = [];
  }

  const result = streamText({
    model: openrouter.chat(modelId),
    system: buildSystemPrompt(userName),
    messages: modelMessages,
    stopWhen: stepCountIs(maxSteps),
    tools: {
      getSystemDateReference: tool({
        description: 'Retorna a data de referência do sistema (data de hoje) com o dia da semana em português (PT-BR). Use esta ferramenta para saber em qual dia as tarefas serão criadas/planejadas.',
        inputSchema: z.object({}),
        execute: async () => {
          const ref = getSystemDateReference();
          return {
            today: ref.today,
            dayOfWeek: ref.dayOfWeek,
            formatted: `📅 Data de referência: ${ref.today} (${ref.dayOfWeek})`,
          };
        },
      }),

      listProjects: tool({
        description: 'Lista os projetos visíveis para o usuário. Retorna um campo formatted_response com os projetos formatados como opções clicáveis — copie-o exatamente como resposta.',
        inputSchema: z.object({}),
        execute: async () => {
          const candidates = buildUserCandidates([
            profile?.full_name,
            profile?.email,
            user.email,
          ]);

          const [membersRes, projectsRes, activitiesRes] = await Promise.all([
            adminClient
              .from('project_members')
              .select('project_id')
              .eq('user_id', user.id),
            adminClient
              .from('projects')
              .select('id, title, status, priority, description, due_date, created_by, owner, manager, assignees')
              .eq('is_trashed', false),
            candidates.length > 0
              ? adminClient
                  .from('activities')
                  .select('project_id, assigned_to, participants')
                  .eq('is_trashed', false)
              : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
          ]);

          if (projectsRes.error) return { error: `Erro ao buscar projetos: ${projectsRes.error.message}` };

          const visibleIds = new Set<string>();
          (membersRes.data ?? []).forEach((m) => visibleIds.add(m.project_id));

          (activitiesRes.data ?? []).forEach((a: VisibleActivityRow) => {
            if (
              matchesIdentity(a.assigned_to, candidates) ||
              (Array.isArray(a.participants) && anyMatchesIdentity(a.participants, candidates))
            ) {
              if (typeof a.project_id === 'string') visibleIds.add(a.project_id);
            }
          });

          const allProjects: VisibleProjectRow[] = projectsRes.data ?? [];
          allProjects.forEach((p) => {
            if (
              p.created_by === user.id ||
              matchesIdentity(p.owner, candidates) ||
              matchesIdentity(p.manager, candidates) ||
              (Array.isArray(p.assignees) && anyMatchesIdentity(p.assignees, candidates))
            ) {
              visibleIds.add(p.id);
            }
          });

          const projects = allProjects
            .filter((p) => visibleIds.has(p.id))
            .map(({ created_by, owner, manager, assignees, ...rest }) => rest);

          if (projects.length === 0) {
            return {
              projects: [],
              formatted_response: 'Você ainda não tem projetos disponíveis. Deseja criar um novo projeto?',
            };
          }

          const options = projects.map((p) => `[${p.title}]`).join(' | ');
          return {
            projects,
            formatted_response: `Em qual projeto você deseja trabalhar?\n${options}`,
          };
        },
      }),

      createProject: tool({
        description: 'Cria somente o projeto (sem tarefas e sem subtarefas) e adiciona o usuário como membro. Use apenas quando o usuário pedir explicitamente para criar apenas o card do projeto.',
        inputSchema: z.object({
          title: z.string().describe('Título do projeto'),
          description: z.string().optional().describe('Descrição do projeto'),
          status: z.string().optional().describe('Status: ideacao, poc, mvp, em-execucao, blocked, drawer ou equivalente em português'),
          priority: z.string().optional().describe('Prioridade: high/alta, medium/média, low/baixa'),
          due_date: z.string().optional().describe('Data de entrega no formato YYYY-MM-DD'),
        }),
        execute: async ({ title, description, status, priority, due_date }) => {
          const { data: project, error } = await adminClient
            .from('projects')
            .insert({
              title,
              description: description ?? null,
              priority: normalizeProjectPriority(priority),
              status: normalizeStatus(status),
              due_date: due_date ?? null,
              created_by: user.id,
              owner: userName,
            })
            .select('id, title, status, priority')
            .single();

          if (error) return { error: error.message };

          const { error: memberError } = await adminClient.from('project_members').insert({
            project_id: project.id,
            user_id: user.id,
            can_create: true,
            can_edit: true,
            can_delete: true,
            can_move: true,
          });

          if (memberError) {
            return { project, warning: `Projeto criado mas falha ao adicionar membro: ${memberError.message}` };
          }

          return { project };
        },
      }),

      createProjectWithTasks: tool({
        description: 'Cria projeto completo com tarefas e subtarefas iniciais. Use este fluxo para pedidos de projeto de aplicativo/sistema/software.',
        inputSchema: z.object({
          title: z.string().describe('Título do projeto'),
          description: z.string().describe('Objetivo ou descrição principal do projeto'),
          status: z.string().optional().describe('Status: ideacao, poc, mvp, em-execucao, blocked, drawer ou equivalente em português'),
          priority: z.string().optional().describe('Prioridade: high/alta, medium/média, low/baixa'),
          due_date: z.string().optional().describe('Data de entrega no formato YYYY-MM-DD'),
          workflow_stage_name: z.string().optional().describe('Nome da coluna para criar as tarefas (padrão: Backlog ou primeira visível)'),
          assigned_to: z.string().optional().describe('Responsável pelas tarefas e subtarefas (padrão: usuário logado)'),
          tasks: z.array(
            z.object({
              title: z.string().describe('Título da tarefa principal'),
              description: z.string().optional().describe('Descrição da tarefa principal'),
              priority: z.string().optional().describe('Prioridade da tarefa (alta/média/baixa)'),
              start_date: z.string().optional().describe('Data de início YYYY-MM-DD'),
              end_date: z.string().optional().describe('Data de entrega YYYY-MM-DD'),
              estimated_hours: z.number().optional().describe('Horas estimadas da tarefa principal'),
              subtasks: z.array(
                z.object({
                  title: z.string().describe('Título da subtarefa'),
                  description: z.string().optional().describe('Descrição da subtarefa'),
                  priority: z.string().optional().describe('Prioridade da subtarefa (alta/média/baixa)'),
                  start_date: z.string().optional().describe('Data de início YYYY-MM-DD'),
                  end_date: z.string().optional().describe('Data de entrega YYYY-MM-DD'),
                  estimated_hours: z.number().optional().describe('Horas estimadas da subtarefa'),
                }),
              ).optional().describe('Subtarefas da tarefa principal'),
            }),
          ).min(1).max(60).optional().describe('Lista de tarefas principais com subtarefas. Se omitido, sera usado um template padrao de projeto de aplicativo.'),
        }),
        execute: async ({ title, description, status, priority, due_date, workflow_stage_name, assigned_to, tasks }) => {
          const planTasks = tasks && tasks.length > 0 ? tasks : buildDefaultAppProjectTasks();
          const { data: project, error } = await adminClient
            .from('projects')
            .insert({
              title,
              description,
              priority: normalizeProjectPriority(priority),
              status: normalizeStatus(status),
              due_date: due_date ?? null,
              created_by: user.id,
              owner: userName,
            })
            .select('id, title, status, priority')
            .single();

          if (error || !project) {
            return { error: error?.message ?? 'Falha ao criar projeto' };
          }

          const warnings: string[] = [];

          const { error: memberError } = await adminClient.from('project_members').insert({
            project_id: project.id,
            user_id: user.id,
            can_create: true,
            can_edit: true,
            can_delete: true,
            can_move: true,
          });

          if (memberError) {
            warnings.push(`Projeto criado, mas houve falha ao adicionar membro: ${memberError.message}`);
          }

          const { data: currentStages, error: stagesError } = await adminClient
            .from('workflow_stages')
            .select('id, title, display_order, is_visible')
            .eq('project_id', project.id)
            .order('display_order', { ascending: true });

          if (stagesError) {
            warnings.push(`Não foi possível carregar colunas do projeto: ${stagesError.message}`);
          }

          let visibleStages = (currentStages ?? []).filter((stage) => isVisibleKanbanStage(stage));

          if (visibleStages.length === 0) {
            const { data: createdStage, error: createStageError } = await adminClient
              .from('workflow_stages')
              .insert({
                project_id: project.id,
                title: 'Backlog',
                display_order: 1,
                is_visible: true,
                color: '#3b82f6',
              })
              .select('id, title, display_order, is_visible')
              .single();

            if (createStageError) {
              return {
                project,
                error: `Projeto criado, mas não foi possível preparar coluna de tarefas: ${createStageError.message}`,
                warnings,
              };
            }

            if (createdStage) {
              visibleStages = [createdStage];
            }
          }

          let selectedStage = visibleStages.find((s) => stageNameMatchesInput(s.title, workflow_stage_name ?? ''));
          if (!selectedStage) {
            selectedStage =
              visibleStages.find((s) => normalizeStageName(s.title).includes('backlog')) ??
              visibleStages[0] ??
              null;
          }

          if (!selectedStage) {
            return {
              project,
              error: 'Projeto criado, mas nenhuma coluna visível foi encontrada para inserir tarefas.',
              warnings,
            };
          }

          const createdTasks: Array<{ id: string; title: string }> = [];
          const createdSubtasks: Array<{ id: string; title: string; parent_id: string | null }> = [];
          let failedItemsCount = 0;

          for (const task of planTasks) {
            const taskPriority = normalizeActivityPriority(task.priority ?? projectPriorityToActivityPriority(priority));

            const { data: createdTask, error: taskError } = await adminClient
              .from('activities')
              .insert({
                project_id: project.id,
                title: task.title,
                description: task.description ?? null,
                assigned_to: assigned_to ?? userName,
                priority: taskPriority,
                status: 'pending',
                item_type: 'tarefa',
                workflow_stage_id: selectedStage.id,
                start_date: task.start_date ?? null,
                end_date: task.end_date ?? null,
                hours: task.estimated_hours ?? null,
                created_by: user.id,
                created_by_email: userEmail,
              })
              .select('id, title')
              .single();

            if (taskError || !createdTask) {
              failedItemsCount += 1;
              warnings.push(`Falha ao criar tarefa "${task.title}": ${taskError?.message ?? 'erro desconhecido'}`);
              continue;
            }

            createdTasks.push({ id: createdTask.id, title: createdTask.title });

            for (const subtask of task.subtasks ?? []) {
              const subtaskPriority = normalizeActivityPriority(subtask.priority ?? task.priority ?? projectPriorityToActivityPriority(priority));

              const { data: createdSubtask, error: subtaskError } = await adminClient
                .from('activities')
                .insert({
                  project_id: project.id,
                  parent_id: createdTask.id,
                  title: subtask.title,
                  description: subtask.description ?? null,
                  assigned_to: assigned_to ?? userName,
                  priority: subtaskPriority,
                  status: 'pending',
                  item_type: 'subtarefa',
                  workflow_stage_id: selectedStage.id,
                  start_date: subtask.start_date ?? null,
                  end_date: subtask.end_date ?? null,
                  hours: subtask.estimated_hours ?? null,
                  created_by: user.id,
                  created_by_email: userEmail,
                })
                .select('id, title, parent_id')
                .single();

              if (subtaskError || !createdSubtask) {
                failedItemsCount += 1;
                warnings.push(`Falha ao criar subtarefa "${subtask.title}": ${subtaskError?.message ?? 'erro desconhecido'}`);
                continue;
              }

              createdSubtasks.push({
                id: createdSubtask.id,
                title: createdSubtask.title,
                parent_id: createdSubtask.parent_id,
              });
            }
          }

          const formattedResponse =
            `✅ Projeto criado com estrutura inicial\n\n` +
            `Projeto: ${project.title} (ID: ${project.id})\n` +
            `Coluna usada: ${selectedStage.title}\n` +
            `Origem do plano: ${tasks && tasks.length > 0 ? 'definido pelo usuario' : 'template padrao de aplicativo'}\n` +
            `Tarefas criadas: ${createdTasks.length}\n` +
            `Subtarefas criadas: ${createdSubtasks.length}` +
            `${failedItemsCount > 0 ? `\nItens com falha: ${failedItemsCount}` : ''}` +
            `${warnings.length > 0 ? `\n\nAvisos:\n${warnings.map((w) => `- ${w}`).join('\n')}` : ''}`;

          return {
            project,
            stage: { id: selectedStage.id, title: selectedStage.title },
            created_tasks_count: createdTasks.length,
            created_subtasks_count: createdSubtasks.length,
            failed_items_count: failedItemsCount,
            created_tasks: createdTasks,
            created_subtasks: createdSubtasks,
            warnings,
            formatted_response: formattedResponse,
          };
        },
      }),

      listActivities: tool({
        description: 'Lista as atividades/tarefas de um projeto específico.',
        inputSchema: z.object({
          project_id: z.string().describe('ID do projeto'),
        }),
        execute: async ({ project_id }) => {
          const candidates = buildUserCandidates([profile?.full_name, profile?.email, user.email]);

          const [memberRow, projectRow] = await Promise.all([
            adminClient.from('project_members').select('project_id').eq('project_id', project_id).eq('user_id', user.id).maybeSingle(),
            adminClient.from('projects').select('created_by, owner, manager, assignees').eq('id', project_id).maybeSingle(),
          ]);

          const p = projectRow.data;
          const hasAccess =
            !!memberRow.data ||
            p?.created_by === user.id ||
            matchesIdentity(p?.owner, candidates) ||
            matchesIdentity(p?.manager, candidates) ||
            (Array.isArray(p?.assignees) && anyMatchesIdentity(p.assignees, candidates));

          if (!hasAccess) {
            return { error: 'Sem acesso a este projeto' };
          }

          const { data: activities, error } = await adminClient
            .from('activities')
            .select('id, title, status, priority, item_type, assigned_to, start_date, end_date, progress_flag')
            .eq('project_id', project_id)
            .eq('is_trashed', false)
            .order('created_at', { ascending: true })
            .limit(100);

          if (error) return { error: error.message };
          return { activities: activities ?? [] };
        },
      }),

      listWorkflowStages: tool({
        description: 'Lista as colunas (estágios) do projeto. Retorna um campo formatted_response com as colunas formatadas como opções clicáveis — copie-o exatamente como resposta.',
        inputSchema: z.object({
          project_id: z.string().describe('ID do projeto'),
        }),
        execute: async ({ project_id }) => {
          const { data: stages, error } = await adminClient
            .from('workflow_stages')
            .select('id, title, display_order, is_visible')
            .eq('project_id', project_id)
            .order('display_order', { ascending: true });

          if (error) return { error: error.message };
          const visibleStages = (stages ?? []).filter((stage) => isVisibleKanbanStage(stage));
          if (visibleStages.length === 0) {
            return { stages: [], formatted_response: 'Este projeto não tem colunas configuradas ainda. Por favor, configure as colunas na página do projeto.' };
          }
          const options = visibleStages.map((s) => `[${s.title}]`).join(' | ');
          return {
            stages: visibleStages,
            formatted_response: `Em qual coluna deseja criar a tarefa?\n${options}`,
          };
        },
      }),

      listUsers: tool({
        description: 'Lista os usuários ativos da aplicação. Use essa ferramenta quando o usuário (ou o agente) precisar atribuir uma tarefa ou projeto a alguém. Retorna usuários com nome, email, setor e cargo. Retorna um campo formatted_response com os usuários formatados como opções clicáveis — copie-o exatamente como resposta.',
        inputSchema: z.object({
          search: z.string().optional().describe('Termo de busca opcional para filtrar usuários por nome ou email'),
        }),
        execute: async ({ search }) => {
          let query = adminClient
            .from('profiles')
            .select('id, full_name, email, role_title, sector, is_active')
            .eq('is_active', true)
            .order('full_name', { ascending: true });

          if (search?.trim()) {
            const q = search.toLowerCase().trim();
            query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
          }

          const { data: users, error } = await query.limit(20);

          if (error) return { error: `Erro ao buscar usuários: ${error.message}` };

          if (!users || users.length === 0) {
            return {
              users: [],
              formatted_response: search
                ? `Nenhum usuário encontrado com "${search}". Tente um novo termo de busca.`
                : 'Nenhum usuário disponível no sistema.',
            };
          }

          const options = users.map((u) => `[${u.full_name || u.email}]`).join(' | ');
          return {
            users,
            formatted_response: `Qual usuário deseja atribuir?\n${options}`,
          };
        },
      }),

      analyzeGlpiTicket: tool({
        description: 'Analisa o texto de um chamado GLPI e sugere automaticamente história do usuário (persona/ação/benefício), tarefas, subtarefas, horas estimadas e GUT. Use sempre que o usuário colar um chamado GLPI.',
        inputSchema: z.object({
          ticket_text: z.string().describe('Texto completo do chamado GLPI'),
          ticket_title: z.string().optional().describe('Título opcional do chamado'),
        }),
        execute: async ({ ticket_text, ticket_title }) => {
          const sourceText = `${ticket_title ?? ''}\n${ticket_text}`.trim();
          const mainTitle = ticket_title?.trim() || inferMainTitleFromTicket(sourceText);
          const persona = inferPersonaFromTicket(sourceText);
          const action = inferActionFromTicket(sourceText);
          const benefit = inferBenefitFromTicket(sourceText);
          const gut = inferGutFromText(sourceText);
          const tasks = buildGlpiTaskSuggestions(sourceText);
          const totalHours = tasks.reduce((sum, t) => sum + t.estimated_hours, 0);
          const activityPriority = gutToActivityPriority(gut.gravity, gut.urgency, gut.tendency);

          const formattedTasks = tasks
            .map((t) => `• ${t.title} (${t.estimated_hours}h)`)
            .join('\n');

          const formattedResponse =
            `✅ **Analisei o chamado e montei uma proposta inicial.**\n\n` +
              `📖 **História do Usuário**\n` +
              `**Persona:** ${persona}\n` +
              `**Ação:** ${action}\n` +
              `**Benefício:** ${benefit}\n\n` +
              `🎯 **Prioridade GUT**\n` +
              `Gravidade: ${gut.gravity} | Urgência: ${gut.urgency} | Tendência: ${gut.tendency} → **Score: ${gut.gravity * gut.urgency * gut.tendency}**\n\n` +
              `✓ **Atividades propostas:**\n${formattedTasks}\n\n` +
              `⏱️ **Estimativa total:** ${totalHours}h\n\n` +
              `💬 Deseja que eu crie essa estrutura agora?\n[Sim, criar estrutura] | [Quero ajustar antes]`;

          return {
            title: mainTitle,
            user_story: { persona, action, benefit },
            gut,
            suggested_priority: activityPriority,
            estimated_total_hours: totalHours,
            tasks,
            missing_for_execution: ['project_id', 'workflow_stage_name'],
            formatted_response: formattedResponse,
          };
        },
      }),

      suggestGutPriority: tool({
        description: 'Sugere prioridade GUT (gravidade, urgência, tendência) para uma demanda com base no contexto informado.',
        inputSchema: z.object({
          context: z.string().describe('Contexto da demanda para cálculo de GUT'),
        }),
        execute: async ({ context }) => {
          const gut = inferGutFromText(context);
          return {
            ...gut,
            score: gut.gravity * gut.urgency * gut.tendency,
            priority: gutToActivityPriority(gut.gravity, gut.urgency, gut.tendency),
          };
        },
      }),

      createGlpiWorkPackage: tool({
        description: 'Cria um pacote completo de execução para chamado GLPI: UMA tarefa principal com subtarefas e história do usuário vinculada na aba Histórias da tarefa, incluindo GUT e horas estimadas.',
        inputSchema: z.object({
          project_id: z.string().describe('ID do projeto onde a estrutura será criada'),
          workflow_stage_name: z.string().describe('Nome exato da coluna/estágio para criação dos itens'),
          title: z.string().describe('Título principal da história'),
          original_ticket_text: z.string().describe('Texto original do chamado GLPI'),
          persona: z.string().describe('Persona da história do usuário'),
          action: z.string().describe('Ação da história do usuário'),
          benefit: z.string().describe('Benefício da história do usuário'),
          gravity: z.number().int().min(1).max(5).optional().describe('G do GUT'),
          urgency: z.number().int().min(1).max(5).optional().describe('U do GUT'),
          tendency: z.number().int().min(1).max(5).optional().describe('T do GUT'),
          assigned_to: z.string().optional().describe('Responsável principal pelos itens'),
          tasks: z.array(
            z.object({
              title: z.string(),
              description: z.string().optional(),
              estimated_hours: z.number().optional(),
              status: z.string().optional(),
              subtasks: z.array(z.string()).optional(),
            }),
          ).min(1).max(12),
        }),
        execute: async ({
          project_id,
          workflow_stage_name,
          title,
          original_ticket_text,
          persona,
          action,
          benefit,
          gravity,
          urgency,
          tendency,
          assigned_to,
          tasks,
        }) => {
          const candidates = buildUserCandidates([profile?.full_name, profile?.email, user.email]);

          const [memberRow, projectRow] = await Promise.all([
            adminClient
              .from('project_members')
              .select('project_id')
              .eq('project_id', project_id)
              .eq('user_id', user.id)
              .maybeSingle(),
            adminClient
              .from('projects')
              .select('created_by, owner, manager, assignees')
              .eq('id', project_id)
              .maybeSingle(),
          ]);

          const p = projectRow.data;
          const hasAccess =
            !!memberRow.data ||
            p?.created_by === user.id ||
            matchesIdentity(p?.owner, candidates) ||
            matchesIdentity(p?.manager, candidates) ||
            (Array.isArray(p?.assignees) && anyMatchesIdentity(p.assignees, candidates));

          if (!hasAccess) return { error: 'Sem acesso a este projeto' };

          const { data: stages } = await adminClient
            .from('workflow_stages')
            .select('id, title, display_order, is_visible')
            .eq('project_id', project_id)
            .order('display_order', { ascending: true });

          const visibleStages = (stages ?? []).filter((s) => isVisibleKanbanStage(s));
          const stage = visibleStages.find((s) => stageNameMatchesInput(s.title, workflow_stage_name));

          if (!stage) {
            const available = visibleStages.map((s) => s.title).join(', ');
            return { error: `Coluna "${workflow_stage_name}" não encontrada. Colunas disponíveis: ${available}` };
          }

          const g = gravity ?? 3;
          const u = urgency ?? 3;
          const t = tendency ?? 3;
          const priority = gutToActivityPriority(g, u, t);

          const userStoryText = `Como ${persona}, quero ${action}, para ${benefit}.`;

          const totalHours = tasks.reduce((sum, task) => sum + (task.estimated_hours ?? 0), 0);

          const mainTaskTitle = `Executar chamado: ${title}`.slice(0, 180);
          const mainTaskDescription =
            `Tarefa principal gerada a partir do chamado GLPI.\n\n` +
            `Chamado GLPI:\n${original_ticket_text}\n\n` +
            `História do usuário:\n${userStoryText}\n\n` +
            `GUT: G${g} U${u} T${t}\n\n` +
            `Use as subtarefas para detalhar a execução.`;

          const { data: mainTask, error: mainTaskError } = await adminClient
            .from('activities')
            .insert({
              project_id,
              title: mainTaskTitle,
              assigned_to: assigned_to ?? userName,
              description: mainTaskDescription,
              priority,
              status: 'pending',
              item_type: 'tarefa',
              workflow_stage_id: stage.id,
              created_by: user.id,
              created_by_email: userEmail,
              hours: totalHours,
              gravity: g,
              urgency: u,
              tendency: t,
            })
            .select('id, title, status')
            .single();

          if (mainTaskError || !mainTask) {
            return {
              error: mainTaskError?.message ?? 'Falha ao criar tarefa principal do chamado',
            };
          }

          const storyScore = g * u * t;
          const storyPriority = storyScore >= 50 ? 'high' : storyScore >= 24 ? 'medium' : 'low';
          let createdLinkedStory: { id: string; title: string } | null = null;
          let linkedStoryWarning: string | null = null;

          const { data: linkedStory, error: linkedStoryError } = await adminClient
            .from('user_stories')
            .insert({
              project_id,
              activity_id: mainTask.id,
              stage_id: stage.id,
              title,
              narrative: userStoryText,
              persona,
              action,
              benefit,
              priority: storyPriority,
              status: 'draft',
            })
            .select('id, title')
            .single();

          if (linkedStoryError) {
            linkedStoryWarning = `Não foi possível vincular a história na aba da tarefa: ${linkedStoryError.message}`;
          } else if (linkedStory) {
            createdLinkedStory = { id: linkedStory.id, title: linkedStory.title };
          }

          const allSubtaskTitles = tasks.map((task) => task.title);

          const seen = new Set<string>();
          const dedupedSubtasks = allSubtaskTitles
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
            .filter((s) => {
              const key = s.toLowerCase();
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });

          if (dedupedSubtasks.length === 0) {
            dedupedSubtasks.push('Executar atendimento do chamado');
          }

          const subtaskHours = totalHours > 0
            ? Number((totalHours / dedupedSubtasks.length).toFixed(1))
            : null;

          let subtasksCount = 0;
          const createdSubtasks: Array<{ id: string; title: string }> = [];
          for (const subtaskTitle of dedupedSubtasks) {
            const { data: subtask, error: subtaskError } = await adminClient
              .from('activities')
              .insert({
                project_id,
                parent_id: mainTask.id,
                title: subtaskTitle,
                assigned_to: assigned_to ?? userName,
                priority,
                status: 'pending',
                item_type: 'subtarefa',
                workflow_stage_id: stage.id,
                created_by: user.id,
                created_by_email: userEmail,
                hours: subtaskHours,
                gravity: g,
                urgency: u,
                tendency: t,
              })
              .select('id, title')
              .single();

            if (subtaskError) {
              return {
                error: subtaskError.message,
                warning: `Falha ao criar subtarefa "${subtaskTitle}"`,
                created_tasks: [mainTask],
                created_tasks_count: 1,
                created_subtasks_count: subtasksCount,
                created_subtasks: createdSubtasks,
              };
            }

            if (subtask) {
              createdSubtasks.push({ id: subtask.id, title: subtask.title });
            }
            subtasksCount += 1;
          }

          const formattedResponse =
            `✅ **Estrutura do chamado criada com sucesso!**\n\n` +
              `📖 **História do Usuário criada**\n` +
              `${userStoryText}\n\n` +
              `📌 **Tarefa Principal**\n` +
              `${mainTask.title}\n\n` +
              `${createdLinkedStory
                ? `🔗 **História vinculada na aba da tarefa**\n${createdLinkedStory.title}\n\n`
                : ''}` +
              `✓ **Atividades Criadas**\n` +
              `${subtasksCount} subtarefa${subtasksCount !== 1 ? 's' : ''} para execução\n\n` +
              `🎯 **Prioridade Aplicada**\n` +
              `G${g} (Gravidade) | U${u} (Urgência) | T${t} (Tendência) = **Score ${g * u * t}**\n\n` +
              `⏱️ **Estimativa Total:** ${totalHours}h` +
              `${linkedStoryWarning ? `\n\n⚠️ ${linkedStoryWarning}` : ''}`;

          return {
            user_story: userStoryText,
            total_estimated_hours: totalHours,
            gut: { gravity: g, urgency: u, tendency: t, score: g * u * t },
            created_tasks_count: 1,
            created_subtasks_count: subtasksCount,
            created_tasks: [mainTask],
            created_subtasks: createdSubtasks,
            created_linked_story: createdLinkedStory,
            warning: linkedStoryWarning ?? undefined,
            formatted_response: formattedResponse,
          };
        },
      }),

      backfillGlpiTaskStories: tool({
        description: 'Backfill para tarefas GLPI antigas: cria e vincula histórias de usuário na aba Histórias para tarefas que ainda não possuem user_stories.',
        inputSchema: z.object({
          project_id: z.string().describe('ID do projeto alvo do backfill'),
          dry_run: z.boolean().optional().describe('Quando true, apenas simula e não grava no banco'),
          limit: z.number().int().min(1).max(300).optional().describe('Limite de tarefas elegíveis processadas por execução'),
        }),
        execute: async ({ project_id, dry_run, limit }) => {
          const candidates = buildUserCandidates([profile?.full_name, profile?.email, user.email]);

          const [memberRow, projectRow] = await Promise.all([
            adminClient
              .from('project_members')
              .select('project_id')
              .eq('project_id', project_id)
              .eq('user_id', user.id)
              .maybeSingle(),
            adminClient
              .from('projects')
              .select('created_by, owner, manager, assignees')
              .eq('id', project_id)
              .maybeSingle(),
          ]);

          const p = projectRow.data;
          const hasAccess =
            !!memberRow.data ||
            p?.created_by === user.id ||
            matchesIdentity(p?.owner, candidates) ||
            matchesIdentity(p?.manager, candidates) ||
            (Array.isArray(p?.assignees) && anyMatchesIdentity(p.assignees, candidates));

          if (!hasAccess) return { error: 'Sem acesso a este projeto' };

          const maxRows = limit ?? 120;
          const { data: tasks, error: tasksError } = await adminClient
            .from('activities')
            .select('id, parent_id, project_id, workflow_stage_id, title, description, gravity, urgency, tendency, item_type')
            .eq('project_id', project_id)
            .eq('is_trashed', false)
            .eq('item_type', 'tarefa')
            .order('created_at', { ascending: true })
            .limit(maxRows);

          if (tasksError) return { error: `Erro ao buscar tarefas: ${tasksError.message}` };

          const taskRows = tasks ?? [];
          if (taskRows.length === 0) {
            return {
              project_id,
              checked_tasks: 0,
              eligible_tasks: 0,
              created_stories_count: 0,
              dry_run: !!dry_run,
              formatted_response: 'Não há tarefas para backfill neste projeto.',
            };
          }

          const parentIds = Array.from(new Set(taskRows.map((t) => t.parent_id).filter((id): id is string => !!id)));
          let parentMap = new Map<string, { id: string; title: string | null; description: string | null; item_type: string | null }>();

          if (parentIds.length > 0) {
            const { data: parents } = await adminClient
              .from('activities')
              .select('id, title, description, item_type')
              .in('id', parentIds);

            parentMap = new Map((parents ?? []).map((row: ParentActivityRow) => [row.id, row]));
          }

          const taskIds = taskRows.map((t) => t.id);
          const { data: existingStories, error: existingStoriesError } = await adminClient
            .from('user_stories')
            .select('activity_id')
            .eq('project_id', project_id)
            .eq('is_trashed', false)
            .in('activity_id', taskIds);

          if (existingStoriesError) {
            return { error: `Erro ao buscar histórias existentes: ${existingStoriesError.message}` };
          }

          const existingByActivity = new Set((existingStories ?? [])
            .map((s: ExistingStoryRow) => s.activity_id)
            .filter((id: unknown): id is string => typeof id === 'string'));

          const pending = taskRows.filter((task) => !existingByActivity.has(task.id));
          const glpiCandidates = pending.filter((task) => {
            const parent = task.parent_id ? parentMap.get(task.parent_id) : null;
            const titleNorm = normalizeTextForMatch(task.title ?? '');
            const descNorm = normalizeTextForMatch(task.description ?? '');
            const parentDescNorm = normalizeTextForMatch(parent?.description ?? '');

            return (
              titleNorm.includes('executar chamado') ||
              titleNorm.includes('chamado') ||
              descNorm.includes('glpi') ||
              parentDescNorm.includes('chamado glpi') ||
              parent?.item_type === 'historia_usuario'
            );
          });

          if (glpiCandidates.length === 0) {
            return {
              project_id,
              checked_tasks: taskRows.length,
              eligible_tasks: 0,
              created_stories_count: 0,
              dry_run: !!dry_run,
              formatted_response: 'Nenhuma tarefa GLPI sem história vinculada foi encontrada para backfill.',
            };
          }

          const toInsert = glpiCandidates.map((task) => {
            const parent = task.parent_id ? parentMap.get(task.parent_id) : null;
            const sourceText = `${task.description ?? ''}\n${parent?.description ?? ''}`;
            const extracted = extractStoryParts(sourceText);

            const persona = extracted?.persona ?? inferPersonaFromTicket(sourceText || task.title);
            const action = extracted?.action ?? inferActionFromTicket(sourceText || task.title);
            const benefit = extracted?.benefit ?? inferBenefitFromTicket(sourceText || task.title);
            const narrative = `Como ${persona}, quero ${action}, para ${benefit}.`;

            const g = task.gravity ?? 3;
            const u = task.urgency ?? 3;
            const t = task.tendency ?? 3;
            const score = g * u * t;
            const storyPriority = score >= 50 ? 'high' : score >= 24 ? 'medium' : 'low';

            const cleanTitle = (parent?.title ?? task.title ?? 'História do chamado').replace(/^Executar chamado:\s*/i, '').trim();

            return {
              project_id,
              activity_id: task.id,
              stage_id: task.workflow_stage_id,
              title: cleanTitle || 'História do chamado',
              narrative,
              persona,
              action,
              benefit,
              priority: storyPriority,
              status: 'draft',
            };
          });

          if (dry_run) {
            const preview = toInsert.slice(0, 5).map((s) => `• ${s.title}`).join('\n');
            return {
              project_id,
              checked_tasks: taskRows.length,
              eligible_tasks: glpiCandidates.length,
              created_stories_count: 0,
              dry_run: true,
              preview_stories: toInsert.slice(0, 20).map((s) => ({
                activity_id: s.activity_id,
                title: s.title,
                narrative: s.narrative,
              })),
              formatted_response:
                `Backfill em modo simulação concluído.\n` +
                `Tarefas analisadas: ${taskRows.length}\n` +
                `Tarefas GLPI elegíveis sem história: ${glpiCandidates.length}\n` +
                `Histórias que seriam criadas: ${toInsert.length}` +
                `${preview ? `\n\nPrévia:\n${preview}` : ''}`,
            };
          }

          const { data: insertedStories, error: insertError } = await adminClient
            .from('user_stories')
            .insert(toInsert)
            .select('id, title, activity_id');

          if (insertError) {
            return {
              error: `Falha ao inserir histórias no backfill: ${insertError.message}`,
              project_id,
              checked_tasks: taskRows.length,
              eligible_tasks: glpiCandidates.length,
            };
          }

          const createdCount = insertedStories?.length ?? 0;
          const sample = (insertedStories ?? []).slice(0, 5).map((s: InsertedStoryRow) => `• ${s.title}`).join('\n');

          return {
            project_id,
            checked_tasks: taskRows.length,
            eligible_tasks: glpiCandidates.length,
            created_stories_count: createdCount,
            created_stories: insertedStories ?? [],
            formatted_response:
              `Backfill de histórias concluído com sucesso.\n` +
              `Tarefas analisadas: ${taskRows.length}\n` +
              `Tarefas GLPI elegíveis sem história: ${glpiCandidates.length}\n` +
              `Histórias criadas e vinculadas: ${createdCount}` +
              `${sample ? `\n\nAmostra:\n${sample}` : ''}`,
          };
        },
      }),

      createActivity: tool({
        description: 'Cria uma atividade/tarefa em um projeto existente. Dica: Antes de informar datas, use getSystemDateReference para saber qual é a data de hoje e o dia da semana, assim o usuário pode fazer referências simples como "amanhã" ou "próxima segunda".',
        inputSchema: z.object({
          project_id: z.string().describe('ID do projeto onde a atividade será criada'),
          workflow_stage_name: z.string().describe('Nome exato da coluna/estágio onde a tarefa será criada (obtido via listWorkflowStages)'),
          title: z.string().describe('Título da atividade'),
          assigned_to: z.string().optional().describe('Nome do responsável pela tarefa'),
          description: z.string().optional().describe('Descrição detalhada'),
          priority: z.string().optional().describe('Prioridade: high/alta, medium/média, low/baixa'),
          start_date: z.string().optional().describe('Data de início YYYY-MM-DD'),
          end_date: z.string().optional().describe('Data de entrega YYYY-MM-DD'),
        }),
        execute: async ({ project_id, workflow_stage_name, title, assigned_to, description, priority, start_date, end_date }) => {
          const candidates = buildUserCandidates([profile?.full_name, profile?.email, user.email]);

          const [memberRow, projectRow] = await Promise.all([
            adminClient.from('project_members').select('project_id').eq('project_id', project_id).eq('user_id', user.id).maybeSingle(),
            adminClient.from('projects').select('created_by, owner, manager, assignees').eq('id', project_id).maybeSingle(),
          ]);

          const p = projectRow.data;
          const hasAccess =
            !!memberRow.data ||
            p?.created_by === user.id ||
            matchesIdentity(p?.owner, candidates) ||
            matchesIdentity(p?.manager, candidates) ||
            (Array.isArray(p?.assignees) && anyMatchesIdentity(p.assignees, candidates));

          if (!hasAccess) {
            return { error: 'Sem acesso a este projeto' };
          }

          // Busca a coluna pelo nome exato informado pelo usuário
          const { data: stages } = await adminClient
            .from('workflow_stages')
            .select('id, title, display_order, is_visible')
            .eq('project_id', project_id)
            .order('display_order', { ascending: true });

          const visibleStages = (stages ?? []).filter((s) => isVisibleKanbanStage(s));
          const stage = visibleStages.find((s) => stageNameMatchesInput(s.title, workflow_stage_name));

          if (!stage) {
            const available = visibleStages.map((s) => s.title).join(', ');
            return { error: `Coluna "${workflow_stage_name}" não encontrada. Colunas disponíveis: ${available}` };
          }

          const { data: activity, error } = await adminClient
            .from('activities')
            .insert({
              project_id,
              title,
              assigned_to: assigned_to ?? null,
              description: description ?? null,
              priority: normalizeActivityPriority(priority),
              status: 'pending',
              item_type: 'atividade',
              workflow_stage_id: stage.id,
              start_date: start_date ?? null,
              end_date: end_date ?? null,
              created_by: user.id,
              created_by_email: userEmail,
            })
            .select('id, title, status, priority, item_type')
            .single();

          if (error) return { error: error.message };
          return { activity };
        },
      }),

      searchActivities: tool({
        description: 'Busca tarefas/atividades dentro de um projeto por texto e filtros (responsável, status e tipo).',
        inputSchema: z.object({
          project_id: z.string().describe('ID do projeto onde a busca será feita'),
          query: z.string().optional().describe('Texto livre para buscar em título e descrição'),
          assigned_to: z.string().optional().describe('Responsável da tarefa para filtrar'),
          status: z.string().optional().describe('Status da tarefa para filtrar'),
          item_type: z.string().optional().describe('Tipo do item para filtrar (atividade, tarefa, subtarefa, etc.)'),
          limit: z.number().int().min(1).max(100).optional().describe('Limite de resultados (padrão 30)'),
        }),
        execute: async ({ project_id, query, assigned_to, status, item_type, limit }) => {
          const candidates = buildUserCandidates([profile?.full_name, profile?.email, user.email]);

          const [memberRow, projectRow] = await Promise.all([
            adminClient.from('project_members').select('project_id').eq('project_id', project_id).eq('user_id', user.id).maybeSingle(),
            adminClient.from('projects').select('created_by, owner, manager, assignees, title').eq('id', project_id).maybeSingle(),
          ]);

          const p = projectRow.data;
          const hasAccess =
            !!memberRow.data ||
            p?.created_by === user.id ||
            matchesIdentity(p?.owner, candidates) ||
            matchesIdentity(p?.manager, candidates) ||
            (Array.isArray(p?.assignees) && anyMatchesIdentity(p.assignees, candidates));

          if (!hasAccess) {
            return { error: 'Sem acesso a este projeto' };
          }

          let queryBuilder = adminClient
            .from('activities')
            .select('id, title, status, priority, item_type, assigned_to, start_date, end_date, workflow_stage_id, parent_id, updated_at')
            .eq('project_id', project_id)
            .eq('is_trashed', false);

          const normalizedQuery = query?.trim();
          if (normalizedQuery) {
            queryBuilder = queryBuilder.or(`title.ilike.%${normalizedQuery}%,description.ilike.%${normalizedQuery}%`);
          }

          if (assigned_to?.trim()) {
            queryBuilder = queryBuilder.eq('assigned_to', assigned_to.trim());
          }

          if (status?.trim()) {
            queryBuilder = queryBuilder.eq('status', status.trim());
          }

          if (item_type?.trim()) {
            queryBuilder = queryBuilder.eq('item_type', item_type.trim());
          }

          const rowLimit = limit ?? 30;
          const { data: activities, error } = await queryBuilder
            .order('updated_at', { ascending: false })
            .limit(rowLimit);

          if (error) {
            return { error: `Erro ao buscar atividades: ${error.message}` };
          }

          const activityRows = activities ?? [];
          if (activityRows.length === 0) {
            return {
              activities: [],
              formatted_response: 'Não encontrei atividades com esses critérios. Deseja ajustar os filtros de busca?',
            };
          }

          const options = activityRows.slice(0, 12).map((a) => `[${a.title}]`).join(' | ');
          const projectTitle = p?.title ?? project_id;

          return {
            activities: activityRows,
            project_id,
            project_title: projectTitle,
            total_found: activityRows.length,
            formatted_response:
              `Encontrei ${activityRows.length} atividade(s) em ${projectTitle}.\n` +
              `Qual delas você quer detalhar?\n${options}`,
          };
        },
      }),

      getActivityDetails: tool({
        description: 'Retorna detalhes completos de uma atividade/tarefa de um projeto.',
        inputSchema: z.object({
          project_id: z.string().describe('ID do projeto da atividade'),
          activity_id: z.string().describe('ID da atividade/tarefa'),
        }),
        execute: async ({ project_id, activity_id }) => {
          const candidates = buildUserCandidates([profile?.full_name, profile?.email, user.email]);

          const [memberRow, projectRow] = await Promise.all([
            adminClient.from('project_members').select('project_id').eq('project_id', project_id).eq('user_id', user.id).maybeSingle(),
            adminClient.from('projects').select('created_by, owner, manager, assignees, title').eq('id', project_id).maybeSingle(),
          ]);

          const p = projectRow.data;
          const hasAccess =
            !!memberRow.data ||
            p?.created_by === user.id ||
            matchesIdentity(p?.owner, candidates) ||
            matchesIdentity(p?.manager, candidates) ||
            (Array.isArray(p?.assignees) && anyMatchesIdentity(p.assignees, candidates));

          if (!hasAccess) {
            return { error: 'Sem acesso a este projeto' };
          }

          const { data: activity, error: activityError } = await adminClient
            .from('activities')
            .select('id, project_id, parent_id, workflow_stage_id, title, description, status, priority, item_type, assigned_to, start_date, end_date, hours, gravity, urgency, tendency, progress_flag, updated_at, created_at')
            .eq('project_id', project_id)
            .eq('id', activity_id)
            .eq('is_trashed', false)
            .maybeSingle();

          if (activityError) {
            return { error: `Erro ao buscar atividade: ${activityError.message}` };
          }

          if (!activity) {
            return { error: 'Atividade não encontrada neste projeto' };
          }

          const [stageRow, subtasksRes] = await Promise.all([
            activity.workflow_stage_id
              ? adminClient
                  .from('workflow_stages')
                  .select('id, title')
                  .eq('id', activity.workflow_stage_id)
                  .maybeSingle()
              : Promise.resolve({ data: null, error: null }),
            adminClient
              .from('activities')
              .select('id', { count: 'exact', head: true })
              .eq('project_id', project_id)
              .eq('parent_id', activity.id)
              .eq('is_trashed', false),
          ]);

          const stageTitle = stageRow.data?.title ?? null;
          const subtasksCount = subtasksRes.count ?? 0;

          return {
            activity: {
              ...activity,
              stage_title: stageTitle,
              subtasks_count: subtasksCount,
            },
            formatted_response:
              `Detalhes carregados para "${activity.title}".\n` +
              `Deseja atualizar dados ou mover de coluna?\n` +
              `[Atualizar dados] | [Mover de coluna] | [Cancelar]`,
          };
        },
      }),

      updateActivity: tool({
        description: 'Atualiza campos editáveis de uma atividade/tarefa existente.',
        inputSchema: z.object({
          project_id: z.string().describe('ID do projeto da atividade'),
          activity_id: z.string().describe('ID da atividade/tarefa'),
          title: z.string().optional().describe('Novo título'),
          description: z.string().optional().describe('Nova descrição'),
          assigned_to: z.string().optional().describe('Novo responsável'),
          priority: z.string().optional().describe('Nova prioridade (alta/média/baixa ou high/medium/low)'),
          status: z.string().optional().describe('Novo status da atividade'),
          start_date: z.string().optional().describe('Nova data de início YYYY-MM-DD'),
          end_date: z.string().optional().describe('Nova data de entrega YYYY-MM-DD'),
          hours: z.number().optional().describe('Nova estimativa de horas'),
        }),
        execute: async ({ project_id, activity_id, title, description, assigned_to, priority, status, start_date, end_date, hours }) => {
          const candidates = buildUserCandidates([profile?.full_name, profile?.email, user.email]);

          const [memberRow, projectRow] = await Promise.all([
            adminClient.from('project_members').select('project_id').eq('project_id', project_id).eq('user_id', user.id).maybeSingle(),
            adminClient.from('projects').select('created_by, owner, manager, assignees').eq('id', project_id).maybeSingle(),
          ]);

          const p = projectRow.data;
          const hasAccess =
            !!memberRow.data ||
            p?.created_by === user.id ||
            matchesIdentity(p?.owner, candidates) ||
            matchesIdentity(p?.manager, candidates) ||
            (Array.isArray(p?.assignees) && anyMatchesIdentity(p.assignees, candidates));

          if (!hasAccess) {
            return { error: 'Sem acesso a este projeto' };
          }

          const updates: Record<string, unknown> = {};
          if (title !== undefined) updates.title = title;
          if (description !== undefined) updates.description = description;
          if (assigned_to !== undefined) updates.assigned_to = assigned_to;
          if (priority !== undefined) updates.priority = normalizeActivityPriority(priority);
          if (status !== undefined) updates.status = status;
          if (start_date !== undefined) updates.start_date = start_date;
          if (end_date !== undefined) updates.end_date = end_date;
          if (hours !== undefined) updates.hours = hours;

          if (Object.keys(updates).length === 0) {
            return { error: 'Nenhum campo informado para atualizar na atividade' };
          }

          const { data: activity, error } = await adminClient
            .from('activities')
            .update(updates)
            .eq('id', activity_id)
            .eq('project_id', project_id)
            .eq('is_trashed', false)
            .select('id, title, status, priority, item_type, assigned_to, start_date, end_date, hours')
            .maybeSingle();

          if (error) {
            return { error: `Erro ao atualizar atividade: ${error.message}` };
          }

          if (!activity) {
            return { error: 'Atividade não encontrada para atualização' };
          }

          return {
            activity,
            formatted_response: `Atividade "${activity.title}" atualizada com sucesso (ID: ${activity.id}).`,
          };
        },
      }),

      moveActivityToStage: tool({
        description: 'Move uma atividade/tarefa para outra coluna (workflow stage) do mesmo projeto.',
        inputSchema: z.object({
          project_id: z.string().describe('ID do projeto da atividade'),
          activity_id: z.string().describe('ID da atividade/tarefa'),
          target_stage_name: z.string().describe('Nome da coluna de destino'),
          status: z.string().optional().describe('Status opcional para atualizar junto com a movimentação'),
        }),
        execute: async ({ project_id, activity_id, target_stage_name, status }) => {
          const candidates = buildUserCandidates([profile?.full_name, profile?.email, user.email]);

          const [memberRow, projectRow] = await Promise.all([
            adminClient.from('project_members').select('project_id').eq('project_id', project_id).eq('user_id', user.id).maybeSingle(),
            adminClient.from('projects').select('created_by, owner, manager, assignees').eq('id', project_id).maybeSingle(),
          ]);

          const p = projectRow.data;
          const hasAccess =
            !!memberRow.data ||
            p?.created_by === user.id ||
            matchesIdentity(p?.owner, candidates) ||
            matchesIdentity(p?.manager, candidates) ||
            (Array.isArray(p?.assignees) && anyMatchesIdentity(p.assignees, candidates));

          if (!hasAccess) {
            return { error: 'Sem acesso a este projeto' };
          }

          const { data: stages } = await adminClient
            .from('workflow_stages')
            .select('id, title, display_order, is_visible')
            .eq('project_id', project_id)
            .order('display_order', { ascending: true });

          const visibleStages = (stages ?? []).filter((s) => isVisibleKanbanStage(s));
          const targetStage = visibleStages.find((s) => stageNameMatchesInput(s.title, target_stage_name));

          if (!targetStage) {
            const available = visibleStages.map((s) => s.title).join(', ');
            return { error: `Coluna "${target_stage_name}" não encontrada. Colunas disponíveis: ${available}` };
          }

          const updates: Record<string, unknown> = { workflow_stage_id: targetStage.id };
          if (status !== undefined) updates.status = status;

          const { data: activity, error } = await adminClient
            .from('activities')
            .update(updates)
            .eq('id', activity_id)
            .eq('project_id', project_id)
            .eq('is_trashed', false)
            .select('id, title, status, workflow_stage_id, item_type')
            .maybeSingle();

          if (error) {
            return { error: `Erro ao mover atividade: ${error.message}` };
          }

          if (!activity) {
            return { error: 'Atividade não encontrada para movimentação' };
          }

          return {
            activity,
            target_stage: { id: targetStage.id, title: targetStage.title },
            formatted_response:
              `Movi "${activity.title}" para a coluna "${targetStage.title}" com sucesso.`,
          };
        },
      }),

      updateProject: tool({
        description: 'Atualiza campos de um projeto existente (título, descrição, status, prioridade, data de entrega).',
        inputSchema: z.object({
          project_id: z.string().describe('ID do projeto a atualizar'),
          title: z.string().optional().describe('Novo título'),
          description: z.string().optional().describe('Nova descrição'),
          status: z.string().optional().describe('Novo status: ideacao, poc, mvp, em-execucao, blocked, drawer ou equivalente em português'),
          priority: z.string().optional().describe('Nova prioridade: high/alta, medium/média, low/baixa'),
          due_date: z.string().optional().describe('Nova data de entrega YYYY-MM-DD'),
        }),
        execute: async ({ project_id, title, description, status, priority, due_date }) => {
          const candidates = buildUserCandidates([profile?.full_name, profile?.email, user.email]);

          const [memberRow, projectRow] = await Promise.all([
            adminClient.from('project_members').select('project_id').eq('project_id', project_id).eq('user_id', user.id).maybeSingle(),
            adminClient.from('projects').select('created_by, owner, manager, assignees').eq('id', project_id).maybeSingle(),
          ]);

          const p = projectRow.data;
          const hasAccess =
            !!memberRow.data ||
            p?.created_by === user.id ||
            matchesIdentity(p?.owner, candidates) ||
            matchesIdentity(p?.manager, candidates) ||
            (Array.isArray(p?.assignees) && anyMatchesIdentity(p.assignees, candidates));

          if (!hasAccess) return { error: 'Sem acesso a este projeto' };

          const updates: Record<string, unknown> = {};
          if (title !== undefined) updates.title = title;
          if (description !== undefined) updates.description = description;
          if (status !== undefined) updates.status = normalizeStatus(status);
          if (priority !== undefined) updates.priority = normalizeProjectPriority(priority);
          if (due_date !== undefined) updates.due_date = due_date;

          if (Object.keys(updates).length === 0) return { error: 'Nenhum campo informado para atualizar' };

          const { data: project, error } = await adminClient
            .from('projects')
            .update(updates)
            .eq('id', project_id)
            .select('id, title, status, priority')
            .single();

          if (error) return { error: error.message };
          return { project };
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[agent] erro inesperado:', msg, e);
    return new Response(msg || 'Erro interno do servidor', { status: 500 });
  }
}
