# P01 · Inventário dos módulos de projeto

**Onda 1** · só leitura · **não altere nenhum arquivo nesta fase**

> **O item 8 já foi respondido, e é P00.** A consulta de Pendências não aplica visibilidade —
> mas a causa é a policy, não a consulta. Ver `DIVERGENCIAS.md` item 1. Mantido no prompt
> abaixo para o inventário confirmar o alcance nas outras três telas.

## Prompt

```
Leia o código das doze visualizações de projeto (Kanban, Backlog, Cronograma,
Documentos, Registros, TAP, Reuniões, Riscos, Mudanças, Dependências,
Financeiro, Lições) e das rotas globais do menu.

Devolva docs/projeto-v2/inventario.md com:

1. Como o Cronograma monta as linhas. Quero a causa da fase aparecer DUAS
   vezes — uma sem ID e 0%, outra com ID e 100%. É união de duas consultas?
   É um nó sintético de agrupamento somado ao nó real?
   ATENÇÃO: o inventário do Atividade v2 achou TRÊS fórmulas de progresso
   vivas, com profundidades diferentes (ver docs/atividade-v2/inventario.md
   item 4). Confira se a linha "0%" e a "100%" vêm de fórmulas diferentes
   antes de concluir que são duas linhas.
2. Onde cada tela decide o TIPO do item. O mesmo item é "Entrega" no
   Cronograma e "Atividade" no Kanban — quero as duas origens.
   A fonte única é lib/eapModel (resolveEapKind); diga quem NÃO a consome.
3. Por que o Marco aparece sem código EAP no Cronograma.
   NOTA: marco NÃO TEM wbs_code por decisão de 11/08/2026 (eapModel.ts). O
   que investigar é como o Cronograma o exibe, não por que não tem código.
4. Onde a faixa de indicadores do topo é calculada, e o que cada um dos seis
   números consulta.
5. Como o TAP guarda os 23 campos, e quais deles já existem em outra tabela
   do projeto (gestor, líder, datas, orçamento, prioridade, código).
6. Onde o Financeiro calcula BAC, custo real e linha de base — quero o
   padrão dele, porque o prazo vai copiá-lo.
7. Onde está a taxa que faria horas virarem custo, ou a ausência dela.
8. O que Pendências, Cronograma global e Visão Geral consultam, e se
   aplicam alguma regra de visibilidade por usuário.
9. Quem consome as rotas /agent, /csc, /qualidade e /calendário — se alguma
   outra tela importa código delas.
10. O que existe hoje de duplicação de dado entre TAP, Cronograma e
    Financeiro: prazo, orçamento, responsável.

Para cada item, cite arquivo e linha.
```

## Pronto quando

O documento existe com as dez respostas, e o item 1 aponta a causa da duplicação — não a
descrição do sintoma.
