export function Skeleton() {
  return <div role="status" aria-label="Carregando conteúdo" className="space-y-6">
    <span className="sr-only">Carregando conteúdo…</span>
    <div className="h-9 w-60 animate-pulse rounded-lg bg-slate-200" />
    <div className="grid gap-5 sm:grid-cols-3">
      {[1, 2, 3].map(n => <div key={n} className="h-32 animate-pulse rounded-xl bg-slate-200/70" />)}
    </div>
    <div className="h-80 animate-pulse rounded-xl bg-slate-200/70" />
  </div>;
}
