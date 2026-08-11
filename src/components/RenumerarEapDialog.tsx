'use client';
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ListOrdered, AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { planejarRenumeracao, type PlanoRenumeracao } from "@/lib/eapRenumerar";

/**
 * RENUMERAR A EAP — põe o projeto no nível 1.
 *
 * Migração POR PROJETO, e não uma migration em massa, por decisão de 11/08: o
 * usuário confere o resultado numa EAP antes de mexer nas outras. Se algo der
 * errado, erra num projeto, não na base inteira.
 *
 * A prévia mostra o de/para ANTES de gravar. Renumerar sem ver o que vai
 * acontecer com códigos que as pessoas usam para conversar sobre o trabalho
 * seria pedir confiança no lugar de dar informação.
 */
export function RenumerarEapDialog({
  projectId,
  projectTitle,
  open,
  onOpenChange,
  onDataChanged,
}: {
  projectId: string;
  projectTitle?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDataChanged: () => void;
}) {
  const { toast } = useToast();
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [plano, setPlano] = useState<PlanoRenumeracao | null>(null);
  const [titulos, setTitulos] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) { setPlano(null); return; }
    setCarregando(true);
    (async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("id, title, wbs_code")
        .eq("project_id", projectId)
        .or("is_trashed.is.null,is_trashed.eq.false");
      setCarregando(false);
      if (error) {
        toast({ title: "Não foi possível ler a EAP", description: error.message, variant: "destructive" });
        return;
      }
      const itens = data || [];
      setTitulos(Object.fromEntries(itens.map((a: any) => [a.id, a.title])));
      setPlano(planejarRenumeracao(itens as any));
    })();
  }, [open, projectId, toast]);

  const linhas = useMemo(() => {
    if (!plano) return [];
    return plano.paraTemp.map((t, i) => ({
      id: t.id,
      de: t.de,
      para: plano.paraFinal[i].para,
      titulo: titulos[t.id] || "",
    })).sort((a, b) => a.de.localeCompare(b.de, undefined, { numeric: true }));
  }, [plano, titulos]);

  const executar = async () => {
    if (!plano || plano.paraFinal.length === 0) return;
    setSalvando(true);
    try {
      // DUAS PASSADAS: o destino de um item é o código atual de outro
      // ("1" vira "1.1", e "1.1" já existe). Com o UNIQUE ativo o UPDATE direto
      // abortaria no meio, deixando metade da EAP renumerada — o pior desfecho
      // possível. O prefixo temporário não colide com nada porque não é um
      // código EAP válido.
      for (const passo of plano.paraTemp) {
        const { error } = await supabase
          .from("activities").update({ wbs_code: passo.para }).eq("id", passo.id);
        if (error) throw new Error(`ao mover ${passo.de} para área temporária: ${error.message}`);
      }
      for (const passo of plano.paraFinal) {
        const { error } = await supabase
          .from("activities").update({ wbs_code: passo.para }).eq("id", passo.id);
        if (error) throw new Error(`ao gravar ${passo.para}: ${error.message}`);
      }
      toast({
        title: "EAP renumerada",
        description: `${plano.paraFinal.length} itens. O projeto agora é o nível 1.`,
      });
      onDataChanged();
      onOpenChange(false);
    } catch (e: any) {
      // A falha na 1ª passada é segura (os temporários não são códigos válidos e
      // podem ser refeitos). Na 2ª, parte já aterrissou — por isso o texto diz o
      // que fazer em vez de só mostrar o erro.
      toast({
        title: "Renumeração interrompida",
        description: `${e.message}. Rode de novo: o que já foi gravado é reconhecido e não se repete.`,
        variant: "destructive",
      });
    } finally {
      setSalvando(false);
    }
  };

  const nada = plano && plano.paraFinal.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[94vw] max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <ListOrdered className="w-4 h-4" /> Renumerar EAP
          </DialogTitle>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Coloca o projeto no nível 1. Cada código ganha <code className="px-1 rounded bg-muted font-mono text-[12px]">1.</code> na frente:{" "}
            <span className="font-mono text-foreground">1</span> vira{" "}
            <span className="font-mono text-foreground">1.1</span>,{" "}
            <span className="font-mono text-foreground">1.1.1</span> vira{" "}
            <span className="font-mono text-foreground">1.1.1.1</span>.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {carregando && <p className="text-sm text-muted-foreground">Lendo a EAP…</p>}

          {nada && (
            <div className="flex items-start gap-3 rounded-lg border p-4">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Nada a renumerar.</p>
                <p className="text-muted-foreground mt-1">
                  {plano?.precisaConferir
                    ? "Nenhum item tem o código 1, mas a numeração não começa em 1 — confira se esta EAP já está no formato novo antes de concluir."
                    : `Esta EAP já está no formato novo: ${plano?.jaMigrados} itens com o projeto no nível 1.`}
                </p>
              </div>
            </div>
          )}

          {plano && plano.paraFinal.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] text-muted-foreground">
                  <strong className="text-foreground">{plano.paraFinal.length}</strong> itens ·
                  a EAP passa a ter <strong className="text-foreground">{plano.profundidadeFinal}</strong> níveis
                </p>
                {plano.semCodigo > 0 && (
                  <span className="text-[12px] text-muted-foreground">
                    {plano.semCodigo} sem código EAP (não mudam)
                  </span>
                )}
              </div>

              <div className="rounded-lg border divide-y">
                {linhas.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 px-3 py-1.5 text-[12.5px]">
                    <span className="font-mono text-muted-foreground w-[72px] shrink-0 tabular-nums">{l.de}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                    <span className="font-mono font-medium w-[84px] shrink-0 tabular-nums">{l.para}</span>
                    <span className="truncate text-muted-foreground">{l.titulo}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2.5 mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[12.5px] text-muted-foreground">
                  Os códigos mudam para todo mundo que abrir este projeto. Documentos e atas
                  que citem <span className="font-mono">1.1.1</span> passam a se referir a
                  outro item — vale avisar quem usa esta EAP.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            {nada ? "Fechar" : "Cancelar"}
          </Button>
          {plano && plano.paraFinal.length > 0 && (
            <Button onClick={executar} disabled={salvando}>
              {salvando ? "Renumerando…" : `Renumerar ${plano.paraFinal.length} itens`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
