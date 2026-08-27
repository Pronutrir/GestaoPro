# Erros do banco que chegam crus à tela — varredura de 27/08/2026

> Pedido a partir de um relato com captura: a tela mostrava
> `"usuario 0eb3047e-… nao esta na equipe do projeto dcf977e9-… | P0001"`.
> A varredura procura os outros da mesma família.

---

## O que a família tem em comum

Três defeitos na mesma frase:

| | |
|---|---|
| **UUID visível** | quem lê não sabe *quem* nem *qual* |
| **código do Postgres** (`P0001`) | não significa nada fora do banco |
| **sem passo seguinte** | a pessoa entende o problema e não sabe o que fazer |

---

## A contagem: 76 pontos, em 30 arquivos

`description: error.message` — o padrão que despeja o que o banco disser.

| pontos | arquivo |
|---|---|
| 15 | `components/ActivityKanban.tsx` |
| 6 | `components/ProjectFinancials.tsx` |
| 5 | `components/ProjectCharter.tsx` |
| 5 | `components/PeopleManager.tsx` |
| 3 | `components/UserStoryDrawer.tsx` |
| 3 | `components/LessonsLearned.tsx` |
| 3 | `components/HolidaysManager.tsx` |
| 3 | `components/DocumentManager.tsx` |
| 3 | `components/BacklogSection.tsx` |
| ≤2 | e mais 21 arquivos |

---

## As mensagens que o usuário alcança

Separadas das de migration, que só administrador vê:

| mensagem do banco | tem UUID? | traduzida |
|---|---|---|
| `usuario % nao esta na equipe do projeto %` | **sim, dois** | ✅ |
| `Atividade pai (%) não encontrada.` | **sim** | ✅ |
| `Um marco não pode conter subitens (parent %).` | **sim** | ✅ |
| `Aninhamento EAP inválido: uma % não pode conter subitens.` | não | ✅ |
| `Esta atividade tem subitens e não pode ser marcada como marco.` | não | ✅ |
| `A atividade pai pertence a outro projeto.` | não | ✅ |
| `parent_id criaria um ciclo na hierarquia.` | não | ✅ |
| `RACI inválido… Encontrados: %` | não | ✅ |
| `new row violates row-level security policy` | não | ✅ |
| `duplicate key value violates unique constraint` | não | ✅ |

**Três carregavam UUID.** As outras eram legíveis mas técnicas — *"row-level
security policy"* não é frase que se diga a alguém.

---

## O que foi feito

`lib/erroDoBanco.ts` é o funil. Ele:

- **nomeia** pessoa, projeto e atividade a partir do que a tela já tem;
- **remove** UUID e código sempre, mesmo sem dicionário — o id não ajuda quem lê
  e atrapalha quem relata;
- **acrescenta o passo seguinte** (*"Inclua na equipe para poder atribuir"*);
- e para o desconhecido, **limpa em vez de esconder**: *"algo deu errado"* seria
  pior, porque não dá para agir nem relatar.

### Por que a tradução não mora no trigger

O trigger tem os ids em mãos e poderia montar a frase. Mas a mensagem dele
serve a mais de um público — o log do servidor, a API, o próximo script. Trocar
`%` por nome resolveria a tela e **pioraria o log**, onde o id é o que importa.

O banco continua dizendo o fato com precisão; a camada de tela resolve o rótulo.

---

## O que NÃO foi feito, e por quê

**Os 76 pontos não foram convertidos num commit.** Seria uma mudança mecânica
enorme, tocando 30 arquivos, com risco real de engolir erro legítimo em telas
que ninguém está olhando agora.

O funil existe e está ligado no ponto do relato. Os demais migram quando o
arquivo for tocado — e o teste `verificar-erro-do-banco.cjs` trava a regra para
o que passar por ele.

---

## O conserto de verdade é outro

Traduzir resolve metade: a pessoa entende. **`IncluirEAtribuir`** resolve a
outra — o erro **deixa de acontecer**, porque a pessoa é incluída na equipe ali
mesmo, no gesto em que se descobriu que faltava.

Duas perguntas, com os padrões mais restritos (*"Visualizar e comentar"*, *"só
esta atividade e a trilha"*), e uma transação só. Quem não pode gerenciar equipe
vê o motivo e um pedido pronto para copiar — não um botão apagado.
