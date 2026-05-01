export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
          Migracao Next.js
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-foreground">Login em migracao</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Esta tela sera conectada ao fluxo de autenticacao com Supabase na proxima etapa.
        </p>
      </div>
    </main>
  )
}
