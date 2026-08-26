'use client';

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/**
 * ROTA PRÓPRIA DA ATIVIDADE — `/project/:id/atividade/:activityId`
 *
 * ============================================================================
 * POR QUE UMA ROTA, E NÃO ESTADO DO MODAL
 *
 * A atividade abria como estado local da página do projeto. Isso custava três
 * coisas que só aparecem no uso:
 *
 *   - o link colado no chat não abria a atividade, abria o projeto;
 *   - o F5 fechava o que a pessoa estava lendo;
 *   - o voltar do navegador saía do projeto inteiro em vez de fechar o painel.
 *
 * Com rota, os três funcionam de graça — o navegador já sabe fazer isso.
 *
 * POR QUE ESTA PÁGINA APENAS REDIRECIONA
 *
 * A página do projeto já tem um deep-link que faz exatamente o certo:
 * `?activity=<id>` abre a atividade **sobre** a visão do projeto, com o
 * contexto atrás (a EAP, o quadro, as abas). Reimplementar aqui significaria
 * carregar o projeto de novo, duplicar as regras de acesso e ter duas telas de
 * atividade divergindo — que é o defeito que esta revisão inteira vem fechando.
 *
 * Então a rota é a porta de entrada, e o mecanismo é o que já existe e já
 * funciona. `replace` (e não `push`) para o voltar do navegador levar de volta
 * ao lugar de onde a pessoa veio, sem um passo intermediário preso no meio.
 *
 * `rotaDaAtividade`/`lerRotaDaAtividade` em `lib/telaDaAtividade` são a fonte
 * do formato — quem gera link usa de lá, não monta a string à mão.
 * ============================================================================
 */
export default function AtividadePorRota() {
  const params = useParams();
  const router = useRouter();

  const projectId = typeof params?.id === "string" ? params.id : null;
  const activityId = typeof params?.activityId === "string" ? params.activityId : null;

  useEffect(() => {
    if (!projectId || !activityId) return;
    router.replace(`/project/${projectId}?activity=${encodeURIComponent(activityId)}`);
  }, [projectId, activityId, router]);

  /**
   * O que aparece no instante entre a rota e o redirecionamento.
   *
   * Não é "Carregando…" genérico de propósito: se o redirecionamento falhar
   * (id inválido na URL, por exemplo), a pessoa fica com uma tela que explica
   * e um caminho de saída, em vez de um spinner eterno.
   */
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
      <p className="text-sm text-muted-foreground">Abrindo a atividade…</p>
      {projectId && (
        <a
          href={`/project/${projectId}`}
          className="text-sm text-primary underline underline-offset-4"
        >
          Ir para o projeto
        </a>
      )}
    </div>
  );
}
