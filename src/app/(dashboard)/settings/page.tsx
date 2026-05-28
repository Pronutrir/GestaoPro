'use client';
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/components/ui/link";
import { Building2, Settings2, Shield, CalendarDays, Users as UsersIcon, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRouter } from "next/navigation";

interface Sector {
  id: string;
}

const Settings = () => {
  const [sectorsCount, setSectorsCount] = useState(0);
  const router = useRouter();

  const fetchSectors = async () => {
    const { data, error } = await supabase.from("sectors").select("id");
    if (!error && data) setSectorsCount(data.length);
  };

  useEffect(() => { fetchSectors(); }, []);

  useEffect(() => {
    router.prefetch("/settings/estrutura");
    router.prefetch("/settings/usuarios");
    router.prefetch("/settings/acessos");
    router.prefetch("/settings/calendario");
  }, [router]);

  return (
    <div className="px-4 py-6 space-y-6 max-w-6xl mx-auto">
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Settings2 className="w-6 h-6 text-primary" />
                Configuracoes do Sistema
              </CardTitle>
              <CardDescription className="mt-1">
                Escolha uma area para configurar. Cada tema possui pagina propria para reduzir complexidade e melhorar foco.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs">
              Admin
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Link href="/settings/estrutura" className="text-left rounded-lg border border-border p-3 hover:bg-accent/40 transition block">
              <p className="text-xs text-muted-foreground">Estrutura</p>
              <p className="text-sm font-semibold flex items-center gap-2 mt-1"><Building2 className="w-4 h-4" /> Setores</p>
              <p className="text-xs text-muted-foreground mt-1">{sectorsCount} cadastrado(s)</p>
              <span className="text-xs text-primary mt-2 inline-flex items-center gap-1">Abrir <ArrowRight className="w-3 h-3" /></span>
            </Link>
            <Link href="/settings/usuarios" className="text-left rounded-lg border border-border p-3 hover:bg-accent/40 transition block">
              <p className="text-xs text-muted-foreground">Pessoas</p>
              <p className="text-sm font-semibold flex items-center gap-2 mt-1"><UsersIcon className="w-4 h-4" /> Usuarios</p>
              <p className="text-xs text-muted-foreground mt-1">Cadastro e manutencao</p>
              <span className="text-xs text-primary mt-2 inline-flex items-center gap-1">Abrir <ArrowRight className="w-3 h-3" /></span>
            </Link>
            <Link href="/settings/acessos" className="text-left rounded-lg border border-border p-3 hover:bg-accent/40 transition block">
              <p className="text-xs text-muted-foreground">Acessos</p>
              <p className="text-sm font-semibold flex items-center gap-2 mt-1"><Shield className="w-4 h-4" /> Permissoes</p>
              <p className="text-xs text-muted-foreground mt-1">Modulos e visibilidade</p>
              <span className="text-xs text-primary mt-2 inline-flex items-center gap-1">Abrir <ArrowRight className="w-3 h-3" /></span>
            </Link>
            <Link href="/settings/calendario" className="text-left rounded-lg border border-border p-3 hover:bg-accent/40 transition block">
              <p className="text-xs text-muted-foreground">Calendario</p>
              <p className="text-sm font-semibold flex items-center gap-2 mt-1"><CalendarDays className="w-4 h-4" /> Feriados e Ferias</p>
              <p className="text-xs text-muted-foreground mt-1">Capacidade e disponibilidade</p>
              <span className="text-xs text-primary mt-2 inline-flex items-center gap-1">Abrir <ArrowRight className="w-3 h-3" /></span>
            </Link>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
};

export default Settings;
