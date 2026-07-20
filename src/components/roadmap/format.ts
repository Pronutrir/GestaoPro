/**
 * Formatadores compartilhados entre a listagem do roadmap e o detalhe do item.
 * Ficavam privados em RoadmapItemDetails; foram extraídos para que a tabela
 * exiba custo e prazo exatamente com a mesma formatação do detalhe.
 */

/**
 * Formata uma data ISO em pt-BR. Retorna null para datas ausentes ou inválidas
 * — o banco aceita anos de 5 dígitos (ex.: '55555-05-05' digitado no
 * formulário), e sem essa guarda a UI exibia "Invalid Date".
 */
export const dateBR = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("pt-BR");
};

export const moneyBR = (v?: number | null) =>
  v === null || v === undefined
    ? null
    : v.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      });

/**
 * Só o número, sem o símbolo — para tabelas onde "R$" fica numa coluna fixa e
 * o valor noutra. Alinhar `R$ 300` e `R$ 12.000` inteiros à direita deixa o
 * "R$" saltando de posição a cada linha; separando-os, a moeda fica estável e
 * os dígitos alinham pela unidade.
 */
export const moneyValueBR = (v?: number | null) =>
  v === null || v === undefined
    ? null
    : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

/** Dias até a data pedida (negativo = vencida). */
export function diasRestantes(iso?: string | null): number | null {
  if (!iso) return null;
  const alvo = new Date(`${iso}T00:00:00`).getTime();
  if (Number.isNaN(alvo)) return null;
  const hoje = new Date().setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / 86_400_000);
}
