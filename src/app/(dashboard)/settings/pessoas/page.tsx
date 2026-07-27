'use client';

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UserManagement } from "@/components/UserManagement";
import { ModulePermissions } from "@/components/ModulePermissions";
import { Users, ShieldCheck } from "lucide-react";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";

/**
 * Painel unificado "Pessoas & Acessos" — funde num só lugar o que antes eram
 * duas telas (Usuários e Permissões), já que ambas configuram a mesma pessoa.
 * Aba "Cadastro" (dados/papel/setor/estado) + aba "Módulos" (liberação).
 */
const SettingsPeoplePage = () => {
  const [tab, setTab] = useState<"cadastro" | "modulos">("cadastro");

  return (
    <div className="px-4 py-6 space-y-4 max-w-5xl mx-auto">
      <SettingsPageHeader
        icon={Users}
        title="Pessoas & Acessos"
        description="Cadastro, papéis e setores das pessoas — e os módulos que cada uma pode acessar, num só lugar."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="h-9 bg-transparent border-b border-border rounded-none p-0 gap-1 w-full justify-start">
          <TabsTrigger value="cadastro" className="text-[13px] gap-1.5 data-[state=active]:bg-background">
            <Users className="w-3.5 h-3.5" /> Cadastro
          </TabsTrigger>
          <TabsTrigger value="modulos" className="text-[13px] gap-1.5 data-[state=active]:bg-background">
            <ShieldCheck className="w-3.5 h-3.5" /> Módulos & Permissões
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cadastro" className="mt-4">
          <UserManagement />
        </TabsContent>
        <TabsContent value="modulos" className="mt-4">
          <ModulePermissions />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPeoplePage;
