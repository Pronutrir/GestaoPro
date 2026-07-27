'use client';
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORG_LEVELS, ORG_LEVEL_VALUES } from "@/lib/orgLevels";

/**
 * Seletor de cargo/nível hierárquico. Oferece os níveis padronizados
 * (Direção/Gestor/Coordenador/Colaborador/Externo) e mantém a opção "Outro"
 * para digitar um cargo específico — preservando os valores livres já
 * existentes sem forçar uma lista fechada.
 */
interface RoleTitleSelectProps {
  value: string;
  onValueChange: (v: string) => void;
}

const OTHER = "__other__";
const NONE = "__none__";

export function RoleTitleSelect({ value, onValueChange }: RoleTitleSelectProps) {
  const isKnown = !value || ORG_LEVEL_VALUES.includes(value);
  const [custom, setCustom] = useState(!isKnown);

  const selectValue = custom ? OTHER : (value || NONE);

  return (
    <div className="space-y-2">
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === OTHER) { setCustom(true); onValueChange(""); return; }
          setCustom(false);
          onValueChange(v === NONE ? "" : v);
        }}
      >
        <SelectTrigger><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Nenhum</SelectItem>
          {ORG_LEVELS.map((l) => (
            <SelectItem key={l.value} value={l.value}>
              <span className="flex flex-col">
                <span>{l.label}</span>
                <span className="text-[11px] text-muted-foreground">{l.hint}</span>
              </span>
            </SelectItem>
          ))}
          <SelectItem value={OTHER}>Outro (personalizado)…</SelectItem>
        </SelectContent>
      </Select>
      {custom && (
        <Input
          autoFocus
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder="Cargo específico (ex.: Analista de Marketing)"
          className="h-9"
        />
      )}
    </div>
  );
}
