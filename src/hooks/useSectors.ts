import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Sector = { id: string; name: string };

/**
 * Referência estável para o estado "ainda não carregado". Usar `= []` no
 * destructuring do consumidor criaria um array novo a cada render, o que
 * reexecutaria effects que dependem da lista.
 */
const EMPTY: Sector[] = [];

/**
 * Áreas/departamentos (tabela `sectors`, Configurações → Estrutura).
 * Dado praticamente estático — cacheado para não refazer a consulta
 * a cada montagem dos selects que o consomem.
 */
export const useSectors = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["sectors"],
    queryFn: async (): Promise<Sector[]> => {
      const { data, error } = await supabase
        .from("sectors")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data || [];
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  return { sectors: data ?? EMPTY, isLoading };
};
