# "Clico em um e não entra e não salva" — 31/08/2026

> Terceiro relato do mesmo assunto, agora com captura do modal **Editar
> Atividade**: escolher o responsável de uma subatividade não grava, e a tela
> não diz nada.

## Por que os consertos anteriores não resolveram

Os dois primeiros relatos foram atendidos na **tela nova** (`/atividade/:id`).
Esta captura é de **outra tela** — o modal antigo `EditActivityDialog`. E, mais
importante: nenhum dos dois tocou no **banco**.

Aqui a causa é dupla, e consertar um lado sem o outro não entrega nada.

## Lado 1 — a tela não conferia se o banco tinha gravado

```ts
await supabase.from("activities").update(values).eq("id", sub.id);
if (effectiveActivity) fetchSubActivities(effectiveActivity.id);
```

Nem `error`, nem `count`. E um UPDATE recusado pela RLS **volta do PostgREST
como sucesso com zero linhas** — não é erro, é filtro. O código seguia para o
refetch, que relia o valor antigo do banco.

O resultado na tela é literalmente o relatado: o popover fecha, o avatar não
muda, nenhuma mensagem. É a família registrada em *"erro do banco chega como
silêncio"*.

Corrigido nos **dois** pontos da linha da subatividade — o responsável e a
mudança de coluna, que tinha exatamente o mesmo silêncio.

## Lado 2 — o banco recusava mesmo

Este é o achado que importa. `can_update_activity_v2` aceitava **quatro** vias:

1. admin do sistema
2. líder ou gestor do projeto
3. equipe com `can_edit` ou `can_move`
4. ator **da própria atividade** (criador, responsável, participante)

**Nenhuma delas é "responde pelo pai".** Na subatividade do relato, quem
responde pela entrega não é: não é responsável dela — o campo está vazio, que é
a premissa do caso —, não é participante, e é membro *"editar apenas as
minhas"*, logo sem `can_edit`.

Ou seja: a correção da manhã (`canAssign` na tela) **liberava o campo, e o banco
recusava assim mesmo**. A tela prometia o que o banco negava — exatamente o
defeito que o CLAUDE.md manda não repetir, e que a memória do projeto registra
como *"permissão: tela vs RLS"*.

Sem a migration, o conserto do lado 1 apenas trocaria silêncio por uma mensagem
de erro. O usuário continuaria sem conseguir atribuir.

### A quinta via

`responde_pelo_pai_direto(_activity_id, _user_id)` — e ela é **estreita de
propósito**:

- **Um degrau.** Junta filha ao pai, sem recursão. Já existe
  `eh_descendente_de_atividade_do_ator`, que sobe até a raiz — mas ela serve
  **leitura**, e leitura e escrita não merecem o mesmo alcance. Usá-la aqui daria
  ao responsável de uma *fase* poder de escrita em qualquer descendente, o que é
  gerência de projeto — e essa via já é a de número 2.
- **Só o responsável.** `is_activity_actor_v2` incluiria participante e criador.
  Participar da entrega é executar junto; **distribuir** o trabalho é ato de quem
  responde por ela.
- **Compara por id e por texto.** `assigned_to` guarda nome em 657 das 667
  atividades (medido em 26/08), e `assigned_to_id` só existe onde a conversão já
  passou. Só o id recusaria a maioria da base; só o nome erraria com homônimo.

As quatro vias antigas ficam intactas, inclusive a exceção de `can_edit_own` —
cuja leitura já se perdeu uma vez numa reescrita, e por isso a migration falha
alto se ela sumir de novo.

## Estado

A migration está **escrita, não aplicada** — por combinação, eu gero e não rodo
contra produção. **Até ela subir, o comportamento na tela é: mensagem explicando
a recusa, em vez de silêncio.** A atribuição em si só passa a funcionar depois
de aplicada.

Arquivos:
- `20260831120000_responsavel_do_pai_atribui_na_filha.sql`
- `20260831120001_..._rollback.sql` — restaura a regra **antes** de remover a
  função; a ordem inversa deixaria `can_update_activity_v2` chamando algo
  inexistente, e aí **nenhum** update de atividade passaria, em nenhuma das cinco
  vias.

## Trava

`scripts/verificar-atribuir-na-subatividade.cjs` — 16 asserções cobrindo os dois
lados: a conferência de `count` nos dois pontos da tela, e a forma da via nova
(um degrau, só o responsável, comparação dupla, vias antigas preservadas, ordem
do rollback).
