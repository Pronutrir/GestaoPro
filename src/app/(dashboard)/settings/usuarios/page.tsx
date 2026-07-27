import { redirect } from "next/navigation";

// Tela unificada: Usuários + Permissões viraram "Pessoas & Acessos".
// Mantém o link antigo funcionando.
export default function SettingsUsersRedirect() {
  redirect("/settings/organizacao");
}
