import { redirect } from "next/navigation";

// Tela unificada: Pessoas + Estrutura viraram "Organização".
// Mantém o link antigo funcionando (inclusive ?focus=<id>).
export default async function SettingsPeopleRedirect({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const { focus } = await searchParams;
  redirect(focus ? `/settings/organizacao?focus=${focus}` : "/settings/organizacao");
}
