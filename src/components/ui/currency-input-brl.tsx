import * as React from "react";
import { cn } from "@/lib/utils";

interface CurrencyInputBRLProps {
  /** Valor em reais (ex.: 35000.5). `null` quando vazio. */
  value: number | null;
  onChange: (value: number | null) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
}

/** 3500050 (centavos) -> "35.000,50" */
function centavosParaTexto(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Campo de moeda com máscara BRL: formata enquanto digita (35.000,00) e
 * devolve o valor numérico em reais via onChange.
 *
 * Diferente de `CurrencyInput` (um input type=number com prefixo), aqui o
 * usuário digita apenas dígitos e a formatação é aplicada da direita para a
 * esquerda, como nos formulários de solicitação/classificação.
 */
const CurrencyInputBRL = React.forwardRef<HTMLInputElement, CurrencyInputBRLProps>(
  ({ value, onChange, className, placeholder = "0,00", ...props }, ref) => {
    // Mantém o texto exibido em sincronia com o valor externo, sem atrapalhar
    // a digitação (o estado local é a fonte enquanto o campo tem foco).
    const [texto, setTexto] = React.useState(() =>
      value != null ? centavosParaTexto(Math.round(value * 100)) : "",
    );

    React.useEffect(() => {
      const externo = value != null ? centavosParaTexto(Math.round(value * 100)) : "";
      // Só sobrescreve se o valor externo divergir do que está escrito.
      const atual = texto.replace(/\D/g, "");
      const novo = externo.replace(/\D/g, "");
      if (atual !== novo) setTexto(externo);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const digitos = e.target.value.replace(/\D/g, "");
      if (!digitos) {
        setTexto("");
        onChange(null);
        return;
      }
      // Limita a um valor razoável (evita overflow de digitação acidental).
      const centavos = Math.min(Number(digitos), 99_999_999_999);
      setTexto(centavosParaTexto(centavos));
      onChange(centavos / 100);
    };

    return (
      <div className="relative flex w-full items-center">
        <span className="pointer-events-none absolute left-3 text-sm font-medium text-muted-foreground">
          R$
        </span>
        <input
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={texto}
          onChange={handleChange}
          placeholder={placeholder}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background py-2 pl-10 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);

CurrencyInputBRL.displayName = "CurrencyInputBRL";

export { CurrencyInputBRL };
