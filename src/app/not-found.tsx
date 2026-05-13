import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">404</p>
        <h1 className="text-3xl font-semibold">Pagina nao encontrada</h1>
        <p className="text-sm text-muted-foreground">
          O conteudo solicitado nao existe ou nao esta mais disponivel.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Voltar ao inicio
        </Link>
      </div>
    </main>
  )
}