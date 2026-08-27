/**
 * Modelo EAP/WBS do GestãoPro — FONTE ÚNICA DA VERDADE.
 *
 * ============================================================================
 * O QUE O PMI DEFINE (estudado em 11/08/2026)
 *
 * O PMBOK define pacote de trabalho como "o trabalho definido no NÍVEL MAIS
 * BAIXO da estrutura analítica, para o qual custo e duração podem ser
 * estimados e gerenciados". E a regra dos 100% diz que a soma do trabalho no
 * nível filho é 100% do trabalho do pai.
 *
 * A consequência prática: Fase, Entrega e Pacote são POSIÇÕES na árvore, não
 * tipos que alguém escolhe. O mesmo item vira "pacote de trabalho" ou deixa de
 * ser conforme se acrescentem subitens abaixo dele. Só o MARCO é decisão real
 * de quem planeja — é o único que a estrutura não revela sozinha.
 *
 * Por isso o diálogo de edição MOSTRA o papel em vez de perguntá-lo: pedir ao
 * usuário o que o sistema já sabe abria espaço para respostas que contradizem
 * a árvore, e era a origem da confusão entre os quatro nomes.
 *
 * NOMENCLATURA: chamamos de "Atividade" o que o PMI chama de "pacote de
 * trabalho". É o termo que a equipe lê há meses, e o PMBOK não exige o dele.
 * ============================================================================
 *
 * Alinhado ao PMBOK/WBS (decomposição orientada a entregas, profundidade livre)
 * e simplificado para o uso real da plataforma: a INTERFACE trabalha com apenas
 * 3 papéis, evitando a ambiguidade "Pacote × Atividade" que confundia.
 *
 *   • Fase/Entrega — ÚNICO agrupador; pode existir em QUALQUER nível (aninhável).
 *   • Atividade    — folha de trabalho (vai para o Kanban; tem horas/custo/resp.).
 *   • Marco        — folha de controle, sem duração; nunca agrupa.
 *
 * COMPATIBILIDADE COM O BANCO: o banco ainda tem item_type='pacote'
 * (agrupador aninhado) por trás de triggers/migrations. Aqui 'pacote' é tratado
 * como um SINÔNIMO INTERNO de agrupador e SEMPRE exibido como "Fase". Ou seja,
 * o usuário nunca vê nem escolhe "Pacote", mas dados legados com 'pacote'
 * continuam válidos e aparecem como Fase/Entrega.
 *
 * O PAPEL VEM DO NÍVEL DA EAP, quando ele existe:
 *
 *   nível 1 (1, 2, 3…)          → Fase/Entrega
 *   nível 2+ (1.1, 1.1.1, 2.4…) → Atividade
 *
 * É a leitura clássica da EAP — "1. Fase / 1.1 Entrega / 1.1.1 Atividade" — e
 * foi a regra escolhida para a plataforma. Uma Atividade PODE ter subitens: o
 * aninhamento continua livre, o que o nível define é o RÓTULO, não a estrutura.
 * Horas e custo de quem tem filhos seguem somados deles, seja Fase ou Atividade.
 *
 * FALLBACK PELA FUNÇÃO: item sem `wbs_code` (criado direto no Kanban ou no
 * Backlog) não tem nível nenhum — e são a maioria da base. Para esses, vale a
 * regra anterior: quem agrupa aparece como Fase. Sem isso, todo item criado à
 * mão seria tratado como "nível 1" e viraria Fase em massa, deixando de receber
 * horas próprias.
 *
 * Este helper substitui as cópias divergentes de resolveKind que existiam em
 * BacklogSection, ActivityKanban e ProjectCronogramaPanel.
 */

/**
 * Papéis visíveis ao usuário.
 *
 * `fase` e `entrega` são AMBOS agrupadores e gravam item_type='fase' — o que os
 * separa é a posição na EAP, não a função:
 *
 *   Fase    = nível 1 (1, 2, 3…). Etapa do ciclo de vida do projeto.
 *   Entrega = nível 2+ que agrupa (1.1, 1.2.3…). Está DENTRO de uma fase; é o
 *             que ela produz. No PMBOK seria "pacote de trabalho", termo que a
 *             interface não usa por ter confundido antes.
 *
 * Sem essa separação, "1" e "1.1" apareciam os dois como "Fase" e a EAP ficava
 * achatada — a entrega deixava de estar dentro da fase e virava outra fase ao
 * lado dela.
 */
export type EapKind = "projeto" | "fase" | "entrega" | "atividade" | "marco";

/* ────────────────────────────────────────────────────────────────────────────
 * LINHA SINTÉTICA DE FASE
 *
 * Fases vivem na tabela `phases`, não em `activities`. O Cronograma monta uma
 * linha em memória para cada fase, para que ela possa agrupar e indentar junto
 * das atividades — com id "phase:<uuid>" e o sinalizador `__isPhaseRow`.
 *
 * Essa linha NÃO É UMA ATIVIDADE, e tratá-la como se fosse já produziu:
 *
 *   • o painel de edição abrindo com "# phase:d4" e "Criada em Invalid Date";
 *   • o seletor de Tipo dizendo "não tem código EAP nem subitens" — porque
 *     buscar subitens de um id que não existe devolve zero;
 *   • e o pior: SALVAR não gravava nada. O update casa zero linhas, o
 *     PostgREST não devolve erro, e o diálogo anunciava sucesso.
 *
 * As duas checagens são necessárias. O mapa `activityById` do Cronograma monta
 * um stub com o id prefixado mas SEM o sinalizador, então testar só a flag
 * deixaria passar o caso mais difícil de perceber.
 * ──────────────────────────────────────────────────────────────────────────── */

/** É uma linha de fase sintética (não existe em `activities`)? */
export function isSyntheticPhaseRow(row: any): boolean {
  return !!row?.__isPhaseRow || String(row?.id ?? "").startsWith("phase:");
}

/** O id real em `phases`, ou null se não for linha de fase. */
export function phaseIdFromSyntheticRow(row: any): string | null {
  const id = String(row?.id ?? "");
  return id.startsWith("phase:") ? id.slice("phase:".length) : null;
}

/** Entrada mínima para resolver o papel de um item. */
export interface EapItemLike {
  item_type?: string | null;
  is_milestone?: boolean | null;
  /** Código da EAP (1, 1.2, 1.2.3…). Ausente em item criado à mão. */
  wbs_code?: string | null;
}

/**
 * Nível na EAP a partir do código: "1" → 1, "1.2" → 2, "1.2.3" → 3.
 * Devolve null quando não há código válido — aí o papel cai no fallback.
 */
export function eapLevel(wbsCode?: string | null): number | null {
  const raw = (wbsCode ?? "").trim();
  if (!raw) return null;
  // Só numeração pontuada conta. "Anexo A" ou "" não definem nível.
  if (!/^\d+(\.\d+)*$/.test(raw)) return null;
  // "1.0", "2.0.0" são nível 1 com zero decorativo — formato comum em EAP
  // exportada de planilha. Sem descartar os zeros à direita, "1.0" seria lido
  // como nível 2 e a fase do topo viraria atividade.
  const parts = raw.split(".");
  while (parts.length > 1 && parts[parts.length - 1] === "0") parts.pop();
  return parts.length;
}

/* ────────────────────────────────────────────────────────────────────────────
 * QUAL NÍVEL É A FASE — o número que a convenção de numeração decide
 *
 * Hoje a EAP começa nas fases e o projeto fica FORA da numeração:
 *
 *   1        Fase
 *   1.1      Entrega
 *   1.1.1    Atividade
 *
 * A convenção alternativa (decidida em 11/08/2026, ainda não migrada) coloca o
 * projeto no nível 1 e empurra tudo um degrau:
 *
 *   1        Projeto
 *   1.1      Fase
 *   1.1.1    Entrega
 *   1.1.1.1  Atividade
 *
 * A auditoria de 11/08 achou esta regra escrita em QUATRO lugares independentes
 * — `resolveEapKind`, `eapRoleForImport`, o painel de edição e o importador.
 * Trocar o número exigia lembrar dos quatro, e esquecer um produziria uma tela
 * discordando das outras sobre o papel do mesmo item: exatamente o defeito que
 * já custou caro aqui.
 *
 * Agora é UM número. `eapIsFaseLevel` e `eapIsProjectLevel` são a única forma
 * de perguntar, e a migração de convenção passa a ser a troca desta constante
 * mais a renumeração dos dados.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Nível da EAP ocupado pela Fase.
 *
 * 2 desde 11/08/2026: o projeto ocupa o nível 1. Era 1 antes disso, com o
 * projeto fora da numeração. EAPs antigas continuam legíveis — o que muda é o
 * RÓTULO, e o botão "Renumerar EAP" (menu do Backlog) migra projeto a projeto.
 */
export const EAP_FASE_LEVEL = 2;

/** O nível ocupado pelo projeto, quando ele está na numeração. Null se não está. */
export const EAP_PROJECT_LEVEL: number | null =
  EAP_FASE_LEVEL > 1 ? EAP_FASE_LEVEL - 1 : null;

/**
 * O nível do PACOTE DE TRABALHO — logo abaixo da Fase.
 *
 * Existe pelo mesmo motivo de `EAP_PROJECT_LEVEL`: o modelo adotado para todos
 * os projetos é posicional, e cada nível tem um papel fixo —
 *
 *   1  Projeto (escopo total)
 *   2  Fase (macrofase / ciclo de vida)
 *   3  Pacote de trabalho
 *   4+ Atividade
 *
 * Derivado de `EAP_FASE_LEVEL` para que trocar a convenção continue sendo a
 * troca de UM número.
 */
export const EAP_PACOTE_LEVEL = EAP_FASE_LEVEL + 1;

/** Este nível é o da Fase? */
export function eapIsFaseLevel(level: number | null | undefined): boolean {
  return level === EAP_FASE_LEVEL;
}

/** Este nível é o do Pacote de Trabalho? */
export function eapIsPacoteLevel(level: number | null | undefined): boolean {
  return level === EAP_PACOTE_LEVEL;
}

/** Este nível é o do projeto (a raiz que não é trabalho)? */
export function eapIsProjectLevel(level: number | null | undefined): boolean {
  return EAP_PROJECT_LEVEL !== null && level === EAP_PROJECT_LEVEL;
}

/**
 * Código da RAIZ da EAP — "1" quando o projeto está na numeração, null quando
 * não está.
 *
 * Existe para a geração automática saber de onde pendurar um item de topo. Sem
 * isso o gerador emitia inteiros soltos ("1", "2", "3"), o que na convenção
 * nova criaria um segundo projeto ao lado do primeiro.
 *
 * É sempre "1": um projeto tem uma raiz só, e ela não concorre com nada.
 */
export function eapRootCode(): string | null {
  return EAP_PROJECT_LEVEL === null ? null : "1";
}

/* ────────────────────────────────────────────────────────────────────────────
 * MARCO NÃO TEM CÓDIGO EAP
 *
 * Marco é elemento do CRONOGRAMA, não da EAP: um ponto no tempo, sem duração,
 * sem horas e sem custo. A EAP decompõe TRABALHO, e a regra dos 100% diz que os
 * filhos somam 100% do trabalho do pai — somar um marco nessa conta é ruído.
 *
 * Dar código a ele custava duas coisas:
 *
 *   • a numeração do trabalho ganhava buracos. Apagar "1.1.1.3 Marco: TAP
 *     aprovado" deixava um vão entre 1.1.1.2 e 1.1.1.4;
 *   • mover o marco obrigava a renumerar vizinhos, por uma posição que não
 *     representa entrega nenhuma.
 *
 * O marco continua ANCORADO — mantém `parent_id`, que lhe dá contexto e propaga
 * datas. O que ele perde é a numeração: tem posição na ÁRVORE, não na EAP. E
 * pode ficar na raiz, sem pai: "Go-live" é do projeto inteiro, não de uma fase
 * específica (decisão de 11/08/2026).
 * ──────────────────────────────────────────────────────────────────────────── */

/** Marco nunca carrega código EAP. */
export function eapCodeAllowed(item: EapItemLike): boolean {
  return !item?.is_milestone;
}

/**
 * O `wbs_code` que deve ir ao banco: null para marco, o informado para o resto.
 *
 * Todo caminho que grava código passa por aqui. Foi a ausência de um ponto
 * único assim que deixou a regra de nível espalhada em quatro cópias antes.
 */
export function eapCodeToPersist(
  item: EapItemLike,
  code?: string | null,
): string | null {
  if (!eapCodeAllowed(item)) return null;
  const c = (code ?? "").trim();
  return c || null;
}

/**
 * Resolve o papel EAP EXIBIDO de um item.
 *
 * Ordem:
 *  1. is_milestone                       → Marco (vence sempre)
 *  2. tem wbs_code → nível da Fase       → Fase
 *                    abaixo dela         → Entrega (agrupa) ou Atividade
 *  3. sem wbs_code → agrupa              → Entrega
 *                    não agrupa          → Atividade
 *
 * ============================================================================
 * O TIPO É LIDO, NÃO DEDUZIDO (decisão de 27/08/2026)
 *
 * Até 27/08 a fórmula era:
 *
 *     agrupa = item_type IN (fase, pacote)  OR  hasChildren
 *
 * O `OR hasChildren` era o defeito. Ele fazia o papel de um item **mudar
 * sozinho** quando alguém criava a primeira subatividade dele: uma Atividade
 * virava Entrega sem que ninguém tivesse decidido isso. E criava um estado
 * **sem ponto fixo** — gravar o valor exibido produzia um valor exibido
 * diferente, porque o campo entra na própria conta que o produziu.
 *
 * A migration 20260827130000 congelou em `item_type` o que a tela mostrava, e
 * a partir daí o campo é a fonte. `hasChildren` deixou de decidir.
 *
 * O CUSTO, medido e aceito: 14 itens trocaram de rótulo (Entrega → Atividade)
 * — os que tinham `item_type='fase'` sem código EAP e sem filhas. Estão
 * listados um a um em `docs/medicoes/os-14-que-mudam-de-rotulo-27-08-2026.md`.
 *
 * `pacote` continua na lista por compatibilidade: é o agrupador legado, sempre
 * exibido como Fase/Entrega, e ainda existe em dados antigos.
 *
 * `hasChildren` PERMANECE NA ASSINATURA de propósito, e ignorado. São 11 pontos
 * de chamada; removê-lo agora seria uma mudança mecânica grande sem ganho, e o
 * parâmetro documenta que ter filhas **não decide mais** o papel de ninguém.
 * Duas das chamadas passavam constante (ActivityDetailPanel.tsx:77,
 * ProjectCronogramaPanel.tsx:3156) e por isso exibiam papel errado — agora dá
 * no mesmo, que é a prova de que o valor parou de importar.
 * ============================================================================
 */
export function resolveEapKind(item: EapItemLike, _hasChildren = false): EapKind {
  if (item.is_milestone) return "marco";

  /**
   * ============================================================================
   * O NÍVEL NÃO DECIDE MAIS NADA (27/08/2026) — a segunda cirurgia
   *
   * Até aqui havia um bloco que lia `eapLevel(wbs_code)` e devolvia o papel
   * pela POSIÇÃO, antes de olhar o campo:
   *
   *     nível 1 → 'projeto'    nível 2 → 'fase'    nível 3 → 'entrega'
   *
   * Ele estava certo quando `item_type` era lixo de importação — a posição era
   * a única informação confiável. O congelamento derrubou essa premissa, e
   * então o bloco passou a fazer o oposto do que devia: **ignorar o campo que
   * agora é a fonte**.
   *
   * O QUE ISSO CUSTAVA, medido: um item de nível 3 gravado como 'atividade'
   * exibia **Entrega** — agrupador, portanto sem cartão no quadro. Eram **67
   * folhas** de trabalho promovidas e invisíveis, 64 delas no quadro naquele
   * momento. A migration dos 68 já as tinha corrigido no banco, e a tela
   * continuava sem consultá-las.
   *
   * É a mesma cirurgia do `OR hasChildren`, agora no nível. O padrão dos dois
   * defeitos é idêntico: uma heurística que existia para suprir a ausência do
   * campo, e que sobreviveu ao campo passar a existir.
   *
   * MEDIDO ANTES DE APLICAR (docs/medicoes/tirar-a-deducao-por-nivel-27-08-2026.md):
   *
   *   mudam de papel .......... 448 de 8.199   (111 no quadro)
   *     fase → entrega ......... 359  troca rótulo, não natureza — as duas agrupam
   *     entrega → atividade ..... 56
   *     projeto → entrega ....... 16
   *     fase → atividade ........ 11
   *     projeto → atividade ...... 6
   *   DEIXAM de ser agrupador ... 67  ← viram cartão; é o ganho
   *   pais que virariam folha .... 0  ← risco estrutural nulo
   *
   * `eapLevel` e as constantes de nível CONTINUAM existindo e sendo usadas —
   * pela numeração da EAP, pela importação e pelo aviso "pela estrutura este
   * item seria X". O que saiu foi o nível decidir o PAPEL EXIBIDO.
   * ============================================================================
   */
  const t = (item.item_type || "").trim().toLowerCase();
  const agrupa = t === "fase" || t === "entrega" || t === "pacote";

  return agrupa ? "entrega" : "atividade";
}

/** Só os agrupadores — Fase (nível 1) e Entrega (abaixo dela). */
export function eapCanGroup(kind: EapKind): boolean {
  return kind === "fase" || kind === "entrega";
}

/**
 * PODE TER FILHAS? — o espelho exato de `eap_is_group()` no Postgres.
 *
 * ============================================================================
 * NÃO CONFUNDIR COM `eapCanGroup`. São perguntas diferentes:
 *
 *   eapCanGroup(kind)    "este item é uma CAIXA?" — decide faixa × cartão no
 *                        quadro, ícone no backlog, seleção em cascata.
 *   eapPodeSerPai(item)  "o banco aceita pendurar algo aqui?" — decide destino
 *                        de movimentação e criação de subitem.
 *
 * Uma Atividade responde **não** à primeira e **sim** à segunda: ela é
 * trabalho, não caixa, mas pode ter subatividades. Foi exatamente essa
 * distinção que faltava até 27/08/2026 — havia uma pergunta só, e ela
 * respondia errado a uma das duas.
 *
 * DESDE 27/08 A REGRA É UMA EXCEÇÃO, NÃO UMA LISTA: todo item pode ser pai,
 * menos marco. Antes era `IN (fase, pacote, historia_usuario)`, o que proibia
 * subatividade sob atividade — e por isso existiam zero na base inteira.
 *
 * O desenho depende disso: o "+ Subatividade" da tela nova, o contador no
 * cartão, o total derivado das filhas. Deixou de ser arriscado quando o tipo
 * passou a ser gravado — uma Atividade com filhas continua Atividade.
 *
 * `verificar-agrupador-aceito-no-banco.cjs` compara esta função com a lista da
 * migration e falha se divergirem.
 * ============================================================================
 */
export function eapPodeSerPai(item: Pick<EapItemLike, "is_milestone">): boolean {
  return !item.is_milestone;
}

/** Folhas (não agrupam). */
export function eapIsLeaf(kind: EapKind): boolean {
  return !eapCanGroup(kind);
}

/**
 * Marco pode ser escolhido? É a única restrição REAL de tipo, e a única que as
 * três telas precisam concordar: marco é folha de controle e não agrupa, então
 * um item com subitens não pode virar marco. O trigger do banco também recusa.
 *
 * Substitui `eapTypeOptions`, que devolvia a lista inteira de opções e não era
 * chamada por ninguém: prometia decidir Fase × Entrega pelo nível, enquanto a
 * criação (sem código ainda) decide pelo destino e a edição mostra os quatro
 * papéis de propósito, avisando em vez de bloquear. Uma função que nenhuma tela
 * podia obedecer não era fonte única — era uma quarta regra.
 */
export function eapMilestoneAllowed(hasChildren: boolean): boolean {
  return !hasChildren;
}

/** Motivo a exibir quando Marco está bloqueado. Null quando é permitido. */
export function eapMilestoneBlockedReason(hasChildren: boolean): string | null {
  return hasChildren ? "Este item tem subitens; Marco não agrupa." : null;
}

/** Rótulos canônicos para a UI. */
export const EAP_LABELS: Record<EapKind, string> = {
  projeto: "Projeto",
  fase: "Fase",
  entrega: "Entrega",
  atividade: "Atividade",
  marco: "Marco",
};

/**
 * Dica de UMA LINHA para cada papel. Fica aqui porque as três telas que
 * escolhem tipo (criação rápida, edição, importação) descreviam o mesmo papel
 * com palavras diferentes — e a divergência é o que confunde quem planeja.
 */
export const EAP_HINTS: Record<EapKind, string> = {
  projeto: "Raiz da EAP (nível 1). É o projeto inteiro — não se cria nem se edita aqui.",
  fase: "Nível 1 da EAP (1, 2, 3…). Agrupa entregas.",
  entrega: "Agrupador abaixo da fase (1.1, 1.2…). Contém atividades.",
  atividade: "Trabalho executável: vai ao Kanban, tem horas e responsável.",
  marco: "Ponto único no tempo (uma data, sem intervalo). Não tem horas nem custo.",
};

/**
 * Marco declarado pelo TÍTULO, do jeito que se escreve numa EAP colada.
 *
 * "Marco: TAP aprovado" · "Milestone – kickoff" · "🏁 Go-live" · "[M] Aprovação"
 *
 * É a única forma de declarar marco na importação: a EAP colada tem código e
 * título, e não há coluna que carregue "é marco". A regra vivia dentro do
 * diálogo de importação e não era mencionada em lugar nenhum da tela — está
 * aqui para que a tela possa DOCUMENTÁ-LA a partir da mesma fonte que a aplica.
 */
export function eapTitleDeclaresMilestone(titulo: string): boolean {
  const t = (titulo || "").trim();
  if (!t) return false;
  // NO COMEÇO do título, não em qualquer posição. Aceitar a palavra no meio
  // fez "Aprovar TAP Marco M1 — TAP aprovado" (título formado ao anexar uma
  // linha solta ao item de cima) virar Marco: a atividade "1.1.1.11 Aprovar
  // TAP" mudou de papel por causa de texto que nem era dela.
  //
  // Quem declara marco escreve "Marco: entrega X" ou "Milestone – kickoff" —
  // sempre abrindo o título. No meio da frase a palavra é descritiva
  // ("Revisar o marco contratual"), e tratá-la como declaração inverte o
  // sentido do que a pessoa escreveu.
  return /^(marco|milestone)(\s|:|-|–|—|$)/i.test(t) || /^(🏁|\[m\])/i.test(t);
}

/**
 * item_type + is_milestone a gravar para cada papel escolhido.
 *
 * O agrupador é gravado como item_type='fase'. Para PROMOVER uma folha que
 * ganhou subitens sem trocar o rótulo de topo, prefira `eapGroupPersisted`,
 * que respeita o 'pacote' legado quando o banco ainda exige/aceita.
 */
/**
 * Papel de um item IMPORTADO, a partir de nível + filhos + título.
 *
 * A ordem não é negociável, e as duas primeiras regras vencem a palavra-chave:
 *
 *   nível 1        → Fase      (topo da EAP é fase, sempre)
 *   tem filhos     → Entrega   (marco não agrupa)
 *   título declara → Marco
 *   senão          → Atividade
 *
 * "Quem tem filhos nunca é marco" é proposital: EAPs reais usam
 * "Milestone 1 - Lançamento" como nome da FASE, e tratar isso como marco
 * quebrava o agrupamento — os filhos ficavam sem pai visível no Backlog e no
 * Cronograma.
 */
export function eapRoleForImport(opts: {
  depth: number;
  hasChildren: boolean;
  title: string;
  /** O código veio ESCRITO no texto colado? Falso quando o parser o inventou
   *  a partir do recuo (lista sem numeração). */
  codigoExplicito?: boolean;
}): EapKind {
  // Marco vence quando o código foi INVENTADO pelo parser.
  //
  // "A posição vence a palavra-chave" existe para EAP numerada, onde escrever
  // "1.2" é decisão de quem planeja — e EAPs reais nomeiam fases como
  // "Milestone 1 - Lançamento". Numa lista sem números o código é palpite do
  // parser: deixá-lo vencer a palavra que a pessoa DIGITOU inverte quem manda.
  // Digitar "Marco M2 — Kick-off" e ver "Fase" na prévia não tem explicação.
  const inventado = opts.codigoExplicito === false;
  if (inventado && !opts.hasChildren && eapTitleDeclaresMilestone(opts.title)) return "marco";

  // eapIsFaseLevel em vez de `depth === 1`: era a segunda cópia da regra de
  // nível, e uma cópia que discorda das outras faz a mesma EAP ter papéis
  // diferentes na importação e no Backlog.
  if (eapIsProjectLevel(opts.depth)) return "projeto";
  if (eapIsFaseLevel(opts.depth)) return "fase";
  /**
   * PACOTE É POSIÇÃO, NÃO CONTEÚDO (24/08/2026).
   *
   * Era `if (opts.hasChildren) return "entrega"`, e o nível 3 sem filhos caía
   * em "atividade". O efeito no relato: importando a mesma EAP, 1.2.2 e 1.2.3
   * viravam pacote (têm filhos) enquanto 1.1.1, 1.1.2 e 1.2.1 viravam
   * atividade solta — a estrutura chegava diferente da que a prévia mostrava.
   *
   * O modelo adotado é posicional, e o nível 2 já era decidido assim. Manter o
   * nível 3 decidido por conteúdo dava DOIS significados à mesma posição da
   * EAP, conforme alguém tivesse detalhado ou não — e a estrutura mudava
   * sozinha ao criar a primeira sub-atividade.
   *
   * Marco continua vencendo: quem escreve "Milestone 1" está declarando um
   * ponto no tempo, não uma caixa a preencher.
   */
  if (eapIsPacoteLevel(opts.depth)) {
    if (!opts.hasChildren && eapTitleDeclaresMilestone(opts.title)) return "marco";
    return "entrega";
  }
  if (opts.hasChildren) return "entrega";
  if (eapTitleDeclaresMilestone(opts.title)) return "marco";
  return "atividade";
}

export function eapToPersisted(kind: EapKind): { item_type: "fase" | "atividade"; is_milestone: boolean } {
  if (kind === "marco") return { item_type: "atividade", is_milestone: true };
  // Fase e Entrega gravam igual: os dois agrupam, e o trigger eap_nesting_rule
  // só aceita 'fase'/'pacote' como pai. O que os distingue é o nível, lido do
  // wbs_code na hora de exibir — não um valor diferente no banco.
  if (kind === "fase" || kind === "entrega") return { item_type: "fase", is_milestone: false };
  return { item_type: "atividade", is_milestone: false };
}

/* ────────────────────────────────────────────────────────────────────────────
 * MOVER ITEM NA EAP — validação compartilhada pelas três vias
 *
 * As três telas que reorganizam a EAP (campo "Dentro de" na edição, menu de
 * linha no Backlog, arraste no Kanban) validam AQUI, e não cada uma na sua.
 * Uma cópia divergente é o caminho para uma tela aceitar o que a outra recusa.
 *
 * O estrago que importa é o CICLO: se A vira filha de B e B já descende de A,
 * o par inteiro se desliga da raiz e some das três telas de uma vez. O banco
 * barra (trigger trg_validate_activity_hierarchy), mas só depois do clique —
 * validar antes evita o erro cru e permite explicar o motivo.
 *
 * Toda travessia usa Set de visitados: se o dado JÁ estiver com um ciclo
 * (gravado antes desta validação existir), percorrer sem isso trava a aba.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Entrada mínima para validar um movimento. */
export interface EapNodeLike extends EapItemLike {
  id: string;
  parent_id?: string | null;
}

/**
 * Profundidade a partir da qual a interface avisa (sem impedir).
 *
 * O PMBOK não fixa número: decomponha até poder estimar custo e duração e
 * designar um responsável. A literatura converge em 3 a 5 níveis de trabalho, e
 * a regra 8/80 (pacote entre 8 e 80 horas) é o teste prático.
 *
 * O número aqui conta NÍVEIS DA ÁRVORE, então acompanha a convenção: quando o
 * projeto entra na numeração, ele consome um nível que não é trabalho, e o
 * orçamento de decomposição real fica um degrau abaixo. Somar EAP_PROJECT_LEVEL
 * mantém o MESMO rigor nas duas convenções, em vez de apertar sozinho.
 *
 * Sem isso, uma EAP saudável — projeto → fase → entrega → atividade →
 * subatividade — dispararia alerta sem nenhum excesso, e um aviso que aparece
 * no caso normal é um aviso que as pessoas aprendem a ignorar.
 *
 * BLOQUEAR está fora de questão: a base já tem árvores de 6 níveis, e travar
 * impediria de mover justamente os itens que precisam ser consertados.
 */
const EAP_DEPTH_WARN_TRABALHO = 5;

export const EAP_DEPTH_WARN =
  EAP_DEPTH_WARN_TRABALHO + (EAP_PROJECT_LEVEL ?? 0);

export type EapMoveBlockReason = "self" | "cycle" | "milestone-parent" | "not-found" | "other-project";

export interface EapMoveCheck {
  /** false ⇒ o movimento não pode ser gravado (o banco também recusaria). */
  ok: boolean;
  reason?: EapMoveBlockReason;
  /** Mensagem pronta para o usuário — o motivo, não o código do erro. */
  message?: string;
  /** Profundidade que o item passaria a ter (1 = raiz). */
  depth?: number;
  /** Preenchido quando passa de EAP_DEPTH_WARN: avisa, mas `ok` continua true. */
  warning?: string;
}

/**
 * Um item promovido a agrupador deve voltar a ser folha agora que perdeu os filhos?
 *
 * Criar a primeira subatividade PROMOVE o pai a `item_type='fase'` — a regra de
 * aninhamento do banco exige agrupador para aceitar filho. Só que nada desfazia
 * isso quando o último filho saía: o item ficava com cara de agrupador (cubo
 * azul, rótulo Fase/Entrega) sem ter nada dentro, para sempre. A promoção era
 * definitiva por omissão, não por decisão.
 *
 * NÃO rebaixa quem é agrupador por vontade do usuário: um item com código EAP
 * de nível 1 ("1", "2") é uma Fase declarada e continua Fase mesmo vazia —
 * esvaziar uma fase é normal no meio do planejamento. O rebaixamento existe só
 * para desfazer a promoção automática.
 *
 * @param item         o PAI, depois da remoção
 * @param aindaTemFilhos se sobrou algum filho não arquivado
 */
export function eapShouldDemote(item: EapItemLike, aindaTemFilhos: boolean): boolean {
  if (aindaTemFilhos) return false;

  const t = (item.item_type || "").trim().toLowerCase();
  if (t !== "fase" && t !== "pacote") return false; // já é folha

  // Fase ou Entrega DECLARADA pelo usuário permanece como está.
  //
  // Antes a proteção era só para o nível 1. Estava errado, e o efeito era
  // grave: uma fase criada à mão (sem código EAP ainda) perdia o papel assim
  // que ficasse temporariamente sem filhos — granular a EAP movendo um item
  // fazia a fase inteira sumir do agrupamento. Relatado em 11/08.
  //
  // Agora QUALQUER item com código EAP válido é considerado declarado: quem
  // digitou "1", "1.2" ou "2.1.3" disse onde ele está na estrutura, e essa
  // afirmação não se desfaz porque o último filho saiu — a fase esvaziada é
  // estado normal no meio do planejamento.
  //
  // Sobra o caso que o rebaixamento existe para tratar: item SEM código, que
  // virou agrupador só porque alguém criou uma subatividade nele. Aí a
  // promoção foi mesmo automática, e desfazê-la ao esvaziar é correto.
  if (eapLevel(item.wbs_code) !== null) return false;

  return true;
}

/** Índice por id, para as travessias não varrerem a lista a cada salto. */
function indexById<T extends EapNodeLike>(nodes: T[]): Map<string, T> {
  const map = new Map<string, T>();
  nodes.forEach((n) => map.set(n.id, n));
  return map;
}

/**
 * Todos os descendentes de `rootIds` (sem incluir os próprios).
 *
 * É o conjunto que NÃO pode ser destino: mover um item para dentro da própria
 * subárvore é exatamente o ciclo que desliga os dois da raiz.
 */
export function eapDescendantIds(nodes: EapNodeLike[], rootIds: string[]): Set<string> {
  const childrenBy = new Map<string, string[]>();
  nodes.forEach((n) => {
    if (!n.parent_id) return;
    const arr = childrenBy.get(n.parent_id) || [];
    arr.push(n.id);
    childrenBy.set(n.parent_id, arr);
  });

  const found = new Set<string>();
  const stack = [...rootIds];
  const seen = new Set<string>(rootIds); // anti-ciclo: dado já corrompido não trava a UI
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const childId of childrenBy.get(current) || []) {
      if (seen.has(childId)) continue;
      seen.add(childId);
      found.add(childId);
      stack.push(childId);
    }
  }
  return found;
}

/**
 * Profundidade do item na árvore: 1 = raiz, 2 = filho de raiz, e assim por diante.
 * Conta pelo `parent_id` real, não pelo wbs_code (que pode faltar).
 */
export function eapDepthOf(nodes: EapNodeLike[], id: string): number {
  const byId = indexById(nodes);
  let depth = 1;
  let current = byId.get(id);
  const seen = new Set<string>([id]);
  while (current?.parent_id) {
    if (seen.has(current.parent_id)) break; // ciclo pré-existente: para em vez de girar
    seen.add(current.parent_id);
    const parent = byId.get(current.parent_id);
    if (!parent) break; // pai fora da lista carregada (filtro/paginação) — não conta a mais
    depth += 1;
    current = parent;
  }
  return depth;
}

/** Altura da subárvore: 1 quando o item é folha. */
function subtreeHeight(nodes: EapNodeLike[], rootId: string): number {
  const childrenBy = new Map<string, string[]>();
  nodes.forEach((n) => {
    if (!n.parent_id) return;
    const arr = childrenBy.get(n.parent_id) || [];
    arr.push(n.id);
    childrenBy.set(n.parent_id, arr);
  });

  let height = 1;
  let frontier = [rootId];
  const seen = new Set<string>([rootId]);
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const childId of childrenBy.get(id) || []) {
        if (seen.has(childId)) continue;
        seen.add(childId);
        next.push(childId);
      }
    }
    if (next.length > 0) height += 1;
    frontier = next;
  }
  return height;
}

/**
 * Pode `movingIds` virar filho de `targetParentId`?
 *
 * `targetParentId = null` significa "soltar na raiz" — sempre permitido.
 * O aviso de profundidade considera a subárvore INTEIRA que vai junto: mover um
 * ramo de 3 níveis para dentro do nível 4 chega ao 6, mesmo que o item movido
 * sozinho parecesse raso.
 */
export function eapCanMoveInto(
  nodes: EapNodeLike[],
  movingIds: string[],
  targetParentId: string | null,
): EapMoveCheck {
  if (movingIds.length === 0) return { ok: false, reason: "not-found", message: "Nenhum item selecionado." };
  if (targetParentId === null) return { ok: true, depth: 1 };

  if (movingIds.includes(targetParentId)) {
    return {
      ok: false,
      reason: "self",
      message: "Um item não pode ficar dentro de si mesmo.",
    };
  }

  const byId = indexById(nodes);
  const target = byId.get(targetParentId);
  if (!target) {
    return {
      ok: false,
      reason: "not-found",
      message: "O item de destino não foi encontrado neste projeto.",
    };
  }

  // ── A MESMA REGRA DO BANCO, e a mesma frase ──────────────────────────────
  //
  // `eapPodeSerPai` espelha `eap_is_group()` do Postgres, e a mensagem é
  // literalmente a que o trigger devolve. As duas listas divergiram uma vez e
  // ninguém percebeu: a tela dizia "escolha uma fase, entrega ou ATIVIDADE" e
  // o banco recusava atividade, porque `eap_is_group` era
  // `IN (fase, pacote, historia_usuario)`. Ninguém esbarrou nisso porque não
  // havia como criar a situação — mas era divergência latente, e o usuário
  // teria descoberto no clique, com um erro cru.
  //
  // Se as duas voltarem a divergir, `verificar-agrupador-aceito-no-banco.cjs`
  // falha antes de chegar à VM.
  if (!eapPodeSerPai(target)) {
    return {
      ok: false,
      reason: "milestone-parent",
      message: "Marco não agrupa: escolha uma fase, entrega ou atividade como destino.",
    };
  }

  const descendants = eapDescendantIds(nodes, movingIds);
  if (descendants.has(targetParentId)) {
    return {
      ok: false,
      reason: "cycle",
      message: "Esse destino está dentro do item que você está movendo — os dois sumiriam da EAP.",
    };
  }

  // Profundidade final = onde o pai está + o ramo mais alto que vai junto.
  const parentDepth = eapDepthOf(nodes, targetParentId);
  const tallest = Math.max(...movingIds.map((id) => subtreeHeight(nodes, id)));
  const depth = parentDepth + tallest;

  if (depth > EAP_DEPTH_WARN) {
    return {
      ok: true,
      depth,
      warning: `A EAP chegaria ao nível ${depth}. Acima de ${EAP_DEPTH_WARN} níveis ela fica difícil de ler — considere agrupar antes.`,
    };
  }

  return { ok: true, depth };
}
