import { redirect } from 'next/navigation';

// A tela de Bloqueios foi absorvida por Pendências: bloqueio é um tipo de
// pendência, não uma tela própria. Ficava vazia (0 atividades bloqueadas e 0
// projetos com `blockers`) enquanto 92 atividades venciam sem onde aparecer.
// O redirect fica para não quebrar link salvo ou favorito.
export default function LegacyBlockedPage() {
  redirect('/pendencias');
}
