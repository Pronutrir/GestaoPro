'use client';

import { ModulePermissions } from "@/components/ModulePermissions";
import { Shield } from "lucide-react";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";

const SettingsAccessPage = () => {
  return (
    <div className="px-4 py-6 space-y-4 max-w-5xl mx-auto">
      <SettingsPageHeader
        icon={Shield}
        title="Acessos e Permissões"
        description="Defina quais módulos do sistema cada pessoa pode acessar."
      />

      <ModulePermissions />
    </div>
  );
};

export default SettingsAccessPage;
