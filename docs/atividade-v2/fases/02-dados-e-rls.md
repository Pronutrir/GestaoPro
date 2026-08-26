# 02 - Dados e RLS  (era Fase 1)

**Objetivo:** a base de tudo. Depois desta fase a regra existe no banco, antes de existir tela.

> **PREMISSA ERRADA - LEIA ANTES.**
>
> Os itens 1, 3 e 4 do prompt original partem de `lider_id`, que **nao existe** neste
> repositorio (0 ocorrencias). O que existe:
>
> | Coluna | Tipo | Papel |
> |---|---|---|
> | `activities.assigned_to` | `TEXT` - uma pessoa | responsavel |
> | `activities.participants` | `text[]` - N pessoas | participantes |
>
> **O modelo-alvo do kit ja esta implementado**, com outros nomes. Criar
> `activity_assignees` nao adiciona capacidade: troca a forma de armazenar, ao custo de
> 284 leituras de `assigned_to` e 13 migrations com funcoes da RLS.
>
> **Decida antes de rodar esta fase** (ver `DIVERGENCIAS.md` item 1 e
> `06-responsaveis-mercado.md`):
>
> - **(A) Manter duas colunas.** Recomendado. Pesquisa em 7 produtos: Jira, Asana e Linear
>   - os tres mais proximos deste sistema - mantem responsavel unico + campo separado de
>   envolvidos, que e a implementacao literal do RACI (um A, varios R). Nesse caso, os itens
>   1, 3 e 4 saem do prompt e sobram os itens 2, 5, 6, 7 e 8, que sao ganho real.
> - **(B) Migrar para `activity_assignees`.** So se houver motivo alem da estetica do
>   esquema. Se for por isso, o plano de 5 fases ja escrito (coluna nova convivendo, RLS
>   lendo as duas por OR, apagar so semanas depois) e o caminho seguro.
>
> **O que vale nos dois casos:** os itens 2, 5, 6, 7 e 8 - watchers, a checagem de equipe no
> banco, as duas views e a visibilidade da subarvore. Nada disso existe hoje.

## Prompt (assumindo a opcao A - duas colunas)

```
Crie uma migration que:

2. Cria activity_watchers(id, activity_id, user_id, origem, created_at) com
   origem em ('criador','atribuicao','comentario','mencao','manual').
   Observador NAO tem efeito nenhum em permissao - e so notificacao.

5. Garante que ninguem coloque em assigned_to nem em participants um
   usuario que nao esteja na equipe do projeto da atividade. Como as duas
   colunas sao TEXTO LIVRE com o nome da pessoa (e parte da base guarda
   UUID), a checagem precisa usar a mesma comparacao tolerante de
   is_activity_actor_v2 - nome, email ou uuid.

6. Cria a view activity_breadcrumb com apenas id, parent_id, wbs_code,
   title e item_type, legivel por quem enxerga qualquer descendente daquele
   no. E por ela que quem so e responsavel de uma atividade ve a trilha sem
   ver as irmas. SEM contadores, SEM horas, SEM custo, SEM responsaveis: um
   "3 subatividades" na trilha entrega a existencia das irmas.

7. A visibilidade por atribuicao alcanca a SUBARVORE da atividade, nao so
   ela: quem e responsavel por 1.1.2 enxerga 1.1.2.1 e 1.1.2.2. Sem isso a
   atividade e inutil, porque o trabalho esta nas filhas.
   A coluna de pai e `parent_id` - NAO existe `parent_activity_id`.

8. Cria a view activity_dependency_card com apenas wbs_code, title,
   item_type e status, legivel por quem enxerga qualquer atividade ligada
   por dependencia. E uma excecao deliberada a regra das irmas: quem esta
   bloqueado precisa saber o que e se ja terminou - e nada alem disso.

A funcao can_update_activity_v2 ja le can_edit_own (migration 20260825150000).
PRESERVE essa leitura. E NAO leve o teste para is_activity_actor_v2: aquele
helper serve tambem can_comment_activity_v2 e as policies de VISIBILIDADE -
gatear ali tiraria o comentario e a leitura de quem e "Visualizar e comentar".
A propria migration tem um bloco DO $$ que falha alto se isso acontecer.

Antes de escrever, mostre a versao atual das funcoes e diga onde a coluna e
consultada.

Escreva tambem a migration de rollback.
```

## Pronto quando

- Um usuario so-responsavel le e muda status pela API direta, e **nao** consegue excluir.
- Um usuario fora da equipe **nao** consegue ser posto como responsavel.
- `activity_breadcrumb` devolve a trilha e nenhuma irma, e nao carrega contador nem soma.
- Quem e responsavel por `1.1.2` le `1.1.2.1`, nao le `1.1.1`, e le o cartao reduzido de
  `1.1.1` quando existe dependencia entre as duas.

## Nao faca

- Nao acrescente colunas a `activity_breadcrumb`. Ela e a unica fresta da regra de visibilidade.
- **Nao apague a leitura de `can_edit_own`** ao reescrever a via do ator. E o erro silencioso
  mais provavel desta fase.
- Nao acrescente contador, soma ou pessoa as views de trilha e de dependencia.
- Nao use `parent_activity_id` - a coluna e `parent_id`. A migration 20260818140000 usou o
  nome errado e so falhou na primeira insercao, porque plpgsql resolve nome em execucao.
