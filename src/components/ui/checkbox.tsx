import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Caixa de seleção com TRÊS estados — vazia, traço e marcada.
 *
 * O traço (`indeterminate`) não era desenhado: o componente só tratava
 * `data-[state=checked]` e sempre renderizava o ícone `Check`, que só aparece
 * quando há fundo. Então "alguns filhos marcados" ficava IDÊNTICO a "nada
 * marcado" — na árvore do Backlog, uma fase com 1 de 4 atividades selecionadas
 * parecia vazia, ao lado das que de fato estavam.
 *
 * O Radix já emite `data-state="indeterminate"`; faltava o estilo e o ícone.
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background",
      "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
      // O traço usa o MESMO fundo do marcado: o que distingue os dois é o
      // ícone (traço × visto), não a cor. Fundo diferente sugeriria um terceiro
      // significado, quando é "parte do que está aqui dentro".
      "data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn("flex items-center justify-center text-current")}>
      {props.checked === "indeterminate"
        ? <Minus className="h-3.5 w-3.5" strokeWidth={3} />
        : <Check className="h-4 w-4" />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
