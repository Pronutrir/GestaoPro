'use client';

import { CostRatesManager } from "@/components/financeiro/CostRatesManager";
import { Coins } from "lucide-react";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";

const SettingsCostsPage = () => (
  <div className="px-4 py-6 space-y-4 max-w-5xl mx-auto">
    <SettingsPageHeader
      icon={Coins}
      title="Custos e Taxas"
      description="Defina quanto custa a hora de cada papel. É o que transforma as horas apontadas em custo real nos projetos."
    />
    <CostRatesManager />
  </div>
);

export default SettingsCostsPage;
