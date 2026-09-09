
# Plano de teste E2E — Gestão_Pro (producao)

Ambiente: https://gestaopro.pronutrir.com.br/
Projeto de teste: cbca8b9c
Contas: e2e-del@e2e.local (admin/dono), e2e-tudo@e2e.local (perfil Editar tudo), e2e-resp@e2e.local (perfil Editar apenas as minhas)
Senha padrao dos e2e: E2eTeste!2026#Acesso

Objetivo geral: permissoes consistentes entre UI e RLS (nunca aceitar sucesso na tela sem confirmar que a escrita realmente aconteceu no banco), persistencia de estado apos F5, e liberdade para reportar qualquer comportamento estranho fora do roteiro fixo.

Regra de ouro para cada teste: nunca aceitar "apareceu sucesso na tela" como prova. Confirmar affected_rows ou reler o dado do banco antes de marcar como passou. RLS pode devolver HTTP 200 com zero linhas alteradas.

## PRIORIDADE 1 — Regra funcional do perfil "Editar apenas as minhas"

Texto de referencia do usuario:
"Editar apenas as minhas: Vê o projeto inteiro. Cria, edita, move e exclui atividades pelas quais é responsável. Regra funcional: quando o usuario for designado como responsavel por uma atividade, seja ela pai ou filha, ele tera autonomia para criar, editar, mover e excluir atividades dentro do seu escopo de responsabilidade. Se for responsavel por uma atividade pai, podera criar, editar, mover e excluir suas subatividades. Se for responsavel por uma subatividade, podera criar, editar, mover e excluir atividades/subatividades dentro do seu escopo permitido. Ao movimentar uma atividade ou entrega no Kanban, ela nao deve ficar bloqueada para o responsavel. Os quatro perfis ficam coerentes: Criar e excluir = cria e exclui qualquer atividade do projeto; Editar tudo = edita e move qualquer atividade do projeto (nao exclui); Editar apenas as minhas = cria, edita, move e exclui aquilo que esta sob sua responsabilidade; Visualizar e comentar = visualiza e comenta, sem criar, editar, mover ou excluir."

Preparo (como e2e-del):
1. Criar atividade-pai P1 e subatividade P1.1 dentro dela. Definir e2e-resp como RESPONSAVEL de P1 (a pai).
2. Criar atividade-pai P2 (responsavel = e2e-del) e subatividade P2.1 dentro dela. Definir e2e-resp como RESPONSAVEL so de P2.1 (a filha, nao a pai).

Cenario A — responsavel pela atividade-pai (como e2e-resp):
3. Criar nova subatividade dentro de P1 ou P1.1 — esperado sucesso.
4. Editar titulo/data de P1.1 (subatividade herdada) — esperado sucesso.
5. Mover o card de P1 ou de uma filha entre colunas no Kanban — esperado sem bloqueio, sem "Somente leitura".
6. Excluir/arquivar uma subatividade de P1 — esperado sucesso.

Cenario B — responsavel so pela subatividade (como e2e-resp):
7. Criar uma sub-subatividade dentro de P2.1 — esperado sucesso.
8. Editar/mover/excluir dentro de P2.1 — esperado sucesso.
9. Tentar editar P2 (a pai, da qual NAO e responsavel) — esperado bloqueado.
10. Mover o card de P2.1 no Kanban — esperado sem bloqueio.

Cenario negativo (como e2e-resp):
11. Tentar editar/mover/excluir uma atividade do projeto totalmente fora de P1/P2 (sem vinculo de responsavel) — esperado bloqueado, com mensagem de permissao.
12. Confirmar que e2e-resp CONSEGUE VER essa atividade fora do escopo na arvore/lista (ve tudo, age so no que e seu).

Coerencia dos quatro perfis (comparacao rapida, mesma atividade P1):
13. e2e-del como "Criar e excluir": cria/exclui qualquer atividade do projeto, mesmo fora do vinculo — esperado sucesso sempre.
14. Um perfil "Editar tudo" (e2e-tudo): edita e move qualquer atividade, mas botao excluir/arquivar deve estar AUSENTE ou bloqueado (bug corrigido recentemente — reteste obrigatorio).
15. e2e-resp "Editar apenas as minhas": confirmado nos passos 3-12 acima.
16. Um perfil "Visualizar e comentar": ve tudo, comenta, mas criar/editar/mover/excluir ficam ausentes ou bloqueados.

## PRIORIDADE 2 — Retestar as correcoes tecnicas mais recentes (regressao)

17. Diálogo de edicao de atividade: e2e-resp responsavel so da atividade-pai abre uma FILHA (subatividade herdada) — NAO deve aparecer a faixa "Somente leitura", o campo deve estar editavel e "Salvar Alteracoes" habilitado.
18. No mesmo dialogo, para quem esta REALMENTE sem permissao (sem vinculo nenhum): os botoes "Arquivar" e "Duplicar" nao devem aparecer (antes ficavam ativos por engano mesmo com o dialogo travado).
19. Arquivar uma atividade pela tela de detalhe (nao pelo Kanban/Backlog) e confirmar na Lixeira que a data de arquivamento (trashed_at) aparece preenchida, nao vazia.
20. Criar uma atividade nova direto na raiz do Backlog (botao "Nova Atividade", sem escolher pai) e confirmar que ela nasce com codigo EAP preenchido (coluna wbs_code), nao vazio.
21. Como e2e-tudo (perfil Editar tudo): abrir uma atividade sem vinculo nenhum e confirmar que o botao "Arquivar" NAO aparece ou esta bloqueado (era o bug mais grave desta rodada).

## PRIORIDADE 3 — Kanban completo

22. Filtros: persistem apos F5, se combinam como intersecao (E), isolados por coluna.
23. Acoes de card: concluir, mover, bloquear, arquivar, duplicar — confirmar o gate certo por perfil em cada acao.
24. Drag and drop: reordenar dentro da coluna, mover entre colunas, respeitar WIP limit (rigido e nao rigido), selecao em lote com arrasto multiplo (Shift+clique).
25. Configuracao do quadro: criar/editar/ocultar coluna, WIP limit, cor, confirmacao ao excluir coluna com cards dentro.
26. Selecao em lote: contagem exibida deve ser a real (linhas afetadas), nao o tamanho da selecao; gate de permissao por item dentro da selecao (nao so a selecao toda).

## PRIORIDADE 4 — Backlog completo

27. Filtros e busca em arvore (persistencia, isolamento).
28. Criar/editar: quick-add inline, edicao de titulo inline, geracao de wbs_code em todos os caminhos de criacao (quick-add com pai, quick-add sem pai, importar EAP).
29. Acoes em lote: gate por atividade individual (podeMexer), nao por selecao inteira; contagem real no toast, nao tentativas.
30. Acoes individuais: concluir/reabrir (volta para "Nao iniciado", nao para o status anterior), arquivar fase (leva filhas junto no modelo moderno).
31. Lixeira: restaurar individual, restaurar todas, esvaziar lixeira, excluir permanente (botao deve estar visivel, nao so no hover).
32. Modo EAP: enquadramento do SVG, corte por nivel, corte por largura (indicador "N ocultas"), foco/trilha (breadcrumb), zoom ("Ajustar", +/-, limites 60-300%), exportar SVG, imprimir, orfao (borda tracejada vermelha), marco (losango laranja).

## Liberdade extra (sem roteiro fixo)

33. Cruzar Kanban e Backlog na mesma atividade com o mesmo perfil — o comportamento deve ser consistente nos dois modos.
34. Testar os quatro perfis lado a lado na mesma atividade sempre que uma acao tiver gate de permissao, nao so seguir o roteiro escrito.
35. Reportar qualquer comportamento estranho fora do roteiro, mesmo que nao tenha sido pedido explicitamente.

## Regras de execucao e relato

- Para cada achado, registrar: o que foi feito, o que se esperava, o que aconteceu de fato, e se é um achado real ou um engano de medicao do proprio teste.
- Nunca reportar sucesso de escrita sem confirmar o efeito real no banco (affected_rows, ou reler o dado).
- Ao final, restaurar o fixture ao estado anterior as mutacoes de teste, documentando o que ficou de pe (se algo for deixado de proposito para reproducao) e por que.
