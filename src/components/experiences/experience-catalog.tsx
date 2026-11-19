import type {ReactNode} from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock3, MapPin, ShieldCheck } from "lucide-react";
import { Camera, Waves } from "lucide-react";

export type ExperienceCardData = {
  id: string; slug: string; title: string; tagline: string; description: string;
  duration: string; location_label: string; cover_image_url: string | null;
  highlights: string[]; is_demo: boolean; category: { name: string; slug: string };
  packages: { id: string; title: string; price: number; price_label: string; pricing_basis: string }[];
};

export type PublicExperience = {
  id: string; experience_type: "activity" | "documentation"; catalog_category?: string | null;
  rental_category?: string | null; title: string; slug: string; short_description?: string | null;
  description?: string | null; duration?: string | null; location: string; base_price: number;
  price_basis: "per_person" | "per_unit"; price_unit_label: string; highlights?: string[] | null;
  inclusions?: string[] | null; cover_image_url?: string | null; featured?: boolean | null;
  addons?: { id: string; name: string; price: number }[] | null; bundle_requires?: unknown;
};

export default function LegacyExperienceCatalog({ type, viewMode, items, error }: { type: "activity" | "documentation"; viewMode?: "catalog" | "rental"; items: PublicExperience[]; error?: boolean }) {
  const title = type === "documentation" ? "Shinema" : viewMode === "rental" ? "Rental wisata" : "Aktivitas laut & wahana";
  const subtitle = type === "documentation" ? "Pilih paket foto dan video untuk perjalananmu." : viewMode === "rental" ? "Peralatan wisata yang tersedia di katalog SHIAP." : "Temukan aktivitas dan wahana laut di Kotabaru.";
  return <main className="mx-auto min-h-dvh max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-8">
    <header className="rounded-[22px] bg-gradient-to-r from-[#0A2E63] to-[#1974FF] p-6 text-white"><p className="text-[10px] font-extrabold tracking-[.2em]">JELAJAHI SHIAP</p><h1 className="mt-2 text-3xl font-extrabold">{title}</h1><p className="mt-2 text-sm text-white/80">{subtitle}</p></header>
    {error&&<p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Katalog sedang tidak dapat dimuat. Silakan coba kembali.</p>}
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((item)=><article key={item.id} className="overflow-hidden rounded-[22px] border border-blue-100 bg-white shadow-sm"><div className="relative aspect-[16/10] bg-gradient-to-br from-[#0A2E63] to-[#25A4B8]">{item.cover_image_url&&<Image src={item.cover_image_url} alt="" fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover"/>}</div><div className="p-4"><p className="text-[10px] font-bold text-[#1974FF]">{item.location}</p><h2 className="mt-1 font-extrabold text-[#0A2E63]">{item.title}</h2><p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-500">{item.short_description??item.description}</p><p className="mt-3 text-[10px] text-slate-500">{item.duration??"Durasi dikonfirmasi"}</p><p className="mt-2 text-sm font-extrabold text-[#0A2E63]">{money(Number(item.base_price))}<span className="ml-1 text-[10px] font-medium text-slate-500">/{item.price_unit_label}</span></p><Link href={`/booking?service=${encodeURIComponent(item.id)}&type=${item.experience_type}`} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1974FF] px-4 py-3 text-xs font-bold text-white">Pilih layanan<ArrowRight size={14}/></Link></div></article>)}</div>
    {!items.length&&!error&&<section className="mt-5 rounded-2xl border border-dashed border-blue-200 bg-white p-8 text-center"><h2 className="font-bold text-[#0A2E63]">Belum ada produk tersedia</h2><p className="mt-1 text-sm text-slate-500">Paket akan ditampilkan setelah admin memublikasikannya.</p></section>}
    {type==="activity"&&<p className="mt-5 flex items-center justify-center gap-2 text-[10px] text-slate-400"><Waves size={14}/>{viewMode==="rental"?"Rental SHIAP":"Aktivitas laut"} · disesuaikan dengan katalog aktif</p>}
    {type==="documentation"&&<p className="mt-5 flex items-center justify-center gap-2 text-[10px] text-slate-400"><Camera size={14}/>Dokumentasi perjalanan SHINEMA</p>}
  </main>;
}

const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

export function ExperienceCatalog({ items, categories, destinationFilter }: { items: ExperienceCardData[]; categories: { slug: string; name: string }[]; destinationFilter?:ReactNode }) {
  return <main className="mx-auto min-h-dvh max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-8">
    <header className="overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0A2E63] via-[#1265D8] to-[#1B83D6] px-6 py-8 text-white shadow-lg sm:px-9 sm:py-10">
      <p className="text-[10px] font-extrabold tracking-[.2em] text-blue-100">SHIAP EXPERIENCES</p>
      <h1 className="mt-3 max-w-2xl text-3xl font-extrabold leading-tight sm:text-4xl">Pengalaman yang dirancang untuk menjelajah lebih dekat.</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-white/85">Kelas laut, petualangan, dining, dan momen spesial. Jadwal dan lokasi akan ditampilkan setelah dikonfirmasi operasional.</p>
    </header>
    {destinationFilter}
    <nav aria-label="Kategori Experience" className="my-5 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">
      {categories.map((category) => <a key={category.slug} href={`#${category.slug}`} className="shrink-0 rounded-full border border-blue-100 bg-white px-4 py-2 text-xs font-bold text-[#0A2E63] hover:border-[#1974FF]">{category.name}</a>)}
    </nav>
    {categories.map((category) => {
      const categoryItems = items.filter((item) => item.category.slug === category.slug);
      if (!categoryItems.length) return null;
      return <section id={category.slug} key={category.slug} className="mb-9 scroll-mt-24">
        <div className="mb-4"><h2 className="text-xl font-extrabold text-[#0A2E63]">{category.name}</h2></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categoryItems.map((item) => <article key={item.id} className="overflow-hidden rounded-[22px] border border-blue-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
            <Link href={`/experiences/${item.slug}`} className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1974FF]">
              <div className="relative aspect-[16/10] bg-gradient-to-br from-[#0A2E63] to-[#19A0B9]">
                {item.cover_image_url && <Image src={item.cover_image_url} alt="" fill unoptimized sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover"/>}
                {item.is_demo && <span className="absolute left-3 top-3 rounded-full bg-[#FF8518] px-2.5 py-1 text-[9px] font-extrabold text-white">DEMO</span>}
              </div>
              <div className="p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#1974FF]">{category.name}</p>
                <h3 className="mt-1 text-base font-extrabold text-[#0A2E63]">{item.title}</h3>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{item.tagline || item.description}</p>
                {item.is_demo ? <p className="mt-3 text-xs font-semibold text-[#1265D8]">Lihat pratinjau <ArrowRight size={14} className="inline" /></p> : <>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500"><span className="inline-flex items-center gap-1"><Clock3 size={12}/>{item.duration || "Durasi dikonfirmasi"}</span><span className="inline-flex items-center gap-1"><MapPin size={12}/>{item.location_label}</span></div>
                <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-3"><span><span className="block text-[9px] text-slate-500">Mulai dari</span><strong className="text-sm font-extrabold text-[#0A2E63]">{money(Math.min(...item.packages.map((p) => Number(p.price))))}<small className="ml-1 text-[10px] font-semibold text-slate-500">/{item.packages[0]?.price_label ?? "paket"}</small></strong></span><span className="inline-flex items-center gap-1 text-xs font-bold text-[#1974FF]">Lihat detail<ArrowRight size={14}/></span></div>
                <p className="mt-3 inline-flex items-center gap-1 text-[9px] text-slate-500"><ShieldCheck size={12} className="text-emerald-600"/>Tanggal dan ketersediaan dikonfirmasi admin</p>
                </>}
              </div>
            </Link>
          </article>)}
        </div>
      </section>;
    })}
    {!items.length && <section className="mt-10 rounded-2xl border border-dashed border-blue-200 bg-white p-8 text-center"><h2 className="font-bold text-[#0A2E63]">Pengalaman sedang disiapkan</h2><p className="mt-1 text-sm text-slate-500">Katalog akan muncul setelah paket dipublikasikan oleh admin.</p></section>}
  </main>;
}
