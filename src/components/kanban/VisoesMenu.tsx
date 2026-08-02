"use client";
// VISÕES — um botão para tudo que é APRESENTAÇÃO do quadro.
//
// Antes eram dois botões vizinhos na régua ("Raias" e "Card") mais um terceiro
// ("Minhas") que era filtro disfarçado de modo de visão. Linear resolve o mesmo
// problema com um único "Display options" contendo agrupamento, raias e campos
// do card — dois botões separados para isso não aparecem em Linear, Notion nem
// Jira.
//
// A fronteira que ficou: aqui mora o que muda COMO o quadro se apresenta.
// O que muda QUAIS tarefas aparecem continua em Filtros — é por isso que
// "Minhas" não foi trazido para cá, e sim removido da régua (ele já existia
// duplicado dentro do painel de Filtros).
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Eye, Check, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD_FIELD_GROUPS, type CardFields } from "./shared";

export interface LaneOption {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface Props {
  laneOptions: LaneOption[];
  groupBy: string;
  onGroupByChange: (id: string) => void;
  onManageGroups: () => void;
  cardFields: CardFields;
  onToggleCardField: (key: keyof CardFields) => void;
  onRestoreCardFields: () => void;
  /** Há tarefa numa coluna oculta: o quadro esconde gente com status que
   *  ninguém vê. O ponto âmbar no botão é o único aviso permanente disso. */
  alerta?: boolean;
}

export function VisoesMenu({
  laneOptions, groupBy, onGroupByChange, onManageGroups,
  cardFields, onToggleCardField, onRestoreCardFields, alerta = false,
}: Props) {
  const raiaAtiva = groupBy !== "none";
  const current = laneOptions.find((o) => o.id === groupBy);

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* O rótulo carrega o estado. Recolher dois botões num só não pode
            custar o indicador que existia: hoje o botão de raias troca o
            próprio nome quando há raia ativa, e isso se mantém aqui. */}
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 gap-1.5 text-xs",
            raiaAtiva && "border-primary text-primary",
            !raiaAtiva && alerta && "border-warning text-warning",
          )}
          title="Raias e campos exibidos nos cards"
        >
          <Eye className="w-3.5 h-3.5 shrink-0" />
          {raiaAtiva ? `Visões · ${current?.label ?? ""}` : "Visões"}
          {alerta && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-warning shrink-0"
              title="Há tarefa em coluna oculta"
            />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 p-0" collisionPadding={12}>
        <div className="max-h-[min(460px,70vh)] overflow-y-auto">
          {/* ─── Raias ─── */}
          <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Raias
          </div>
          {laneOptions.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onGroupByChange(o.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left hover:bg-muted/50 transition-colors"
            >
              <span className="text-muted-foreground shrink-0">{o.icon}</span>
              <span className="flex-1 truncate">{o.label}</span>
              {groupBy === o.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
            </button>
          ))}
          <button
            type="button"
            onClick={onManageGroups}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 truncate">Gerenciar times…</span>
          </button>

          <div className="h-px bg-border my-1" />

          {/* ─── Campos do card ─── */}
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Campos do card
            </span>
            <button
              type="button"
              onClick={onRestoreCardFields}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              title="Restaurar padrão"
            >
              Restaurar
            </button>
          </div>
          {CARD_FIELD_GROUPS.map((grp) => (
            <div key={grp.group}>
              <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                {grp.group}
              </div>
              {grp.items.map((it) => (
                <label
                  key={it.key}
                  className="flex items-center justify-between px-3 py-1.5 text-[13px] cursor-pointer hover:bg-muted/50"
                >
                  <span className={cardFields[it.key] ? "" : "text-muted-foreground"}>
                    {it.label}
                  </span>
                  <Switch
                    checked={cardFields[it.key]}
                    onCheckedChange={() => onToggleCardField(it.key)}
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
