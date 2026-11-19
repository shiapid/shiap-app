import type {ReactNode} from "react";
import Image from "next/image";
import Link from "next/link";
import { MapPin, ArrowRight } from "lucide-react";

export type StayCatalogItem = {
  id: string; slug: string; name: string; location: string; short_description?: string | null;
  cover_image_url?: string | null; facilities?: string[] | null; featured?: boolean | null;
  stay_room_types?: { id: string; name: string; capacity: number; weekday_price: number; weekend_price: number; status: string }[];
};
const idr = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

export default function StayCatalogClient({ properties, destinationFilter }: { properties: StayCatalogItem[]; destinationFilter?:ReactNode }) {
  return <main className="min-h-screen bg-[#F7F9FC] pb-16">
    <section className="bg-[#0A2E63] px-5 py-12 text-white sm:px-8 sm:py-16"><div className="mx-auto max-w-7xl"><p className="text-[10px] font-bold uppercase tracking-[.22em] text-blue-200">SHIAP STAY</p><h1 className="mt-2 text-3xl font-extrabold sm:text-5xl">Find your place to stay.</h1><p className="mt-3 max-w-xl text-sm text-blue-100">Temukan akomodasi nyaman untuk melengkapi perjalananmu di Kotabaru.</p></div></section>
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-8"><div className="mb-5 flex items-end justify-between"><div><p className="text-[10px] font-bold uppercase tracking-widest text-[#1974FF]">Stay with SHIAP</p><h2 className="mt-1 text-xl font-bold text-[#0A2E63]">Pilihan akomodasi</h2></div><span className="text-xs text-slate-400">{properties.length} properti</span></div>
      {destinationFilter}
      {properties.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5">{properties.map((p) => { const rooms=(p.stay_room_types||[]).filter(r=>r.status==="active"); const minPrice=rooms.length?Math.min(...rooms.map(r=>Math.min(Number(r.weekday_price)||Infinity,Number(r.weekend_price)||Infinity)).filter(Number.isFinite)):null; return <article key={p.id} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"><Link href={`/stay/${p.slug}`}><div className="relative aspect-[4/3] bg-slate-200">{p.cover_image_url?<Image src={p.cover_image_url} alt={p.name} fill sizes="(max-width:640px) 50vw,33vw" unoptimized className="object-cover"/>:null}{p.featured&&<span className="absolute left-2 top-2 rounded-full bg-white px-2 py-1 text-[9px] font-bold text-[#0A2E63]">FEATURED</span>}</div><div className="p-3 sm:p-4"><p className="flex items-center gap-1 text-[10px] text-slate-400"><MapPin size={12}/>{p.location}</p><h3 className="mt-2 line-clamp-2 text-sm font-bold text-[#0A2E63] sm:text-base">{p.name}</h3><p className="mt-1 line-clamp-2 text-[10px] text-slate-500 sm:text-xs">{p.short_description}</p><div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-[10px] font-semibold text-[#1974FF]">{minPrice?`Mulai ${idr(minPrice)}`:"Lihat tipe kamar"}</span><ArrowRight size={15} className="text-[#1974FF]"/></div></div></Link></article>})}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Belum ada properti yang dipublikasikan.</div>}
    </section>
  </main>;
}
