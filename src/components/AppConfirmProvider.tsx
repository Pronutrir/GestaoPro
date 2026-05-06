"use client";

import { createContext, useCallback, useContext, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type PendingConfirm = {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
};

type AppConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const AppConfirmContext = createContext<AppConfirmContextValue | null>(null);

export function AppConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ options, resolve });
    });
  }, []);

  const closeWith = (value: boolean) => {
    if (!pending) return;
    pending.resolve(value);
    setPending(null);
  };

  const options = pending?.options;

  return (
    <AppConfirmContext.Provider value={{ confirm }}>
      {children}
      <AlertDialog open={!!pending} onOpenChange={(open) => !open && closeWith(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title || "Confirmar ação"}</AlertDialogTitle>
            {options?.description ? (
              <AlertDialogDescription>{options.description}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => closeWith(false)}>
              {options?.cancelText || "Cancelar"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => closeWith(true)}
              className={options?.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {options?.confirmText || "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppConfirmContext.Provider>
  );
}

export function useAppConfirm() {
  const ctx = useContext(AppConfirmContext);
  if (!ctx) {
    throw new Error("useAppConfirm deve ser usado dentro de <AppConfirmProvider>");
  }
  return ctx.confirm;
}
