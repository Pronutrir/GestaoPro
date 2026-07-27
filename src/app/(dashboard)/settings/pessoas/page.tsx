'use client';

import { PeopleManager } from "@/components/PeopleManager";
import { Users } from "lucide-react";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";

/**
 * "Pessoas & Acessos" — painel único. Uma lista densa de pessoas; ao abrir uma
 * pessoa, todo o seu contexto (Perfil & Acesso · Módulos · Abas) fica inline no
 * mesmo lugar. Substitui as antigas telas separadas de Usuários e Permissões.
 */
const SettingsPeoplePage = () => {
  return (
    <div className="px-4 py-6 space-y-4 max-w-5xl mx-auto">
      <SettingsPageHeader
        icon={Users}
        title="Pessoas & Acessos"
        description="Cadastro, papéis, setores e módulos de cada pessoa — tudo num só lugar."
      />
      <PeopleManager />
    </div>
  );
};

export default SettingsPeoplePage;
