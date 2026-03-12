import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { RoadmapTable } from "@/components/roadmap/RoadmapTable";
import { RoadmapScatterChart } from "@/components/roadmap/RoadmapScatterChart";
import { RoadmapTimeline } from "@/components/roadmap/RoadmapTimeline";
import { RoadmapDrawer } from "@/components/roadmap/RoadmapDrawer";
import { toast } from "@/hooks/use-toast";

export interface RoadmapItem {
  id: string;
  title: string;
  description: string | null;
  theme: string;
  status: string;
  reach: number;
  impact: number;
  confidence: number;
  effort: number;
  score: number | null;
  target_quarter: string | null;
  project_id: string | null;
  created_at: string;
}

const Roadmap = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<RoadmapItem | null>(null);
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["roadmap_items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roadmap_items" as any)
        .select("*")
        .order("score", { ascending: false });
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
      toast({ title: "Projeto criado com sucesso a partir do Roadmap!" });
    },
    onError: () => {
      toast({ title: "Erro ao projetizar", variant: "destructive" });
    },
  });

  const handleEdit = (item: RoadmapItem) => {
    setEditItem(item);
    setDrawerOpen(true);
  };

  const handleNew = () => {
    setEditItem(null);
    setDrawerOpen(true);
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Roadmap Estratégico</h1>
            <p className="text-sm text-muted-foreground">
              Priorize ideias com RICE antes de projetizá-las
            </p>
          </div>
          <Button onClick={handleNew}>
            <Plus className="mr-2 h-4 w-4" /> Nova Ideia
          </Button>
        </div>

        <Tabs defaultValue="lista" className="w-full">
          <TabsList>
            <TabsTrigger value="lista">Lista RICE</TabsTrigger>
            <TabsTrigger value="matriz">Matriz 2×2</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="lista">
            <RoadmapTable
              items={items}
              isLoading={isLoading}
              onEdit={handleEdit}
              onProjetizar={(item) => projetizarMutation.mutate(item)}
            />
          </TabsContent>

          <TabsContent value="matriz">
            <RoadmapScatterChart items={items} />
          </TabsContent>

          <TabsContent value="timeline">
            <RoadmapTimeline items={items.filter((i) => i.status === "aprovado")} />
          </TabsContent>
        </Tabs>

        <RoadmapDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          editItem={editItem}
        />
      </div>
    </AppLayout>
  );
};

export default Roadmap;
