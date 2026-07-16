'use client';
import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { ESTAGIOS, statusLabels } from "@/components/roadmap/criterios";
import { RoadmapTable } from "@/components/roadmap/RoadmapTable";
import { RoadmapDrawer } from "@/components/roadmap/RoadmapDrawer";
import { RoadmapItemDetails } from "@/components/roadmap/RoadmapItemDetails";
import { toast } from 'sonner';

import type { RoadmapItem } from "@/components/roadmap/types";



const Roadmap = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<RoadmapItem | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsItem, setDetailsItem] = useState<RoadmapItem | null>(null);
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["roadmap_items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roadmap_items" as any)
        .select("*")
        // Maior prioridade primeiro. `nullsFirst: false` manda as demandas ainda
        // não classificadas (score nulo) para o fim — sem isso o Postgres as
        // colocaria no topo, já que NULL vem antes em ordenação decrescente.
        .order("score", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as RoadmapItem[];
    },
  });

  const projetizarMutation = useMutation({
    mutationFn: async (item: RoadmapItem) => {
      const { data: project, error: pErr } = await supabase
        .from("projects")
        .insert({
          title: item.title,
          description: item.description || "",
          status: "ideacao",
          priority: "medium",
        })
        .select("id")
        .single();
      if (pErr) throw pErr;

      const { error: rErr } = await supabase
        .from("roadmap_items" as any)
        .update({ status: "em_execucao", project_id: project.id } as any)
        .eq("id", item.id);
      if (rErr) throw rErr;
      return project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roadmap_items"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Projeto criado com sucesso a partir do Roadmap!");
    },
    onError: () => {
      toast.error("Erro ao projetizar");
    },
  });

  /** Move a solicitação para o próximo estágio do fluxo de triagem. */
  const moverEstagioMutation = useMutation({
    mutationFn: async ({ item, status }: { item: RoadmapItem; status: string }) => {
      const { error } = await supabase
        .from("roadmap_items" as any)
        .update({ status } as any)
        .eq("id", item.id);
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      queryClient.invalidateQueries({ queryKey: ["roadmap_items"] });
      toast.success(
        status === "descartado"
          ? "Demanda arquivada"
          : `Movida para ${statusLabels[status] ?? status}`,
      );
    },
    onError: () => toast.error("Erro ao mover a demanda"),
  });

  const handleEdit = (item: RoadmapItem) => {
    setEditItem(item);
    setDrawerOpen(true);
  };

  const handleView = (item: RoadmapItem) => {
    setDetailsItem(item);
    setDetailsOpen(true);
  };

  return (
          <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Roadmap Estratégico</h1>
            <p className="text-sm text-muted-foreground">
              Solicite, priorize por critérios e transforme demandas em projetos
            </p>
          </div>
          <Button asChild>
            <Link href="/solicitacao">
              <Plus className="mr-2 h-4 w-4" /> Nova Solicitação
            </Link>
          </Button>
        </div>

        {/* Abas por estágio do fluxo: Backlog → Em Análise → Aprovado.
            Arquivadas (descartado) ficam numa aba à parte. */}
        <Tabs defaultValue="backlog" className="w-full">
          <TabsList>
            {ESTAGIOS.map((e) => (
              <TabsTrigger key={e.value} value={e.value} className="gap-2">
                {e.label}
                <Badge
                  variant="secondary"
                  className="h-5 min-w-5 justify-center px-1 text-[10px] tabular-nums"
                >
                  {items.filter((i) => i.status === e.value).length}
                </Badge>
              </TabsTrigger>
            ))}
            <TabsTrigger value="descartado" className="gap-2 text-muted-foreground">
              Arquivadas
              <Badge
                variant="secondary"
                className="h-5 min-w-5 justify-center px-1 text-[10px] tabular-nums"
              >
                {items.filter((i) => i.status === "descartado").length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {[...ESTAGIOS.map((e) => e.value), "descartado"].map((estagio) => (
            <TabsContent key={estagio} value={estagio}>
              <RoadmapTable
                items={items.filter((i) => i.status === estagio)}
                isLoading={isLoading}
                onEdit={handleEdit}
                onProjetizar={(item) => projetizarMutation.mutate(item)}
                onView={handleView}
                onMover={(item, status) =>
                  moverEstagioMutation.mutate({ item, status })
                }
              />
            </TabsContent>
          ))}
        </Tabs>

        <RoadmapItemDetails
          item={detailsItem}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          onEdit={handleEdit}
          onArquivar={(item) =>
            moverEstagioMutation.mutate({ item, status: "descartado" })
          }
        />

        <RoadmapDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          editItem={editItem}
        />
      </div>
    
  );
};

export default Roadmap;
