'use client';

import { UserManagement } from "@/components/UserManagement";
import { Users } from "lucide-react";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";

const SettingsUsersPage = () => {
  return (
    <div className="px-4 py-6 space-y-4 max-w-5xl mx-auto">
      <SettingsPageHeader
        icon={Users}
        title="Pessoas e Usuários"
        description="Cadastro, edição, ativação e controle de acesso por pessoa."
      />

      <UserManagement />
    </div>
  );
};

export default SettingsUsersPage;
