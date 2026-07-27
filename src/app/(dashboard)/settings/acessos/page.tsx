import { redirect } from "next/navigation";

// Tela unificada: Usuários + Permissões viraram "Pessoas & Acessos".
// Mantém o link antigo funcionando (abre direto na aba de Módulos seria ideal,
// mas o redirect simples já leva ao painel unificado).
export default function SettingsAccessRedirect() {
  redirect("/settings/pessoas");
}
