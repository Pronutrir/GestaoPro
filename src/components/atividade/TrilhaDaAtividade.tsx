'use client';

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DegrauDaTrilha } from "@/lib/telaDaAtividadeDados";

/**
 * A TRILHA — "1 › 1.3 › 1.3.2 › 1.3.2.3"
 *
 * ============================================================================
 * PARA QUEM ELA EXISTE
 *
 * O desenho diz: *"a trilha até a fase — é o que dá contexto a quem só enxerga
 * esta atividade."* Não é ornamento de navegação.
 *
 * Quem chega à atividade **só por atribuição** não vê o projeto: não vê a EAP,
 * não vê as irmãs, não sabe de que fase aquilo faz parte. Sem a trilha, a
 * pessoa recebe uma tarefa solta no vazio. Com ela, entende onde está.
 *
 * É por isso que `activity_breadcrumb` é `security_invoker = false` — ela
 * atravessa a RLS de propósito. E é por isso que ela carrega **só** código,
 * nome e tipo: um contador ali entregaria a existência das irmãs a quem não
 * deve vê-las.
 *
 * ============================================================================
 * O CÓDIGO É O QUE SE LÊ, NÃO O NOME
 *
 * O desenho mostra "1 › 1.3 › 1.3.2 › 1.3.2.3" — códigos, não títulos. Numa
 * EAP de seis níveis, os títulos ocupariam a linha inteira e a trilha deixaria
 * de ser lida de relance.
 *
 * O título vai para o `title` do link, que é onde se pergunta "o que é 1.3.2?".
 * Quem não tem código cai no título abreviado — não em "sem código", que seria
 * ruído numa trilha.
 * ============================================================================
 */
export function TrilhaDaAtividade({
  projectId,
  degraus,
  atual,
  className,
}: {
  projectId: string;
  degraus: DegrauDaTrilha[];
  /** O código da atividade aberta — último degrau, sem link. */
  atual: string | null;
  className?: string;
}) {
  const rotulo = (d: DegrauDaTrilha) =>
    (d.wbs_code ?? "").trim() || d.title.slice(0, 18);

  return (
    <nav
      aria-label="Trilha até a fase"
      className={cn("flex items-center gap-1 min-w-0 text-[12px] flex-wrap", className)}
    >
      {degraus.map((d) => (
        <span key={d.id} className="flex items-center gap-1 min-w-0">
          <Link
            href={`/project/${projectId}?activity=${encodeURIComponent(d.id)}`}
            title={d.title}
            className="text-muted-foreground hover:text-primary hover:underline underline-offset-2 truncate"
          >
            {rotulo(d)}
          </Link>
          <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" aria-hidden="true" />
        </span>
      ))}
      {/* O último NÃO é link: é onde a pessoa já está. Um link para a página
          atual é um clique que não faz nada, e ensina que a trilha não funciona. */}
      <span className="text-foreground font-medium truncate">
        {atual || "nova"}
      </span>
    </nav>
  );
}
