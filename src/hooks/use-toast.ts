import { toast as sonnerToast } from "sonner";

import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

type ToasterToast = ToastProps & {
  id?: string | number;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

type Toast = Omit<ToasterToast, "id">;

function toast({ title, description, variant, action }: Toast) {
  const titleText = typeof title === "string" ? title : "Notificação";
  const options: { description?: string } = {};

  if (typeof description === "string") {
    options.description = description;
  }

  /**
   * A AÇÃO ERA DESCARTADA EM SILÊNCIO.
   *
   * O app monta o Sonner (`providers.tsx`), não o `<Toaster>` do Radix — e
   * este hook aceitava `action` como elemento React só para "manter
   * compatibilidade", jogando fora. Resultado: TODO botão de aviso do sistema
   * nunca apareceu. O "Desfazer" de mover card, o "Levar N junto" do
   * bloqueio — nenhum deles chegou à tela, e ninguém percebeu porque o toast
   * aparecia normalmente, só sem o botão.
   *
   * Aqui o elemento é traduzido para o formato do Sonner: `{ label, onClick }`.
   * `altText` vira o rótulo — é o texto que o Radix já exigia para leitor de
   * tela, então descreve a ação; `children` cobre quem não passou `altText`.
   */
  const opcoes = options as {
    description?: string;
    action?: { label: string; onClick: () => void };
  };
  if (action && typeof action === "object" && "props" in action) {
    const p = (action as { props?: { altText?: string; children?: unknown; onClick?: () => void } }).props;
    const rotulo = p?.altText ?? (typeof p?.children === "string" ? p.children : null);
    if (rotulo && typeof p?.onClick === "function") {
      opcoes.action = { label: rotulo, onClick: p.onClick };
      /**
       * AVISO COM AÇÃO FICA MAIS TEMPO.
       *
       * O padrão do Sonner é 4s — suficiente para "salvo", curto demais para
       * um aviso que PEDE UMA DECISÃO: a pessoa precisa ler três nomes de
       * tarefa, entender o que falta e mirar o botão. Some antes disso e a
       * ação vira uma piscada que ninguém alcança.
       *
       * 12s é o que Gmail e Linear usam no "Desfazer" — tempo de ler, decidir
       * e clicar sem pressa, e ainda assim sair sozinho.
       */
      (opcoes as { duration?: number }).duration = 12000;
    }
  }

  const id =
    variant === "destructive"
      ? sonnerToast.error(titleText, opcoes)
      : sonnerToast(titleText, opcoes);

  return {
    id,
    dismiss: () => {
      sonnerToast.dismiss(id);
    },
    update: () => {
      // Mantido por compatibilidade de API.
    },
  };
}

function useToast() {
  return {
    toasts: [] as ToasterToast[],
    toast,
    dismiss: (toastId?: string | number) => sonnerToast.dismiss(toastId),
  };
}

export { useToast, toast };
