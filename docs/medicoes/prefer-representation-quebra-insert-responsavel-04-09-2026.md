# Bug latente: `Prefer: return=representation` quebra o INSERT do responsável

Achado no reteste de 04/09/2026 (checklist do perfil "Editar apenas as minhas",
correção `fix/correcoes_4`). Não corrigido — não dispara hoje, registrado para
quando alguém for mexer em `can_create_activity_v2` de novo ou encadear
`.select()` num `.insert()` de `activities`.

## O problema

`pode_ler_atividade_v2` (migration `20260826150000_p00_escopo_de_leitura_da_atividade.sql`)
é `STABLE` e busca a linha por `id`:

```sql
CREATE OR REPLACE FUNCTION public.pode_ler_atividade_v2(_activity_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
...
  SELECT EXISTS (
    SELECT 1 FROM public.activities a WHERE a.id = _activity_id ...
```

Ela é a policy de `SELECT` em `activities`. Quando o Supabase recebe
`Prefer: return=representation` (o cabeçalho que o `postgrest-js` manda sempre
que você encadeia `.select()` depois de `.insert()`), o Postgres executa o
`INSERT ... RETURNING *`, e o `RETURNING` reavalia a policy de `SELECT` para
decidir se devolve a linha.

Uma função `STABLE` enxerga o mesmo snapshot durante toda a instrução SQL —
inclusive dentro do mesmo `INSERT ... RETURNING`. No momento em que
`pode_ler_atividade_v2` roda, a linha nova ainda não existe nesse snapshot (o
`RETURNING` só materializa depois). Resultado: a busca por `id` não acha nada,
`EXISTS` dá falso, a policy de leitura recusa, e o Postgres devolve
`42501 (insufficient privilege)` — mesmo com o `INSERT` em si totalmente
autorizado pela policy de `INSERT` (`can_create_activity_v2`).

## Por que não quebra hoje

`aoCriarSubatividade` (`[activityId]/page.tsx`) e os outros pontos que criam
atividade fazem:

```ts
const { error } = await supabase.from("activities").insert({ ... } as never);
```

Sem `.select()` encadeado — o `postgrest-js` não manda
`Prefer: return=representation` nesse caso, só `Prefer: return=minimal`. O
`INSERT` roda sem `RETURNING`, a policy de leitura nunca entra em jogo, e tudo
funciona.

## Quando isso vai quebrar

No dia em que alguém escrever:

```ts
const { data, error } = await supabase.from("activities")
  .insert({ ... }).select().single();
```

para pegar o `id` da linha recém-criada sem precisar de um segundo round-trip
— um padrão comum e razoável — o INSERT vai devolver `403/42501` mesmo para
quem tinha toda a permissão de criar.

## Correções possíveis (não aplicadas)

1. **Trocar `STABLE` por `VOLATILE`** em `pode_ler_atividade_v2` — correto,
   mas mexe numa função `SECURITY DEFINER` usada em toda leitura de atividade;
   precisa de medição de custo (perde a chance de cache de plano/execução
   dentro da mesma query) antes de ir para produção.
2. **Nunca encadear `.select()` depois de `.insert()` em `activities`** —
   convenção de código, zero risco, mas depende de todo mundo lembrar; não
   é auto-aplicável nem pega em `tsc`/lint hoje.
3. **Buscar o `id` num segundo `SELECT` separado** (por algum outro critério
   que não dependa do `RETURNING` da mesma instrução) quando for preciso o
   `id` da linha nova.

Nenhuma foi aplicada — a decisão foi documentar e não mexer na função `STABLE`
sem medir o impacto, já que hoje nada está quebrado.
