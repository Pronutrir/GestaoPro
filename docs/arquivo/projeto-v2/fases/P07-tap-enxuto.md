# P07 · TAP enxuto, e aprovar cria a base

**Onda 2** · o TAP tem 23 campos e vários já existem no projeto

O próprio TAP reconhece: *"1 campo(s) podem ser preenchidos com o que o sistema já sabe"*.
São mais que um.

## Prompt

```
1. Separe os 23 campos do TAP em dois grupos:
   - LIDOS do projeto, não digitados: título, gestor, líder, código,
     prioridade, data de início, término previsto, orçamento previsto,
     equipe. Aparecem no TAP como valor, com a origem indicada, e mudam
     quando o projeto muda.
   - DECISÃO humana, que só existem no TAP: problema/justificativa,
     objetivo SMART, escopo, fora do escopo, premissas, restrições,
     benefícios, critérios de sucesso, RACI, nível de autoridade,
     patrocinador.
   Mostre a lista dos dois grupos antes de alterar.

2. A barra "4 de 23 campos" passa a contar só o segundo grupo — o que
   depende de alguém decidir. Contar campo que o sistema preenche sozinho
   infla o progresso.

3. APROVAR O TAP cria a linha de base v1 de prazo e custo (P06 e P05), e
   registra as aprovações formais que a seção 9 já prevê.

4. Depois de aprovado, os campos que viraram compromisso ficam só de
   leitura. Mudá-los exige requisição de mudança (P08).

5. O PDF passa a marcar a versão da base e a data de aprovação.

RACI é RÓTULO, não permissão — está escrito na migration 20260818170000:
"papel na governanca (R/A/C/I) -- rotulo, NAO permissao". Quem decide acesso
são as colunas can_*. Não faça o RACI conceder nada ao ser preenchido.

O "gestor" lido do projeto é `projects.manager`, e ele JÁ concede acesso
(is_project_leader_v2). Mostrar no TAP não muda isso — mas deixe explícito
no rótulo, senão parece que o TAP é que dá o acesso.
```

## Pronto quando

Aprovar o TAP cria a base, e os campos de compromisso ficam travados. E a contagem de campos
reflete o que falta decidir, não o que o sistema já sabe.

## Não faça

- Não duplique dado. Campo lido do projeto **não** vira cópia no TAP — vira referência.
- Não faça o RACI conceder acesso. Ele é rótulo de governança.
