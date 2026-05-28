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

  if (action) {
    // Sonner não usa o mesmo elemento de ação do Radix Toast.
    // Mantemos compatibilidade silenciosa sem renderizar ação inválida.
  }

  const id =
    variant === "destructive"
      ? sonnerToast.error(titleText, options)
      : sonnerToast(titleText, options);

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
