# P02 · Cronograma: a fase duplicada e o tipo único

**Onda 1** · o defeito que aparece no material que vai ao cliente

> **Pode ser menor do que parece.** Se a linha "0%" e a "100%" vierem de fórmulas de progresso
> diferentes (há três vivas), a causa é a mesma que a fase 09 do Atividade v2 corrige — e aí
> esta fase vira ajuste, não reescrita. O item 1 da P01 decide isso.

## Prompt

```
Corrija o Cronograma:

1. Uma linha por item. Hoje cada fase aparece duas vezes — uma sem ID com
   0% e outra com ID e 100%. Elimine a linha fantasma na origem, não
   escondendo no componente.
2. O TIPO do item passa a ter uma definição só, consumida por todas as
   telas: Fase, Entrega, Atividade, Marco. A fonte única JÁ EXISTE —
   `resolveEapKind` em lib/eapModel. Não crie outra: faça quem diverge
   passar a consumi-la, e diga quem estava fora.
3. Marco exibe a ÂNCORA do pai na coluna de código, não um código próprio —
   marco não tem wbs_code (decisão de 11/08). `codigoParaExibir` em
   lib/mesaDePlanejamento já resolve isso; consuma de lá.
4. Colunas: Duração, Folga Total e Folga Livre só aparecem quando há
   duração e vínculo que as tornem calculáveis. Sem isso, ficam fora — não
   ocupam largura para mostrar traço.
5. Verifique se o Cronograma GLOBAL agrega os projetos e herda a mesma
   duplicação. Se herdar, corrija junto e diga quantas fases a carteira
   estava contando a mais.

Antes de alterar, mostre a consulta atual e explique de onde vem a segunda
linha.
```

## Pronto quando

- Contagem de fases no Cronograma igual à do Backlog e à da EAP.
- O mesmo item mostra o mesmo tipo em todas as telas.
- Nenhuma coluna exibindo só traço.

## Não faça

- Não resolva com `distinct` no componente. A linha fantasma tem uma origem; ela é que sai.
- Não crie uma segunda fonte de tipo. Já existe uma, e o problema é justamente quem não a usa.
