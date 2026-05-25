import type { Metadata } from 'next'
import { Providers } from './providers'
import '../index.css'

export const metadata: Metadata = {
  title: 'Gestão Pro',
  description: 'Plataforma de gestao de projetos.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
