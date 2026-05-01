import Link from 'next/link'

const migrationSteps = [
  'Bootstrap do App Router concluido',
  'Proxima etapa: providers e clientes Supabase para auth SSR',
  'Migracao funcional sera feita por fatias, sem reaproveitar o entrypoint Vite',
]

export default function DashboardHomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-16">
      <div className="rounded-3xl border bg-card p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
          Insight Finder Pal
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground">
          Base Next pronta para a migracao gradual.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          A branch agora inicia pelo App Router e mantem o codigo legado desacoplado da entrada principal.
        </p>

        <ul className="mt-8 space-y-3 text-sm text-foreground">
          {migrationSteps.map((step) => (
            <li key={step} className="rounded-2xl border bg-background px-4 py-3">
              {step}
            </li>
          ))}
        </ul>

        <div className="mt-8">
          <Link
            href="/login"
            className="inline-flex items-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Ver rota de login
          </Link>
        </div>
      </div>
    </main>
  )
}
