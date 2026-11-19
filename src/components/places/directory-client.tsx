import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, MapPin, Search } from "lucide-react";
import { buildWhatsAppUrl } from "@/lib/places/utils";
import { type PlacesDestination, type PlacesListing } from "@/lib/places/types";
import { PlacesWhatsAppLink } from "@/components/places/whatsapp-link";

function PropertyCard({item,template}:{item:DirectoryListing;template:string}) {
 const url=buildWhatsAppUrl({phone:item.whatsapp_phone,propertyName:item.name,refCode:item.ref_code,template});
 return <article className="flex min-h-20 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 sm:px-4">
  <div className="min-w-0 flex-1 sm:grid sm:grid-cols-2 sm:items-center sm:gap-4"><h3 className="flex min-w-0 items-center gap-1.5 text-sm font-extrabold text-[#0A2E63]"><span className="truncate" title={item.name}>{item.name}</span><BadgeCheck aria-label="Kontak terverifikasi" size={15} className="shrink-0 text-[#1265D8]"/></h3><p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-slate-500 sm:mt-0"><MapPin size={13} className="shrink-0"/><span className="truncate" title={item.destination_name}>{item.destination_name}</span></p></div>
  {url?<PlacesWhatsAppLink href={url} propertyId={item.id} refCode={item.ref_code} label="Hubungi" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-xl bg-emerald-50 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100"/>:null}
 </article>;
}

export type DirectoryListing = PlacesListing & { ref_code: string };

export function PlacesDirectory({ page, total, template, destinations, listings, query, destinationSlug, loadError }: {
  page: number; total: number; template: string; destinations: PlacesDestination[]; listings: DirectoryListing[]; query: string; destinationSlug: string; loadError: boolean;
}) {
  const currentDestination = destinations.find((destination) => destination.slug === destinationSlug);
  return <main className="min-h-dvh bg-[#F7F9FC] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#0A2E63]">
    <header className="mx-auto max-w-6xl px-4 pb-1 pt-6 sm:px-8"><h1 className="text-2xl font-extrabold">Places</h1><p className="mt-1 text-sm text-slate-500">Temukan penginapan berdasarkan destinasi wisata.</p></header>
    <section className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
      <form action="/places" method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-[1fr_minmax(190px,.62fr)_auto] sm:items-end sm:p-4">
        <label className="block text-xs font-bold text-slate-600">Cari properti atau lokasi
          <span className="mt-1.5 flex h-12 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-[#1265D8] focus-within:ring-2 focus-within:ring-blue-100"><Search size={17} className="shrink-0 text-[#1265D8]"/><input name="q" defaultValue={query} maxLength={80} placeholder="Cari villa, homestay, lokasi..." className="min-w-0 flex-1 bg-transparent text-sm text-[#0A2E63] outline-none placeholder:text-slate-400"/></span>
        </label>
        <label className="block text-xs font-bold text-slate-600">Destinasi
          <select name="destination" defaultValue={destinationSlug} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#0A2E63] outline-none focus:border-[#1265D8] focus:ring-2 focus:ring-blue-100">
            <option value="">Semua lokasi</option>{destinations.map((item) => <option key={item.id} value={item.slug}>{item.name} ({item.listing_count})</option>)}
          </select>
        </label>
        <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#1265D8] px-5 text-sm font-bold text-white hover:bg-[#0A2E63] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1265D8]">Cari penginapan <Search size={16}/></button>
      </form>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-2">
        <div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#1265D8]">Direktori Places</p><h2 className="mt-1 text-xl font-extrabold">{currentDestination ? currentDestination.name : "Penginapan terverifikasi"}</h2></div>
        <p className="text-xs text-slate-500">{total} properti</p>
      </div>
      {loadError ? <div role="status" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Direktori sedang disiapkan. Silakan coba lagi beberapa saat lagi.</div> : listings.length ? <div className="mt-4 space-y-2">{listings.map((item) => <PropertyCard item={item} key={item.id} template={template}/>)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-[#1265D8]"><Building2 size={23}/></span>
        <h3 className="mt-3 text-base font-extrabold">{query || destinationSlug ? "Belum ada hasil yang cocok" : "Listing terverifikasi segera hadir"}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{query || destinationSlug ? "Coba ubah kata kunci atau pilih Semua lokasi." : "SHIAP sedang menyiapkan direktori penginapan. Informasi properti hanya ditampilkan setelah kontaknya diverifikasi."}</p>
        {(query || destinationSlug) ? <Link href="/places" className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-blue-200 px-4 text-xs font-bold text-[#1265D8]">Lihat semua lokasi</Link> : null}
      </div>}
      <nav aria-label="Halaman direktori" className="mt-4 flex items-center gap-4 text-sm font-bold text-[#1265D8]">{page>1?<Link className="min-h-11 py-3" href={'/places?'+new URLSearchParams({q:query,destination:destinationSlug,page:String(page-1)})}>Sebelumnya</Link>:null}{page*25<total?<Link className="min-h-11 py-3" href={'/places?'+new URLSearchParams({q:query,destination:destinationSlug,page:String(page+1)})}>Berikutnya</Link>:null}</nav>
      <section className="mt-8 rounded-2xl border border-blue-100 bg-white p-5 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6">
        <div><p className="text-[10px] font-extrabold tracking-[.15em] text-[#1265D8]">UNTUK PEMILIK PROPERTI</p><h2 className="mt-1 text-lg font-extrabold">Punya villa atau penginapan?</h2><p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">Daftarkan properti Anda di Places. Mulai dengan kontak resmi, lalu kembangkan bisnis dengan sistem booking dan pengelolaan properti SHIAP.</p></div>
        <Link href="/places/partners" className="mt-4 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-[#0A2E63] px-4 text-xs font-bold text-white hover:bg-[#1265D8] sm:mt-0">Pelajari kemitraan <ArrowRight size={15}/></Link>
      </section>
    </section>
  </main>;
}
