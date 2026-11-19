import Link from "next/link";
import { PlacesDirectorySearch } from "./directory-search";
import { ArrowRight, BadgeCheck, Building2, MapPin } from "lucide-react";
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
    <header className="mx-auto max-w-6xl px-4 pb-0 pt-4 sm:px-8"><h1 className="text-xl font-extrabold">Places</h1><p className="mt-1 text-xs text-slate-500">Temukan penginapan berdasarkan destinasi wisata.</p></header>
    <section className="mx-auto max-w-6xl px-4 pb-6 pt-3 sm:px-8">
      <PlacesDirectorySearch query={query} destinationSlug={destinationSlug} destinations={destinations} loadError={loadError}/>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-base font-extrabold">{currentDestination ? currentDestination.name : "Penginapan terverifikasi"}</h2></div>
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
