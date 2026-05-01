import type { Metadata } from 'next'

import '../index.css'

export const metadata: Metadata = {
  title: 'Insight Finder Pal',
  description: 'Base Next.js para a migracao gradual do projeto de gestao.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
