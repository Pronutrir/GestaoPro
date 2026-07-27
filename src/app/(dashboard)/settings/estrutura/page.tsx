import { redirect } from "next/navigation";

// Tela unificada: Pessoas + Estrutura viraram "Organização".
// Setores/Cargos agora são gerenciados dentro da Organização ("Gerenciar listas").
export default function SettingsStructureRedirect() {
  redirect("/settings/organizacao");
}
