'use client';

import { Suspense } from "react";
import { PeopleManager } from "@/components/PeopleManager";
import { Building2 } from "lucide-react";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";

/**
 * "Organização" — a tela única de cadastro. Funde as antigas Pessoas e Estrutura:
 * lista de pessoas à esquerda (agrupável por setor/cargo), ficha completa à direita
 * (identificação, organização, acesso, módulos, abas). Setores e cargos nascem no
 * próprio campo; a gestão em massa das listas fica no menu "Gerenciar listas".
 */
const SettingsOrganizationPage = () => {
  return (
    <div className="px-4 py-6 space-y-4 max-w-[1400px] mx-auto">
      <SettingsPageHeader
        icon={Building2}
        title="Organização"
      />
      <Suspense fallback={null}>
        <PeopleManager />
      </Suspense>
    </div>
  );
};

export default SettingsOrganizationPage;
