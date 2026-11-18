export default function ExploreLoading() {
  return <main aria-busy="true" className="mx-auto max-w-6xl px-3 pb-24 pt-3 sm:px-6">
    <h1 className="text-xl font-bold text-[#0A2E63]">Jelajah</h1>
    <p role="status" className="sr-only">Memuat katalog SHIAP</p>
    <div aria-hidden className="mt-2 space-y-2 motion-safe:animate-pulse">
      <div className="h-12 rounded-xl bg-slate-200" />
      <div className="h-11 rounded-xl bg-slate-200" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((card) => <div key={card} className="aspect-square rounded-xl bg-slate-200" />)}
      </div>
    </div>
  </main>;
}
