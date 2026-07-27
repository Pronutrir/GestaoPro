'use client';

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Building2, Briefcase } from "lucide-react";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { TaxonomyList } from "@/components/settings/TaxonomyList";

/**
 * Estrutura Organizacional — as listas mestras que classificam pessoas:
 * Setores (onde trabalham) e Cargos/Níveis (função). Mesma natureza, mesma
 * gestão (criar/renomear/excluir/contar) — reunidas num só lugar.
 */
const SettingsStructurePage = () => {
  const [tab, setTab] = useState<"setores" | "cargos">("setores");

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto">
      <SettingsPageHeader
        icon={Building2}
        title="Estrutura Organizacional"
        description="Setores e cargos usados para classificar pessoas, projetos e filtros executivos."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="h-9 bg-transparent border-b border-border rounded-none p-0 gap-1 w-full justify-start mb-4">
          <TabsTrigger value="setores" className="text-[13px] gap-1.5 data-[state=active]:bg-background">
            <Building2 className="w-3.5 h-3.5" /> Setores
          </TabsTrigger>
          <TabsTrigger value="cargos" className="text-[13px] gap-1.5 data-[state=active]:bg-background">
            <Briefcase className="w-3.5 h-3.5" /> Cargos &amp; Níveis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="setores">
          <TaxonomyList
            table="sectors"
            profileField="sector"
            icon={Building2}
            addPlaceholder="Nome do setor (ex.: TI, Marketing, RH…)"
            emptyLabel="Nenhum setor cadastrado ainda."
            itemNoun="setor"
            singularLabel="Setor"
            moveVerb="Mover setor"
          />
        </TabsContent>
        <TabsContent value="cargos">
          <TaxonomyList
            table="job_titles"
            profileField="role_title"
            icon={Briefcase}
            addPlaceholder="Nome do cargo/nível (ex.: Coordenador, Analista…)"
            emptyLabel="Nenhum cargo cadastrado ainda."
            itemNoun="cargo"
            singularLabel="Cargo"
            moveVerb="Mover cargo"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsStructurePage;
