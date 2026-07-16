"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Loader2, Send, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInputBRL } from "@/components/ui/currency-input-brl";
import { Button } from "@/components/ui/button";
import { AIAssistButton, type AIContext } from "@/components/AIAssistButton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";

// Rótulos das opções vivem em um módulo compartilhado com a visualização do
// Roadmap, para que valores gravados e exibidos usem a mesma fonte.
import {
  PROBLEMAS,
  TIPOS_NECESSIDADE,
  TIPOS_RESULTADO,
  labelOf,
} from "@/components/roadmap/solicitacaoLabels";

const defaultForm = {
  // 1. Identificação
  nome: "",
  area: "",
  cargo: "",
  email: "",
  tipoNecessidade: "",
  tipoNecessidadeOutro: "",
  // 2. Situação atual e problemas
  processoAtual: "",
  problemas: [] as string[],
  problemasOutroCheck: false,
  problemasOutro: "",
  horasSemana: "",
  pessoasEnvolvidas: "",
  custoAtual: "",
  // 3. Objetivo e resultado
  objetivo: "",
  resultado: "",
  // 4. O que espera receber
  tipoResultado: [] as string[],
  tipoResultadoOutroCheck: false,
  tipoResultadoOutro: "",
  pergunta1: "",
  minimoEntregavel: "",
  // 5. Prazo e urgência
  dataNecessaria: "",
  motivoPrazo: "",
  motivoPrazoOutro: "",
  // 6. Observações finais
  observacoes: "",
};

type FormState = typeof defaultForm;
type Errors = Partial<Record<string, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Rótulos curtos de cada passo, exibidos no stepper. */
const STEPS = [
  "Identificação",
  "Situação atual",
  "Objetivo",
  "O que espera",
  "Prazo",
  "Observações",
] as const;

/**
 * Valida os campos obrigatórios de um passo e devolve o mapa de erros.
 * O índice segue a ordem de STEPS (0 = Identificação … 5 = Observações).
 */
function validateStep(step: number, form: FormState): Errors {
  const e: Errors = {};
  const empty = (v: string) => !v.trim();

  switch (step) {
    case 0:
      if (empty(form.nome)) e.nome = "Informe o nome completo.";
      if (empty(form.email)) e.email = "Informe o e-mail.";
      else if (!EMAIL_RE.test(form.email.trim())) e.email = "E-mail inválido.";
      if (empty(form.area)) e.area = "Selecione a área/departamento.";
      if (empty(form.tipoNecessidade))
        e.tipoNecessidade = "Selecione o tipo de necessidade.";
      if (form.tipoNecessidade === "outro" && empty(form.tipoNecessidadeOutro))
        e.tipoNecessidadeOutro = "Descreva o tipo de necessidade.";
      break;
    case 1: {
      if (empty(form.processoAtual))
        e.processoAtual = "Descreva como você obtém essa informação hoje.";
      // Exige ao menos um problema marcado (ou "Outro" com descrição).
      if (form.problemas.length === 0 && !form.problemasOutroCheck)
        e.problemas = "Selecione ao menos um problema.";
      if (form.problemasOutroCheck && empty(form.problemasOutro))
        e.problemasOutro = "Descreva o outro problema.";
      // Horas/semana e pessoas envolvidas são obrigatórios (custo é opcional).
      if (empty(form.horasSemana)) e.horasSemana = "Informe as horas por semana.";
      else {
        const h = Number(form.horasSemana);
        if (!Number.isFinite(h) || h < 0 || h > 168)
          e.horasSemana = "Informe um valor entre 0 e 168.";
      }
      if (empty(form.pessoasEnvolvidas))
        e.pessoasEnvolvidas = "Informe quantas pessoas estão envolvidas.";
      else {
        const p = Number(form.pessoasEnvolvidas);
        if (!Number.isFinite(p) || p < 1 || p > 50)
          e.pessoasEnvolvidas = "Informe um valor entre 1 e 50.";
      }
      break;
    }
    case 2:
      if (empty(form.objetivo)) e.objetivo = "Descreva o objetivo em uma frase.";
      if (empty(form.resultado)) e.resultado = "Descreva o resultado esperado.";
      break;
    case 3:
      // Exige ao menos um tipo de resultado marcado (ou "Outro" com descrição).
      if (form.tipoResultado.length === 0 && !form.tipoResultadoOutroCheck)
        e.tipoResultado = "Selecione ao menos um tipo de resultado.";
      if (form.tipoResultadoOutroCheck && empty(form.tipoResultadoOutro))
        e.tipoResultadoOutro = "Descreva o outro tipo de resultado.";
      if (empty(form.pergunta1))
        e.pergunta1 = "Informe as perguntas que precisa responder.";
      if (empty(form.minimoEntregavel))
        e.minimoEntregavel = "Descreva qual seria a primeira entrega.";
      break;
    case 4:
      if (empty(form.dataNecessaria))
        e.dataNecessaria = "Informe quando precisa disso funcionando.";
      if (empty(form.motivoPrazo)) e.motivoPrazo = "Selecione o motivo do prazo.";
      if (form.motivoPrazo === "outro" && empty(form.motivoPrazoOutro))
        e.motivoPrazoOutro = "Descreva o outro motivo.";
      break;
    case 5:
      // Observações finais são opcionais.
      break;
  }
  return e;
}

/** Nº de caracteres a partir do qual sugerimos o assistente de IA. */
const AI_HINT_MIN_CHARS = 10;
/** Por quanto tempo (ms) o balão de sugestão fica visível. */
const AI_HINT_DURATION_MS = 4000;
/** Intervalo mínimo (s) entre dois usos da IA no mesmo campo. */
const AI_COOLDOWN_SECONDS = 5;

/**
 * Botão de IA com duas proteções de uso:
 * - um balão sugere o assistente na primeira vez que o campo ganha texto
 *   suficiente; ele some sozinho para não cobrir o formulário;
 * - após cada uso, o botão daquele campo entra em cooldown, evitando cliques
 *   repetidos que consomem chamadas da IA à toa (o servidor também limita, mas
 *   só responde com erro depois de estourar a cota).
 */
function AIHint({
  value,
  onChange,
  context,
  extraContext,
}: {
  value: string;
  onChange: (next: string) => void;
  context: AIContext;
  extraContext?: string;
}) {
  const [showHint, setShowHint] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const temTexto = value.trim().length >= AI_HINT_MIN_CHARS;

  // A dica só deve surgir quando o usuário CRUZA o limite digitando. Campos que
  // já montam preenchidos (ao voltar um passo, ou pré-preenchidos pelo perfil)
  // nascem com a dica marcada como exibida — do contrário, todos os balões
  // apareceriam de uma vez ao renavegar entre os passos.
  const hintUsado = useRef(temTexto);

  useEffect(() => {
    if (hintUsado.current || !temTexto) return;
    hintUsado.current = true;
    setShowHint(true);
  }, [temTexto]);

  // ...e o esconde sozinho, para não ficar cobrindo o formulário.
  useEffect(() => {
    if (!showHint) return;
    const t = setTimeout(() => setShowHint(false), AI_HINT_DURATION_MS);
    return () => clearTimeout(t);
  }, [showHint]);

  // Conta regressiva do cooldown, 1s por vez.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleAIChange = (next: string) => {
    onChange(next);
    setCooldown(AI_COOLDOWN_SECONDS);
  };

  if (cooldown > 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground"
            aria-live="polite"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {cooldown}s
          </span>
        </TooltipTrigger>
        <TooltipContent side="left">
          Aguarde {cooldown}s para usar a IA novamente neste campo.
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    // `open` só é forçado enquanto a dica automática está no ar; depois disso
    // volta a ser `undefined`, devolvendo ao Radix o controle normal por hover.
    <Tooltip open={showHint || undefined}>
      <TooltipTrigger asChild>
        <span onClick={() => setShowHint(false)}>
          <AIAssistButton
            value={value}
            onChange={handleAIChange}
            context={context}
            extraContext={extraContext}
            size="sm"
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Precisa de ajuda? A IA pode melhorar seu texto.
      </TooltipContent>
    </Tooltip>
  );
}

export default function SolicitacaoPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [step, setStep] = useState(0);
  // Passos já visitados (habilitam clique direto no stepper).
  const [visited, setVisited] = useState<Set<number>>(() => new Set([0]));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Limpa o erro do campo assim que ele é editado.
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  };

  /**
   * Resumo da solicitação enviado à IA como referência, para que ela entenda o
   * cenário ao reescrever um campo (sem esse contexto, ela só vê o texto solto
   * e devolve algo genérico). `omitir` tira do resumo o próprio campo que está
   * sendo reescrito, evitando que a IA apenas repita o que já está lá.
   */
  const contextoDaSolicitacao = (omitir?: keyof FormState): string => {
    const linhas: string[] = [];
    const add = (rotulo: string, valor?: string) => {
      if (valor?.trim()) linhas.push(`- ${rotulo}: ${valor.trim()}`);
    };

    // Deixa explícito que a área é apenas a origem do pedido: sem isso, a IA
    // tende a tratar o setor (ex.: "TI") como se fosse o tema da demanda.
    if (form.area)
      add("Setor de quem está solicitando (não é o tema do pedido)", form.area);
    if (form.tipoNecessidade) {
      add(
        "Tipo de necessidade",
        form.tipoNecessidade === "outro"
          ? form.tipoNecessidadeOutro
          : TIPOS_NECESSIDADE[form.tipoNecessidade],
      );
    }
    if (omitir !== "objetivo") add("Objetivo", form.objetivo);
    if (omitir !== "processoAtual") add("Como é feito hoje", form.processoAtual);

    if (form.problemas.length || form.problemasOutro) {
      const problemas = [
        ...form.problemas.map((p) => labelOf(PROBLEMAS, p)),
        form.problemasOutro,
      ].filter(Boolean);
      add("Problemas relatados", problemas.join("; "));
    }

    if (form.tipoResultado.length || form.tipoResultadoOutro) {
      const tipos = [
        ...form.tipoResultado.map((t) => labelOf(TIPOS_RESULTADO, t)),
        form.tipoResultadoOutro,
      ].filter(Boolean);
      add("Entregáveis esperados", tipos.join("; "));
    }

    if (omitir !== "resultado") add("Resultado esperado", form.resultado);
    if (form.horasSemana) add("Horas por semana gastas hoje", form.horasSemana);
    if (form.pessoasEnvolvidas) add("Pessoas envolvidas", form.pessoasEnvolvidas);

    return linhas.join("\n");
  };

  // Áreas/departamentos vêm da tabela `sectors` (Configurações → Estrutura),
  // mesma fonte usada em AddProjectDialog e no cadastro de usuários.
  useEffect(() => {
    supabase
      .from("sectors")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        if (data) setSectors(data);
      });
  }, []);

  // Pré-preenche identificação com os dados do usuário logado (sem sobrescrever
  // o que já foi digitado). Setor/área vem de profiles.sector.
  useEffect(() => {
    if (!profile) return;
    setForm((prev) => ({
      ...prev,
      nome: prev.nome || profile.full_name || "",
      email: prev.email || profile.email || "",
      cargo: prev.cargo || profile.role_title || "",
      area: prev.area || profile.sector || "",
    }));
  }, [profile]);

  /** Alterna um valor dentro de um array de checkbox (problemas / tipoResultado). */
  const toggleInArray = (key: "problemas" | "tipoResultado", value: string) => {
    setForm((prev) => {
      const arr = prev[key];
      return {
        ...prev,
        [key]: arr.includes(value)
          ? arr.filter((v) => v !== value)
          : [...arr, value],
      };
    });
    // Limpa o erro do grupo assim que algo é marcado/desmarcado.
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  };

  const hoje = new Date().toISOString().split("T")[0];
  const isLast = step === STEPS.length - 1;

  /** Foca o primeiro campo com erro, quando ele tem um id. */
  const focusFirstError = (errs: Errors) => {
    const firstId = Object.keys(errs).find((k) => errs[k]);
    if (firstId) document.getElementById(firstId)?.focus();
  };

  const goTo = (target: number) => {
    if (target === step) return;
    // Voltar (ou ir a um passo já visitado) é livre; avançar valida o passo atual.
    if (target < step || visited.has(target)) {
      setStep(target);
      return;
    }
    const errs = validateStep(step, form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      focusFirstError(errs);
      return;
    }
    setVisited((prev) => new Set(prev).add(target));
    setStep(target);
  };

  const next = () => {
    const errs = validateStep(step, form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast({
        title: `Revise "${STEPS[step]}"`,
        description: "Há campos obrigatórios pendentes neste passo.",
        variant: "destructive",
      });
      focusFirstError(errs);
      return;
    }
    setVisited((prev) => new Set(prev).add(step + 1));
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const back = () => setStep((s) => Math.max(s - 1, 0));

  /** "" -> null, para não gravar strings vazias no banco. */
  const orNull = (v: string) => (v.trim() ? v.trim() : null);
  /** "" -> null, senão número. */
  const numOrNull = (v: string) => (v.trim() ? Number(v) : null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // `score` é coluna gerada no banco — nunca enviar no payload.
      const payload = {
        // Critérios entram nos defaults do banco; a classificação é feita depois.
        title: form.objetivo.trim(),
        description: form.resultado.trim() || null,
        theme: "produto",
        // Toda solicitação entra no primeiro estágio da triagem.
        status: "backlog",
        origem: "formulario",
        created_by: user?.id ?? null,

        // 1. Identificação
        solicitante_nome: orNull(form.nome),
        solicitante_email: orNull(form.email),
        solicitante_cargo: orNull(form.cargo),
        area: orNull(form.area),
        tipo_necessidade: orNull(form.tipoNecessidade),
        tipo_necessidade_outro: orNull(form.tipoNecessidadeOutro),

        // 2. Situação atual e problemas
        processo_atual: orNull(form.processoAtual),
        problemas: form.problemas.length ? form.problemas : null,
        problemas_outro: form.problemasOutroCheck
          ? orNull(form.problemasOutro)
          : null,
        horas_semana: numOrNull(form.horasSemana),
        pessoas_envolvidas: numOrNull(form.pessoasEnvolvidas),
        custo_atual: numOrNull(form.custoAtual),

        // 3. Objetivo e resultado (o objetivo vira o title)
        resultado_esperado: orNull(form.resultado),

        // 4. O que espera receber
        tipos_resultado: form.tipoResultado.length ? form.tipoResultado : null,
        tipos_resultado_outro: form.tipoResultadoOutroCheck
          ? orNull(form.tipoResultadoOutro)
          : null,
        perguntas: orNull(form.pergunta1),
        minimo_entregavel: orNull(form.minimoEntregavel),

        // 5. Prazo e urgência
        data_necessaria: orNull(form.dataNecessaria),
        motivo_prazo: orNull(form.motivoPrazo),
        motivo_prazo_outro:
          form.motivoPrazo === "outro" ? orNull(form.motivoPrazoOutro) : null,

        // 6. Observações finais
        observacoes: orNull(form.observacoes),
      };

      const { error } = await supabase
        .from("roadmap_items" as any)
        .insert(payload as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roadmap_items"] });
      toast({
        title: "Solicitação enviada!",
        description: "Seu pedido foi registrado no Roadmap e será avaliado.",
      });
      router.push("/roadmap");
    },
    onError: (error: unknown) => {
      // Sem a mensagem real do banco, uma falha de schema/constraint fica
      // indistinguível de uma instabilidade de rede.
      console.error("Erro ao enviar solicitação:", error);
      const detalhe =
        error && typeof error === "object" && "message" in error
          ? String((error as { message: unknown }).message)
          : null;
      toast({
        title: "Erro ao enviar solicitação",
        description: detalhe ?? "Tente novamente em alguns instantes.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    // Revalida todos os passos antes de enviar.
    for (let i = 0; i < STEPS.length; i++) {
      const errs = validateStep(i, form);
      if (Object.keys(errs).length) {
        setErrors(errs);
        setStep(i);
        setVisited((prev) => new Set(prev).add(i));
        toast({
          title: `Revise "${STEPS[i]}"`,
          description: "Há campos obrigatórios pendentes.",
          variant: "destructive",
        });
        setTimeout(() => focusFirstError(errs), 0);
        return;
      }
    }

    saveMutation.mutate();
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <header className="space-y-1">
        <Link
          href="/roadmap"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar ao Roadmap
        </Link>
        <h1 className="pt-1 text-2xl font-bold text-foreground">
          Solicitação de Projetos
        </h1>
        <p className="text-sm text-muted-foreground">
          Solicitação de relatórios, painéis, análises de dados, BI e desenvolvimento
          de aplicações · Tempo estimado: 5–10 minutos
        </p>
      </header>

      {/* Stepper numerado e clicável */}
      <nav
        aria-label="Progresso"
        className="rounded-lg border bg-card px-3 py-3 sm:px-4"
      >
        <ol className="flex items-center">
          {STEPS.map((label, i) => {
            const isCurrent = i === step;
            const isDone = i < step;
            const canClick = visited.has(i) || i < step;
            return (
              <li
                key={label}
                className={cn(
                  "flex items-center",
                  i < STEPS.length - 1 && "flex-1",
                )}
              >
                <button
                  type="button"
                  onClick={() => canClick && goTo(i)}
                  disabled={!canClick}
                  aria-current={isCurrent ? "step" : undefined}
                  title={label}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1 transition-colors",
                    canClick ? "cursor-pointer hover:bg-muted" : "cursor-default",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                      isCurrent &&
                        "border-primary bg-primary text-primary-foreground",
                      isDone && "border-primary bg-primary/10 text-primary",
                      !isCurrent &&
                        !isDone &&
                        "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      "hidden whitespace-nowrap text-sm xl:inline",
                      isCurrent
                        ? "font-medium text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <span
                    className={cn(
                      "mx-1.5 h-0.5 min-w-[8px] flex-1 rounded-full sm:mx-2",
                      isDone ? "bg-primary/40" : "bg-border",
                    )}
                    aria-hidden
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* O envio exige clique explícito no botão do último passo: sem isto, um
          Enter em qualquer campo dispararia o submit nativo e gravaria a
          solicitação sem o usuário pedir. */}
      <form
        onSubmit={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
            e.preventDefault();
          }
        }}
        className="space-y-6"
      >
        {/* Área do passo — cada passo é um <Card> que ocupa a largura toda e
            cresce até a altura mínima, mantendo o rodapé estável entre passos. */}
        <div className="min-h-[340px] [&>div]:flex [&>div]:h-full [&>div]:min-h-[340px] [&>div]:flex-col">
        {/* 1. IDENTIFICAÇÃO */}
        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>1. Identificação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="nome">
                    Nome completo <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="nome"
                    value={form.nome}
                    onChange={(e) => set("nome", e.target.value)}
                    aria-invalid={!!errors.nome}
                    className={errors.nome ? "border-destructive" : undefined}
                  />
                  {errors.nome && (
                    <p className="text-xs text-destructive mt-1">{errors.nome}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="email">
                    E-mail <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    aria-invalid={!!errors.email}
                    className={errors.email ? "border-destructive" : undefined}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive mt-1">{errors.email}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>
                    Área/Departamento <span className="text-destructive">*</span>
                  </Label>
                  <Select value={form.area} onValueChange={(v) => set("area", v)}>
                    <SelectTrigger
                      aria-invalid={!!errors.area}
                      className={errors.area ? "border-destructive" : undefined}
                    >
                      <SelectValue
                        placeholder={
                          sectors.length ? "Selecione..." : "Nenhum setor cadastrado"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {sectors.map((s) => (
                        <SelectItem key={s.id} value={s.name}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.area ? (
                    <p className="text-xs text-destructive mt-1">{errors.area}</p>
                  ) : (
                    !sectors.length && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Cadastre setores em Configurações → Estrutura.
                      </p>
                    )
                  )}
                </div>
                <div>
                  <Label htmlFor="cargo">Cargo</Label>
                  <Input
                    id="cargo"
                    value={form.cargo}
                    onChange={(e) => set("cargo", e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label>
                  Tipo de necessidade <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.tipoNecessidade}
                  onValueChange={(v) => set("tipoNecessidade", v)}
                >
                  <SelectTrigger
                    aria-invalid={!!errors.tipoNecessidade}
                    className={
                      errors.tipoNecessidade ? "border-destructive" : undefined
                    }
                  >
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relatorio_novo">
                      Relatório novo para acompanhamento
                    </SelectItem>
                    <SelectItem value="melhorar_relatorio">
                      Melhorar relatório que já existe
                    </SelectItem>
                    <SelectItem value="painel_indicadores">
                      Painel de indicadores (gráficos)
                    </SelectItem>
                    <SelectItem value="automatizar_processo">
                      Automatizar processo manual
                    </SelectItem>
                    <SelectItem value="cruzar_informacoes">
                      Cruzar informações de sistemas diferentes
                    </SelectItem>
                    <SelectItem value="desenvolver_aplicacao">
                      Desenvolver uma aplicação
                    </SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
                {errors.tipoNecessidade && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.tipoNecessidade}
                  </p>
                )}
              </div>

              {form.tipoNecessidade === "outro" && (
                <div>
                  <Label htmlFor="tipoNecessidadeOutro">
                    Descreva (Outro) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="tipoNecessidadeOutro"
                    maxLength={150}
                    value={form.tipoNecessidadeOutro}
                    onChange={(e) => set("tipoNecessidadeOutro", e.target.value)}
                    aria-invalid={!!errors.tipoNecessidadeOutro}
                    className={
                      errors.tipoNecessidadeOutro ? "border-destructive" : undefined
                    }
                  />
                  {errors.tipoNecessidadeOutro && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.tipoNecessidadeOutro}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 2. SITUAÇÃO ATUAL E PROBLEMAS */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>2. Situação Atual e Problemas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="processoAtual">
                    Como você obtém essa informação hoje?{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <AIHint
                    value={form.processoAtual}
                    onChange={(v) => set("processoAtual", v)}
                    context="tap_problem"
                    extraContext={contextoDaSolicitacao("processoAtual")}
                  />
                </div>
                <Textarea
                  id="processoAtual"
                  rows={3}
                  placeholder="Descreva como sua equipe obtém essa informação atualmente…"
                  value={form.processoAtual}
                  onChange={(e) => set("processoAtual", e.target.value)}
                  aria-invalid={!!errors.processoAtual}
                  className={errors.processoAtual ? "border-destructive" : undefined}
                />
                {errors.processoAtual && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.processoAtual}
                  </p>
                )}
              </div>

              <div>
                <Label>
                  Qual o principal problema hoje?{" "}
                  <span className="text-destructive">*</span>{" "}
                  <span className="font-normal text-muted-foreground">
                    (pode marcar várias opções)
                  </span>
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                  {PROBLEMAS.map((p) => (
                    <div key={p.value} className="flex items-center gap-2">
                      <Checkbox
                        id={`prob-${p.value}`}
                        checked={form.problemas.includes(p.value)}
                        onCheckedChange={() => toggleInArray("problemas", p.value)}
                      />
                      <Label htmlFor={`prob-${p.value}`} className="font-normal">
                        {p.label}
                      </Label>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
                    <Checkbox
                      id="prob-outro"
                      checked={form.problemasOutroCheck}
                      onCheckedChange={(c) => {
                        const checked = c === true;
                        set("problemasOutroCheck", checked);
                        if (!checked) set("problemasOutro", "");
                        // Marcar "Outro" também satisfaz a exigência do grupo.
                        setErrors((prev) =>
                          prev.problemas ? { ...prev, problemas: "" } : prev,
                        );
                      }}
                    />
                    <Label
                      htmlFor="prob-outro"
                      className="font-normal whitespace-nowrap"
                    >
                      Outro:
                    </Label>
                    {form.problemasOutroCheck && (
                      <Input
                        className={cn(
                          "flex-1",
                          errors.problemasOutro && "border-destructive",
                        )}
                        maxLength={150}
                        placeholder="Descreva aqui…"
                        value={form.problemasOutro}
                        onChange={(e) => set("problemasOutro", e.target.value)}
                      />
                    )}
                  </div>
                </div>
                {errors.problemas && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.problemas}
                  </p>
                )}
                {errors.problemasOutro && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.problemasOutro}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="horasSemana">
                    Horas/semana gastas com isso{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="horasSemana"
                    type="number"
                    min={0}
                    max={168}
                    value={form.horasSemana}
                    onChange={(e) => set("horasSemana", e.target.value)}
                    aria-invalid={!!errors.horasSemana}
                    className={errors.horasSemana ? "border-destructive" : undefined}
                  />
                  {errors.horasSemana && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.horasSemana}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="pessoasEnvolvidas">
                    Pessoas envolvidas <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="pessoasEnvolvidas"
                    type="number"
                    min={1}
                    max={50}
                    value={form.pessoasEnvolvidas}
                    onChange={(e) => set("pessoasEnvolvidas", e.target.value)}
                    aria-invalid={!!errors.pessoasEnvolvidas}
                    className={
                      errors.pessoasEnvolvidas ? "border-destructive" : undefined
                    }
                  />
                  {errors.pessoasEnvolvidas && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.pessoasEnvolvidas}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="custoAtual">Custo atual aproximado</Label>
                  <CurrencyInputBRL
                    id="custoAtual"
                    value={form.custoAtual ? Number(form.custoAtual) : null}
                    onChange={(v) => set("custoAtual", v != null ? String(v) : "")}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-1">
                Custo = estimativa mensal com horas trabalhadas, ferramentas ou
                retrabalho.
              </p>
            </CardContent>
          </Card>
        )}

        {/* 3. OBJETIVO E RESULTADO ESPERADO */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>3. Objetivo e Resultado Esperado</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="objetivo">
                    Em uma frase: que decisão ou ação isso vai apoiar?{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <AIHint
                    value={form.objetivo}
                    onChange={(v) => set("objetivo", v)}
                    context="tap_objective"
                    extraContext={contextoDaSolicitacao("objetivo")}
                  />
                </div>
                <Textarea
                  id="objetivo"
                  rows={4}
                  maxLength={150}
                  value={form.objetivo}
                  onChange={(e) => set("objetivo", e.target.value)}
                  aria-invalid={!!errors.objetivo}
                  className={cn(
                    "resize-none",
                    errors.objetivo && "border-destructive",
                  )}
                />
                {errors.objetivo ? (
                  <p className="text-xs text-destructive mt-1">{errors.objetivo}</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    Ex: &quot;Definir quais clientes focar na cobrança&quot;,
                    &quot;Avaliar desempenho da equipe de vendas&quot;
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="resultado">
                    Que resultado você espera alcançar?{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <AIHint
                    value={form.resultado}
                    onChange={(v) => set("resultado", v)}
                    context="tap_benefits"
                    extraContext={contextoDaSolicitacao("resultado")}
                  />
                </div>
                <Textarea
                  id="resultado"
                  rows={4}
                  maxLength={300}
                  value={form.resultado}
                  onChange={(e) => set("resultado", e.target.value)}
                  aria-invalid={!!errors.resultado}
                  className={cn(
                    "resize-none",
                    errors.resultado && "border-destructive",
                  )}
                />
                {errors.resultado ? (
                  <p className="text-xs text-destructive mt-1">{errors.resultado}</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    Ex: reduzir tempo de fechamento mensal, diminuir erros nos
                    relatórios, tomar decisões mais rápidas
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 4. O QUE VOCÊ ESPERA RECEBER */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>4. O Que Você Espera Receber</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>
                  Que tipo de resultado você quer?{" "}
                  <span className="text-destructive">*</span>{" "}
                  <span className="font-normal text-muted-foreground">
                    (pode marcar várias opções)
                  </span>
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                  {TIPOS_RESULTADO.map((t) => (
                    <div key={t.value} className="flex items-center gap-2">
                      <Checkbox
                        id={`tipo-${t.value}`}
                        checked={form.tipoResultado.includes(t.value)}
                        onCheckedChange={() => toggleInArray("tipoResultado", t.value)}
                      />
                      <Label htmlFor={`tipo-${t.value}`} className="font-normal">
                        {t.label}
                      </Label>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
                    <Checkbox
                      id="tipo-outro"
                      checked={form.tipoResultadoOutroCheck}
                      onCheckedChange={(c) => {
                        const checked = c === true;
                        set("tipoResultadoOutroCheck", checked);
                        if (!checked) set("tipoResultadoOutro", "");
                        // Marcar "Outro" também satisfaz a exigência do grupo.
                        setErrors((prev) =>
                          prev.tipoResultado
                            ? { ...prev, tipoResultado: "" }
                            : prev,
                        );
                      }}
                    />
                    <Label
                      htmlFor="tipo-outro"
                      className="font-normal whitespace-nowrap"
                    >
                      Outro:
                    </Label>
                    {form.tipoResultadoOutroCheck && (
                      <Input
                        className={cn(
                          "flex-1",
                          errors.tipoResultadoOutro && "border-destructive",
                        )}
                        maxLength={150}
                        placeholder="Descreva aqui…"
                        value={form.tipoResultadoOutro}
                        onChange={(e) => set("tipoResultadoOutro", e.target.value)}
                      />
                    )}
                  </div>
                </div>
                {errors.tipoResultado && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.tipoResultado}
                  </p>
                )}
                {errors.tipoResultadoOutro && (
                  <p className="text-xs text-destructive mt-1">
                    {errors.tipoResultadoOutro}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="pergunta1">
                      Que perguntas esse relatório/painel precisa responder?{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <AIHint
                      value={form.pergunta1}
                      onChange={(v) => set("pergunta1", v)}
                      context="generic"
                      extraContext={contextoDaSolicitacao()}
                    />
                  </div>
                  <Textarea
                    id="pergunta1"
                    rows={6}
                    placeholder="Ex: Quanto vendemos por vendedor este mês? Quais clientes estão com pagamento atrasado? Qual produto tem maior margem?"
                    value={form.pergunta1}
                    onChange={(e) => set("pergunta1", e.target.value)}
                    aria-invalid={!!errors.pergunta1}
                    className={errors.pergunta1 ? "border-destructive" : undefined}
                  />
                  {errors.pergunta1 && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.pergunta1}
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="minimoEntregavel">
                      Qual a primeira entrega (mínimo entregável)?{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <AIHint
                      value={form.minimoEntregavel}
                      onChange={(v) => set("minimoEntregavel", v)}
                      context="tap_scope"
                      extraContext={contextoDaSolicitacao()}
                    />
                  </div>
                  <Textarea
                    id="minimoEntregavel"
                    rows={6}
                    value={form.minimoEntregavel}
                    onChange={(e) => set("minimoEntregavel", e.target.value)}
                    aria-invalid={!!errors.minimoEntregavel}
                    className={
                      errors.minimoEntregavel ? "border-destructive" : undefined
                    }
                  />
                  {errors.minimoEntregavel ? (
                    <p className="text-xs text-destructive mt-1">
                      {errors.minimoEntregavel}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">
                      Ex: &quot;Apenas o resumo por vendedor já resolveria&quot;,
                      &quot;Uma tela simples com os 3 indicadores principais&quot;
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 5. PRAZO E URGÊNCIA */}
        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>5. Prazo e Urgência</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="dataNecessaria">
                    Quando você precisa disso funcionando?{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="dataNecessaria"
                    type="date"
                    min={hoje}
                    value={form.dataNecessaria}
                    onChange={(e) => set("dataNecessaria", e.target.value)}
                    aria-invalid={!!errors.dataNecessaria}
                    className={errors.dataNecessaria ? "border-destructive" : undefined}
                  />
                  {errors.dataNecessaria && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.dataNecessaria}
                    </p>
                  )}
                </div>
                <div>
                  <Label>
                    Por que essa data? <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.motivoPrazo}
                    onValueChange={(v) => set("motivoPrazo", v)}
                  >
                    <SelectTrigger
                      aria-invalid={!!errors.motivoPrazo}
                      className={errors.motivoPrazo ? "border-destructive" : undefined}
                    >
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exigencia_legal">
                        Exigência legal/auditoria
                      </SelectItem>
                      <SelectItem value="fechamento_mes">Fechamento do mês</SelectItem>
                      <SelectItem value="meta_empresa">Meta da empresa/área</SelectItem>
                      <SelectItem value="pedido_diretoria">
                        Pedido da diretoria
                      </SelectItem>
                      <SelectItem value="melhorar_trabalho">
                        Melhorar nosso trabalho
                      </SelectItem>
                      <SelectItem value="outro">Outro motivo</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.motivoPrazo && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.motivoPrazo}
                    </p>
                  )}
                </div>
              </div>

              {form.motivoPrazo === "outro" && (
                <div>
                  <Label htmlFor="motivoPrazoOutro">
                    Descreva (Outro) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="motivoPrazoOutro"
                    maxLength={150}
                    value={form.motivoPrazoOutro}
                    onChange={(e) => set("motivoPrazoOutro", e.target.value)}
                    aria-invalid={!!errors.motivoPrazoOutro}
                    className={
                      errors.motivoPrazoOutro ? "border-destructive" : undefined
                    }
                  />
                  {errors.motivoPrazoOutro && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.motivoPrazoOutro}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 6. OBSERVAÇÕES FINAIS */}
        {step === 5 && (
          <Card>
            <CardHeader>
              <CardTitle>6. Observações Finais</CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="observacoes">
                    Informações adicionais importantes:
                  </Label>
                  <AIHint
                    value={form.observacoes}
                    onChange={(v) => set("observacoes", v)}
                    context="generic"
                    extraContext={contextoDaSolicitacao()}
                  />
                </div>
                <Textarea
                  id="observacoes"
                  rows={5}
                  value={form.observacoes}
                  onChange={(e) => set("observacoes", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        )}

        </div>

        {/* Navegação */}
        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={back}
            disabled={step === 0}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Voltar
          </Button>

          <span className="text-xs text-muted-foreground">
            Passo {step + 1} de {STEPS.length}
          </span>

          {isLast ? (
            <Button
              type="button"
              onClick={handleSubmit}
              size="lg"
              className="min-w-44"
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {saveMutation.isPending ? "Enviando…" : "Enviar Solicitação"}
            </Button>
          ) : (
            <Button type="button" onClick={next}>
              Próximo
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
