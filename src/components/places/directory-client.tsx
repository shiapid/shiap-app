import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, MapPin, Search, ShieldCheck } from "lucide-react";
import { buildWhatsAppUrl } from "@/lib/places/utils";
import { accommodationLabels, formatIdr, type PlacesDestination, type PlacesListing } from "@/lib/places/types";
import { PlacesWhatsAppLink } from "@/components/places/whatsapp-link";

function PropertyCard({ item }: { item: DirectoryListing }) {
  const refCode = item.ref_code;
  const whatsAppUrl = buildWhatsAppUrl({ phone: item.whatsapp_phone, propertyName: item.name, refCode });
  const price = formatIdr(item.starting_price_idr);
  const hasProfile = Boolean(item.description || item.cover_image_url || item.gallery_urls?.length || item.capacity || price || item.facilities?.length || item.room_summaries?.length || item.policies || item.map_url || item.stay_slug);
  if (!hasProfile) return <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(10,46,99,.045)]">
    <div className="p-4">
      <p className="flex items-center gap-1.5 text-xs text-slate-500"><MapPin size={14} className="shrink-0 text-[#1265D8]"/>{item.destination_name}{item.city ? ` · ${item.city}` : ""}</p>
      <h2 className="mt-2 break-words text-base font-extrabold text-[#0A2E63]">{item.name}</h2>
      <p className="mt-1 inline-flex items-center gap-1 text-xs text-[#1265D8]"><BadgeCheck size={14}/>Kontak terverifikasi</p>
    </div>
    {whatsAppUrl ? <div className="border-t border-slate-100 px-4 py-3"><PlacesWhatsAppLink href={whatsAppUrl} propertyId={item.id} refCode={refCode} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"/></div> : null}
  </article>;
  return <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(10,46,99,.045)]">
    <Link href={`/places/${encodeURIComponent(item.slug)}`} className="group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1265D8]">
      {item.cover_image_url ? <div className="relative aspect-[4/3] bg-[#E9EFF6]">
        {item.cover_image_url ? <Image src={item.cover_image_url} alt={item.name} fill unoptimized sizes="(max-width: 640px) 92vw, (max-width: 1024px) 45vw, 32vw" className="object-cover transition duration-500 group-hover:scale-[1.02]" /> : <div className="flex h-full items-center justify-center text-[#1265D8]/45"><Building2 size={38} strokeWidth={1.4}/></div>}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1.5 text-[10px] font-bold text-[#0A2E63]"><BadgeCheck size={14} className="text-[#1265D8]"/> Kontak terverifikasi</span>
      </div> : null}
      <div className="p-4">
        <p className="flex items-center gap-1.5 text-xs text-slate-500"><MapPin size={14} className="shrink-0 text-[#1265D8]"/>{item.destination_name}{item.city ? ` · ${item.city}` : ""}</p>
        <h2 className="mt-2 line-clamp-2 text-base font-extrabold text-[#0A2E63]">{item.name}</h2>
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-[#1265D8]"><BadgeCheck size={14}/>Kontak terverifikasi</p>
        {item.accommodation_type !== "other" ? <p className="mt-1 text-xs text-slate-500">{accommodationLabels[item.accommodation_type] ?? "Penginapan"}</p> : null}
        {item.capacity ? <p className="mt-2 text-xs text-slate-600">Kapasitas hingga {item.capacity} tamu</p> : null}
        {price ? <p className="mt-2 text-xs font-bold text-[#1265D8]">Mulai {price}</p> : null}
      </div>
    </Link>
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
      <Link href={`/places/${encodeURIComponent(item.slug)}`} className="inline-flex min-h-10 items-center gap-1 text-xs font-bold text-[#1265D8]">Lihat detail <ArrowRight size={14}/></Link>
      {whatsAppUrl ? <PlacesWhatsAppLink href={whatsAppUrl} propertyId={item.id} refCode={refCode} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-50 px-3 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"/> : null}
    </div>
  </article>;
}

export type DirectoryListing = PlacesListing & { ref_code: string };

export function PlacesDirectory({ destinations, listings, query, destinationSlug, loadError }: {
  destinations: PlacesDestination[]; listings: DirectoryListing[]; query: string; destinationSlug: string; loadError: boolean;
}) {
  const currentDestination = destinations.find((destination) => destination.slug === destinationSlug);
  return <main className="min-h-dvh bg-[#F7F9FC] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#0A2E63]">
    <section className="relative overflow-hidden bg-[#0A2E63] px-4 pb-8 pt-8 text-white sm:px-8 sm:pb-10 sm:pt-11">
      <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full border border-white/10" aria-hidden="true"/>
      <div className="absolute -right-4 -top-12 h-40 w-40 rounded-full border border-[#FF8518]/30" aria-hidden="true"/>
      <div className="relative mx-auto max-w-6xl">
        <p className="text-[10px] font-extrabold tracking-[.2em] text-blue-200">DISCOVER YOUR NEXT STAY.</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">Temukan Tempat Menginap Terpercaya.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">Jelajahi villa, homestay, dan penginapan berdasarkan destinasi wisata. Temukan kontak resmi, informasi properti, dan pilihan reservasi yang tersedia.</p>
        <p className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 text-xs font-bold"><ShieldCheck size={16} className="text-[#FF8518]"/> Kontak Terverifikasi SHIAP</p>
      </div>
    </section>
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
        <p className="text-xs text-slate-500">{listings.length} properti</p>
      </div>
      {loadError ? <div role="status" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Direktori sedang disiapkan. Silakan coba lagi beberapa saat lagi.</div> : listings.length ? <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{listings.map((item) => <PropertyCard item={item} key={item.id}/>)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-[#1265D8]"><Building2 size={23}/></span>
        <h3 className="mt-3 text-base font-extrabold">{query || destinationSlug ? "Belum ada hasil yang cocok" : "Listing terverifikasi segera hadir"}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{query || destinationSlug ? "Coba ubah kata kunci atau pilih Semua lokasi." : "SHIAP sedang menyiapkan direktori penginapan. Informasi properti hanya ditampilkan setelah kontaknya diverifikasi."}</p>
        {(query || destinationSlug) ? <Link href="/places" className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-blue-200 px-4 text-xs font-bold text-[#1265D8]">Lihat semua lokasi</Link> : null}
      </div>}
      <section className="mt-8 rounded-2xl border border-blue-100 bg-white p-5 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6">
        <div><p className="text-[10px] font-extrabold tracking-[.15em] text-[#1265D8]">UNTUK PEMILIK PROPERTI</p><h2 className="mt-1 text-lg font-extrabold">Punya villa atau penginapan?</h2><p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">Daftarkan properti Anda di Places. Mulai dengan kontak resmi, lalu kembangkan bisnis dengan sistem booking dan pengelolaan properti SHIAP.</p></div>
        <Link href="/places/partners" className="mt-4 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-[#0A2E63] px-4 text-xs font-bold text-white hover:bg-[#1265D8] sm:mt-0">Pelajari kemitraan <ArrowRight size={15}/></Link>
      </section>
    </section>
  </main>;
}
