'use client';
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/components/ui/link";
import { Settings2, CalendarDays, Users as UsersIcon, Coins, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRouter } from "next/navigation";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";

const AREAS = [
  { href: "/settings/organizacao", eyebrow: "Organização", title: "Pessoas, Setores & Cargos", icon: UsersIcon, key: "organizacao" },
  { href: "/settings/calendario", eyebrow: "Calendário", title: "Feriados e Férias", icon: CalendarDays, key: "calendario" },
  { href: "/settings/custos", eyebrow: "Financeiro", title: "Custos & Taxas", icon: Coins, key: "custos" },
] as const;

const Settings = () => {
  const [sectorsCount, setSectorsCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    supabase.from("sectors").select("id").then(({ data, error }) => {
      if (!error && data) setSectorsCount(data.length);
    });
  }, []);

  useEffect(() => {
    AREAS.forEach((a) => router.prefetch(a.href));
  }, [router]);

  const subtitleFor = (key: string) =>
    key === "organizacao" ? `Cadastro, acesso · ${sectorsCount} setor(es)`
      : key === "custos" ? "Taxa por papel e por pessoa"
      : "Capacidade e disponibilidade";

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto">
      <SettingsPageHeader
        icon={Settings2}
        title="Configurações do Sistema"
        description="Escolha uma área para configurar. Cada tema tem sua própria página para reduzir complexidade e melhorar o foco."
        backHref={null}
        actions={<Badge variant="outline" className="text-xs">Admin</Badge>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {AREAS.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.key}
              href={a.href}
              className="group rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all block"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </span>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{a.eyebrow}</p>
              <p className="text-sm font-semibold mt-0.5">{a.title}</p>
              <p className="text-xs text-muted-foreground mt-1.5">{subtitleFor(a.key)}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default Settings;
