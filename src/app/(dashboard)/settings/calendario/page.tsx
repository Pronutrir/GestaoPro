'use client';

import { HolidaysManager } from "@/components/HolidaysManager";
import { UserVacationsManager } from "@/components/UserVacationsManager";
import { CalendarDays } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";

const SettingsCalendarPage = () => {
  const { isAdmin } = useAuth();

  return (
    <div className="px-4 py-6 space-y-4 max-w-5xl mx-auto">
      <SettingsPageHeader
        icon={CalendarDays}
        title="Calendário Operacional"
        description="Mantenha feriados e períodos de férias para refletir a capacidade real de planejamento."
      />

      <HolidaysManager />
      {isAdmin && <UserVacationsManager />}
    </div>
  );
};

export default SettingsCalendarPage;
