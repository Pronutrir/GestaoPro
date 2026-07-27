'use client';
import { Link } from "@/components/ui/link";
import { ChevronLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Cabeçalho padronizado das telas de Configurações.
 * Fonte única — todas as páginas de settings usam este componente, garantindo
 * mesma tipografia/espaçamento (título ~18px semibold, apoio 13px, ícone 20px)
 * e o mesmo breadcrumb "Voltar", no padrão visual da plataforma.
 */
interface SettingsPageHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Link de voltar (default: índice de Configurações). Passe null para ocultar. */
  backHref?: string | null;
  backLabel?: string;
  /** Ações à direita (ex.: badge, botão). */
  actions?: React.ReactNode;
}

export function SettingsPageHeader({
  icon: Icon,
  title,
  description,
  backHref = "/settings",
  backLabel = "Voltar para Configurações",
  actions,
}: SettingsPageHeaderProps) {
  return (
    <div className="mb-5">
      {backHref && (
        <Link
          href={backHref}
          className="text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3"
        >
          <ChevronLeft className="w-4 h-4" /> {backLabel}
        </Link>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <span className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            {description && (
              <p className="text-[13px] text-muted-foreground mt-0.5 max-w-2xl">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
