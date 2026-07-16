/**
 * Rótulos das opções do formulário de Solicitação de Projetos.
 * Compartilhado entre o formulário (/solicitacao) e a visualização de detalhes
 * no Roadmap, para que os valores gravados no banco tenham uma única fonte de tradução.
 */

export const PROBLEMAS = [
  { value: "demora_informacao", label: "Demora muito para ter a informação" },
  { value: "dados_erros", label: "Dados com erros ou desatualizados" },
  { value: "depende_pessoa", label: "Depende de uma pessoa específica" },
  { value: "trabalho_manual", label: "Muito trabalho manual" },
  { value: "nao_acompanhar", label: "Não conseguimos acompanhar no dia a dia" },
] as const;

export const TIPOS_RESULTADO = [
  { value: "relatorio_pdf_excel", label: "Relatório em PDF ou Excel" },
  { value: "painel_graficos", label: "Painel com gráficos na tela" },
  { value: "arquivo_baixar", label: "Arquivo para baixar" },
  { value: "alerta", label: "Alerta quando algo importante acontecer" },
  { value: "indicadores", label: "Indicadores principais da área" },
  { value: "aplicacao_integracao", label: "Uma aplicação ou integração" },
] as const;

export const TIPOS_NECESSIDADE: Record<string, string> = {
  relatorio_novo: "Relatório novo para acompanhamento",
  melhorar_relatorio: "Melhorar relatório que já existe",
  painel_indicadores: "Painel de indicadores (gráficos)",
  automatizar_processo: "Automatizar processo manual",
  cruzar_informacoes: "Cruzar informações de sistemas diferentes",
  desenvolver_aplicacao: "Desenvolver uma aplicação",
  outro: "Outro",
};

export const MOTIVOS_PRAZO: Record<string, string> = {
  exigencia_legal: "Exigência legal/auditoria",
  fechamento_mes: "Fechamento do mês",
  meta_empresa: "Meta da empresa/área",
  pedido_diretoria: "Pedido da diretoria",
  melhorar_trabalho: "Melhorar nosso trabalho",
  outro: "Outro motivo",
};

/** Traduz um valor gravado para seu rótulo; devolve o próprio valor se desconhecido. */
export function labelOf(
  options: readonly { value: string; label: string }[],
  value: string,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}
