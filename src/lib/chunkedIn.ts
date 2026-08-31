/**
 * Consulta em lotes para filtros `.in(...)` com lista longa.
 *
 * O PostgREST recebe `in.(...)` na QUERY STRING, então uma lista de ids vira
 * URL. O proxy à frente do Supabase corta em ~3,7 KB e devolve **502** antes de
 * a requisição chegar ao banco — medido no servidor: 98 ids (3700 chars) passa,
 * 100 ids (3774 chars) falha.
 *
 * Um UUID custa ~37 chars na URL, então ~50 ids ≈ 1,9 KB: metade do limite, com
 * folga se o host mudar.
 *
 * O sintoma é traiçoeiro: funciona no projeto pequeno e quebra no grande, sem
 * nada no log do Postgres (a requisição nunca chega lá). Foi o que derrubou o
 * "Ler todas" das notificações.
 */

export const ID_CHUNK = 50;

export const chunkIds = <T,>(items: T[], size = ID_CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/**
 * QUANDO A LISTA APARECE MAIS DE UMA VEZ NA MESMA URL (31/08/2026)
 *
 * `ID_CHUNK = 50` foi calibrado para UM `.in(...)`: ~50 ids ≈ 1,9 KB, metade do
 * limite. Mas há um padrão em que a mesma lista entra DUAS vezes na query:
 *
 *   .or(`predecessor_id.in.(${batch}),successor_id.in.(${batch})`)
 *
 * Aí o custo por lote dobra, e o lote "seguro" de 50 vira **3.742 chars** —
 * acima dos ~3.700 que o proxy aceita. Medido, não estimado. Resultado: 502, o
 * `selectInChunks` lança, e as quatro telas de dependência mostram
 * "Dependências não carregaram" ao abrir um projeto grande.
 *
 * O sintoma é o mesmo que já derrubou o "Ler todas" das notificações, com um
 * agravante: como estoura por pouco, o projeto pequeno funciona e só o grande
 * quebra — o que faz parecer defeito intermitente.
 *
 * Baixar o `ID_CHUNK` global seria o conserto errado: puniria as dezenas de
 * chamadas com um `.in()` só, dobrando o número de viagens delas sem motivo. O
 * que muda é quem sabe que repete a lista, e é quem repete que declara.
 */
export const chunkIdsFor = <T,>(items: T[], vezesNaUrl: number): T[][] =>
  chunkIds(items, Math.max(1, Math.floor(ID_CHUNK / Math.max(1, vezesNaUrl))));

/**
 * Roda `run` uma vez por lote e concatena os resultados.
 *
 * Lança no primeiro lote com erro — quem chama trata como trataria uma consulta
 * única. Para lista curta (o caso comum) é um único lote, sem custo extra.
 *
 * Uso:
 *   const rows = await selectInChunks(ids, (batch) =>
 *     supabase.from("activities").select("*").in("id", batch)
 *   );
 */
export async function selectInChunks<Row>(
  ids: string[],
  run: (batch: string[]) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
  /**
   * Quantas vezes a lista de ids aparece na URL desta consulta.
   *
   * 1 é o caso normal (um `.in(...)`) e continua sendo o padrão, então nenhuma
   * das chamadas existentes muda de comportamento. Passe 2 quando um `.or(...)`
   * repete o `batch` em dois filtros — senão o lote dobra de tamanho e estoura
   * o limite do proxy.
   */
  vezesNaUrl = 1,
): Promise<Row[]> {
  if (ids.length === 0) return [];
  const out: Row[] = [];
  for (const batch of chunkIdsFor(ids, vezesNaUrl)) {
    const { data, error } = await run(batch);
    if (error) throw new Error(error.message);
    if (data) out.push(...data);
  }
  return out;
}

/**
 * Mesma ideia para ESCRITA (update/delete em massa).
 *
 * Devolve `{ error }` em vez de lançar, para caber onde o código já testa o
 * erro do Supabase. Sequencial de propósito: disparar dezenas de updates
 * simultâneos na mesma tabela troca um problema por outro.
 *
 * Atenção: não é transacional. Se um lote falhar, os anteriores já foram
 * gravados — quem chama deve recarregar os dados em vez de assumir que nada
 * mudou.
 */
export async function mutateInChunks(
  ids: string[],
  run: (batch: string[]) => PromiseLike<{ error: { message: string } | null }>,
): Promise<{ error: { message: string } | null }> {
  if (ids.length === 0) return { error: null };
  for (const batch of chunkIds(ids)) {
    const { error } = await run(batch);
    if (error) return { error };
  }
  return { error: null };
}
