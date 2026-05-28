'use client';

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/components/ui/link";
import { HolidaysManager } from "@/components/HolidaysManager";
import { UserVacationsManager } from "@/components/UserVacationsManager";
import { ChevronLeft, CalendarDays } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const SettingsCalendarPage = () => {
  const { isAdmin } = useAuth();

  return (
    <div className="px-4 py-6 space-y-4 max-w-6xl mx-auto">
      <Card>
        <CardHeader>
          <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
            <ChevronLeft className="w-4 h-4" /> Voltar para Configuracoes
          </Link>
          <CardTitle className="text-2xl flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-primary" />
            Calendario Operacional
          </CardTitle>
          <CardDescription>
            Mantenha feriados e periodos de ferias para refletir capacidade real de planejamento.
          </CardDescription>
        </CardHeader>
      </Card>

      <HolidaysManager />
      {isAdmin && <UserVacationsManager />}
    </div>
  );
};

export default SettingsCalendarPage;
