'use client';
// ENVIAR DOCUMENTO PARA CIRCULAR — escolhe o tipo (ciência, aprovação ou
// assinatura), os participantes e a ORDEM.
//
// A ordem é um número por pessoa: mesmo número = agem juntos, números
// diferentes = um espera o outro. Isso cobre paralelo, sequencial e o caso
// misto, que um seletor "paralelo ou sequencial" não resolveria.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PersonCombobox } from "@/components/PersonCombobox";
import { DateField } from "@/components/ui/date-field";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { X, ArrowUp, ArrowDown, Users } from "lucide-react";
import { getAvatarInitials } from "@/lib/avatarLookup";
import { FLOW_KINDS, ROLE_META, type FlowKind, type ParticipantRole } from "@/lib/documentFlow";
import { cn } from "@/lib/utils";

export interface DraftParticipant {
  user_id: string;
  user_name: string;
  role: ParticipantRole;
  position: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentName: string;
  people: { id: string; full_name: string; sector: string | null; role_title?: string | null; avatar_url?: string | null }[];
  onConfirm: (data: {
    kind: FlowKind;
    message: string;
    dueDate: string;
    participants: DraftParticipant[];
  }) => Promise<void>;
}

export function StartFlowDialog({ open, onOpenChange, documentName, people, onConfirm }: Props) {
  const [kind, setKind] = useState<FlowKind>("ciencia");
  const [message, setMessage] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [list, setList] = useState<DraftParticipant[]>([]);
  const [saving, setSaving] = useState(false);

  const meta = FLOW_KINDS[kind];

  const add = (p: { id: string; full_name: string }) => {
    if (list.some((x) => x.user_id === p.id)) return;
    setList((prev) => [...prev, {
      user_id: p.id,
      user_name: p.full_name,
      role: meta.defaultRole,
      // Todos na mesma posição por padrão = agem em paralelo, que é o caso
      // mais comum. Quem precisar de sequência ajusta com as setas.
      position: 1,
    }]);
  };

  const patch = (id: string, data: Partial<DraftParticipant>) =>
    setList((prev) => prev.map((p) => (p.user_id === id ? { ...p, ...data } : p)));

  const remove = (id: string) => setList((prev) => prev.filter((p) => p.user_id !== id));

  const submit = async () => {
    if (list.length === 0) return;
    setSaving(true);
    await onConfirm({ kind, message: message.trim(), dueDate, participants: list });
    setSaving(false);
    onOpenChange(false);
    setList([]); setMessage(""); setDueDate("");
  };

  const blocking = list.filter((p) => ROLE_META[p.role].blocking);
  const positions = Array.from(new Set(blocking.map((p) => p.position))).sort((a, b) => a - b);
  const available = people.filter((p) => !list.some((x) => x.user_id === p.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar para circulação</DialogTitle>
        </DialogHeader>

        <div className="space-y-3.5">
          <p className="text-[12px] text-muted-foreground -mt-1 truncate" title={documentName}>
            Documento: <strong className="text-foreground">{documentName}</strong>
          </p>

          {/* Tipo do fluxo */}
          <div className="space-y-1.5">
            <Label className="text-xs">O que você precisa das pessoas</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(FLOW_KINDS) as FlowKind[]).map((k) => (
                <button key={k} type="button"
                  onClick={() => {
                    setKind(k);
                    // Troca o papel de quem já está na lista, mantendo observadores.
                    setList((prev) => prev.map((p) =>
                      p.role === "observador" ? p : { ...p, role: FLOW_KINDS[k].defaultRole }));
                  }}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left transition-colors",
                    kind === k ? "border-primary bg-primary/5" : "hover:bg-muted/50")}>
                  <span className={cn("block text-[13px] font-semibold",
                    kind === k ? "text-primary" : "text-foreground")}>{FLOW_KINDS[k].label}</span>
                  <span className="block text-[10.5px] text-muted-foreground leading-tight mt-0.5">
                    {k === "ciencia" ? "confirmam que leram"
                      : k === "aprovacao" ? "autorizam o conteúdo"
                      : "assinam eletronicamente"}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Ao concluir, cada pessoa registra: <em>{meta.acceptText}</em>
            </p>
          </div>

          {/* Participantes */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Participantes
              {list.length > 0 && <Badge variant="secondary" className="text-[10px]">{list.length}</Badge>}
            </Label>
            {list.length > 0 && (
              <div className="rounded-md border overflow-hidden">
                {list
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .map((p) => (
                    <div key={p.user_id} className="flex items-center gap-2 px-2.5 py-2 border-b last:border-b-0">
                      {ROLE_META[p.role].blocking ? (
                        <div className="flex flex-col shrink-0">
                          <button type="button" title="Agir antes"
                            onClick={() => patch(p.user_id, { position: Math.max(1, p.position - 1) })}
                            className="h-3.5 w-5 flex items-center justify-center text-muted-foreground hover:text-primary">
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <span className="h-4 w-5 flex items-center justify-center text-[10px] font-bold
                                           text-muted-foreground" title={`Posição ${p.position}`}>{p.position}</span>
                          <button type="button" title="Agir depois"
                            onClick={() => patch(p.user_id, { position: p.position + 1 })}
                            className="h-3.5 w-5 flex items-center justify-center text-muted-foreground hover:text-primary">
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="w-5 text-center text-[10px] text-muted-foreground shrink-0">—</span>
                      )}
                      <Avatar className="h-6 w-6 shrink-0">
                        <AvatarFallback className="text-[9px]">{getAvatarInitials(p.user_name)}</AvatarFallback>
                      </Avatar>
                      <span className="text-[13px] truncate flex-1 min-w-0">{p.user_name}</span>
                      <Select value={p.role} onValueChange={(v) => patch(p.user_id, { role: v as ParticipantRole })}>
                        <SelectTrigger className="h-7 w-[132px] text-xs shrink-0"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={meta.defaultRole}>{ROLE_META[meta.defaultRole].label}</SelectItem>
                          <SelectItem value="observador">Acompanha</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                        onClick={() => remove(p.user_id)} title="Remover">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
              </div>
            )}
            <PersonCombobox
              variant="add"
              people={available}
              placeholder="Adicionar pessoa por nome, setor ou função..."
              onSelect={(p) => add(p)}
            />
            {positions.length > 1 && (
              <p className="text-[11px] text-muted-foreground">
                Em sequência: {positions.map((n) => `posição ${n}`).join(" → ")}. Quem tem o mesmo
                número age ao mesmo tempo.
              </p>
            )}
            {positions.length === 1 && blocking.length > 1 && (
              <p className="text-[11px] text-muted-foreground">
                Todos agem ao mesmo tempo. Use as setas para colocar alguém antes ou depois.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Prazo (opcional)</Label>
              <DateField value={dueDate} onChange={setDueDate} />
              <p className="text-[11px] text-muted-foreground">Sinaliza atraso; não encerra sozinho.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Recado (opcional)</Label>
              <Input value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder="Ex.: revisar até sexta" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || list.length === 0}>
            {saving ? "Enviando..." : `Enviar para ${list.length} pessoa(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
