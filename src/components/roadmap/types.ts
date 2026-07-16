export interface RoadmapItem {
  id: string;
  title: string;
  description: string | null;
  theme: string;
  status: string;

  /**
   * Critérios de priorização (1-5 cada). Nulos enquanto a demanda não é
   * classificada — nesse caso `score` também é nulo.
   */
  alinhamento_estrategico: number | null;
  valor_economico: number | null;
  impacto_paciente: number | null;
  urgencia_risco: number | null;
  facilidade_desenvolvimento: number | null;
  /** Índice de prioridade em % (0-100) — coluna gerada no banco. */
  score: number | null;
  /** Custo estimado do desenvolvimento, informado na classificação. */
  custo_desenvolvimento?: number | null;
  /** Preenchido quando o item é classificado; null = ainda não avaliado. */
  classificado_em?: string | null;

  target_quarter: string | null;
  project_id: string | null;
  created_at: string;

  /** "formulario" (Solicitação de Projetos) ou "interno" (ideia criada no Drawer). */
  origem?: string | null;

  // Campos preenchidos apenas por itens vindos do formulário /solicitacao.
  solicitante_nome?: string | null;
  solicitante_email?: string | null;
  solicitante_cargo?: string | null;
  area?: string | null;
  tipo_necessidade?: string | null;
  tipo_necessidade_outro?: string | null;
  processo_atual?: string | null;
  problemas?: string[] | null;
  problemas_outro?: string | null;
  horas_semana?: number | null;
  pessoas_envolvidas?: number | null;
  custo_atual?: number | null;
  resultado_esperado?: string | null;
  tipos_resultado?: string[] | null;
  tipos_resultado_outro?: string | null;
  perguntas?: string | null;
  minimo_entregavel?: string | null;
  data_necessaria?: string | null;
  motivo_prazo?: string | null;
  motivo_prazo_outro?: string | null;
  observacoes?: string | null;
  created_by?: string | null;
}
