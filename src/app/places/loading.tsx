export default function PlacesLoading() {
  return <main className="min-h-dvh bg-[#F7F9FC] pb-12">
    <div className="h-64 animate-pulse bg-[#0A2E63] sm:h-72"/>
    <div className="mx-auto max-w-6xl px-4 py-7 sm:px-8"><div className="h-20 animate-pulse rounded-2xl bg-white"/><div className="mt-6 h-6 w-56 animate-pulse rounded bg-slate-200"/><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3].map((i)=><div key={i} className="overflow-hidden rounded-2xl bg-white"><div className="aspect-[4/3] animate-pulse bg-slate-200"/><div className="space-y-3 p-4"><div className="h-3 w-24 animate-pulse rounded bg-slate-100"/><div className="h-5 w-3/4 animate-pulse rounded bg-slate-200"/></div></div>)}</div></div>
  </main>;
}
