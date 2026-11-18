import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, MapPin, ShieldAlert, ShieldCheck } from "lucide-react";
import ExperienceBookingForm from "@/components/experiences/experience-booking-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
type Experience = { id: string; category_id: string; slug: string; title: string; tagline: string; description: string; duration: string; location_label: string; cover_image_url: string | null; gallery_urls: string[]; highlights: string[]; inclusions: string[]; exclusions: string[]; prerequisites: string[]; safety_information: string[]; cancellation_policy: string; faq: { question: string; answer: string }[]; is_demo: boolean };
type Package = { id: string; title: string; description: string; duration: string; price: number; pricing_basis: string; price_label: string; booking_mode: string; min_guests: number; max_guests: number };

export default async function ExperienceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, supabase] = await Promise.all([params, createClient()]);
  const { data: row } = await supabase.from("shiap_experience_products").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
  if (!row) notFound();
  const product = row as Experience;
  if (product.is_demo) {
    const { data: category } = await supabase.from("shiap_experience_categories").select("name").eq("id", product.category_id).maybeSingle();
    return <main className="mx-auto max-w-2xl px-3 pb-24 pt-3 sm:px-6 sm:pt-5">
      <Link href="/experiences" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#1265D8]"><ArrowLeft size={16} /> Semua Experience</Link>
      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="relative aspect-[16/9] bg-blue-50">
          <Image src={product.cover_image_url || "/demo/shiap-demo-experience.svg"} alt="" fill priority unoptimized sizes="(min-width: 640px) 640px, 100vw" className="object-cover" />
          <span className="absolute left-3 top-3 rounded-full bg-[#FF8518] px-3 py-1 text-xs font-bold text-[#0A2E63]">Pratinjau demo</span>
        </div>
        <div className="p-4 sm:p-5">
          {category && <p className="text-sm font-semibold text-[#1265D8]">{category.name}</p>}
          <h1 className="mt-1 text-2xl font-bold text-[#0A2E63]">{product.title.replace(/^DEMO\s*[—–-]\s*/i, "")}</h1>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{product.description}</p>
          <p className="mt-4 rounded-xl bg-orange-50 p-3 text-sm text-orange-900">Pratinjau ini belum bisa dipesan atau dibayar.</p>
        </div>
      </article>
    </main>;
  }
  const [{ data: category }, { data: packageRows }] = await Promise.all([
    supabase.from("shiap_experience_categories").select("name").eq("id", product.category_id).maybeSingle(),
    supabase.from("shiap_experience_packages").select("id,title,description,duration,price,pricing_basis,price_label,booking_mode,min_guests,max_guests").eq("product_id", product.id).eq("status", "published").eq("is_demo", false).order("sort_order"),
  ]);
  const packages = (packageRows ?? []) as Package[];
  if (!packages.length) notFound();
  const packageIds = packages.map((item) => item.id);
  const [{ data: addonRows }, { data: sessionRows }] = await Promise.all([
    supabase.from("shiap_experience_addons").select("package_id,slug,name,price").in("package_id", packageIds).eq("is_active", true).order("sort_order"),
    supabase.from("shiap_experience_sessions").select("id,package_id,starts_at,ends_at,capacity,weather_status,location_note").in("package_id", packageIds).eq("status", "open").gt("starts_at", new Date().toISOString()).order("starts_at"),
  ]);
  const packageOptions = packages.map((item) => ({ ...item, price: Number(item.price), addons: (addonRows ?? []).filter((a) => a.package_id === item.id).map((a) => ({ slug: a.slug, name: a.name, price: Number(a.price) })) }));
  const sessions = (sessionRows ?? []).map((session) => ({ ...session, capacity: Number(session.capacity) }));
  return <main className="mx-auto min-h-dvh max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-8">
    <Link href="/experiences" className="inline-flex items-center gap-2 text-xs font-bold text-[#1974FF]"><ArrowLeft size={15}/>Semua Experience</Link>
    <div className="mt-4 grid gap-7 lg:grid-cols-[1.1fr_.9fr] lg:items-start">
      <div>
        <div className="relative aspect-[16/10] overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0A2E63] to-[#1AA2B8]">
          {product.cover_image_url && <Image src={product.cover_image_url} alt="" fill priority unoptimized sizes="(max-width: 1024px) 100vw, 55vw" className="object-cover"/>}
          {product.is_demo && <span className="absolute left-4 top-4 rounded-full bg-[#FF8518] px-3 py-1.5 text-[10px] font-extrabold text-white">KONTEN DEMO</span>}
        </div>
        {product.gallery_urls?.length > 0 && <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{product.gallery_urls.map((url,index)=><div key={`${url}-${index}`} className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-blue-50"><Image src={url} alt={`${product.title}, foto ${index+1}`} fill unoptimized sizes="112px" className="object-cover"/></div>)}</div>}
        <div className="mt-5"><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#1974FF]">{category?.name}</p><h1 className="mt-2 text-3xl font-extrabold leading-tight text-[#0A2E63]">{product.title}</h1><p className="mt-2 text-sm text-slate-600">{product.tagline}</p><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><Clock3 size={14}/>{product.duration || "Durasi dikonfirmasi admin"}</span><span className="inline-flex items-center gap-1.5"><MapPin size={14}/>{product.location_label}</span></div></div>
        <section className="mt-6"><h2 className="text-base font-extrabold text-[#0A2E63]">Tentang pengalaman</h2><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{product.description}</p></section>
        {product.highlights?.length > 0 && <section className="mt-6"><h2 className="text-base font-extrabold text-[#0A2E63]">Sorotan</h2><ul className="mt-3 grid gap-2 sm:grid-cols-2">{product.highlights.map((item) => <li key={item} className="flex items-start gap-2 rounded-xl bg-white p-3 text-xs text-slate-700"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[#1974FF]"/>{item}</li>)}</ul></section>}
        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          {[{title:"Termasuk", items:product.inclusions},{title:"Tidak termasuk",items:product.exclusions},{title:"Persyaratan peserta",items:product.prerequisites},{title:"Informasi keselamatan",items:product.safety_information}].map((group) => <article key={group.title} className="rounded-2xl border border-blue-100 bg-white p-4"><h2 className="flex items-center gap-2 text-sm font-extrabold text-[#0A2E63]">{group.title.includes("keselamatan")?<ShieldAlert size={15}/>:<CheckCircle2 size={15}/ >}{group.title}</h2><ul className="mt-2 space-y-2">{group.items.map((item) => <li key={item} className="text-xs leading-5 text-slate-600">• {item}</li>)}</ul></article>)}
        </section>
        <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"><h2 className="flex items-center gap-2 text-sm font-extrabold text-amber-900"><ShieldCheck size={16}/>Ketersediaan dan keselamatan</h2><p className="mt-1 text-xs leading-5 text-amber-900/80">Permintaan akan diperiksa admin. Jangan melakukan pembayaran sebelum persetujuan dan tagihan resmi tampil di akun.</p></section>
        <section className="mt-5 rounded-2xl border border-blue-100 bg-white p-4"><h2 className="text-sm font-extrabold text-[#0A2E63]">Kebijakan pembatalan</h2><p className="mt-2 text-xs leading-5 text-slate-600">{product.cancellation_policy}</p></section>
        {product.faq?.length > 0 && <section className="mt-5 space-y-2"><h2 className="text-base font-extrabold text-[#0A2E63]">Pertanyaan umum</h2>{product.faq.map((faq) => <details key={faq.question} className="rounded-xl border border-blue-100 bg-white p-4"><summary className="cursor-pointer text-xs font-bold text-[#0A2E63]">{faq.question}</summary><p className="mt-2 text-xs leading-5 text-slate-600">{faq.answer}</p></details>)}</section>}
        <section className="mt-6"><h2 className="text-base font-extrabold text-[#0A2E63]">Pilihan paket</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{packages.map((item) => <article key={item.id} className="rounded-2xl border border-blue-100 bg-white p-4"><h3 className="text-sm font-extrabold text-[#0A2E63]">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{item.description}</p><p className="mt-3 text-lg font-extrabold text-[#1974FF]">{money(Number(item.price))}<small className="ml-1 text-xs font-semibold text-slate-500">/{item.price_label}</small></p><p className="mt-1 text-[10px] text-slate-500">{item.booking_mode === "request_to_book" ? "Permintaan booking · menunggu admin" : item.booking_mode.replaceAll("_"," ")}</p></article>)}</div></section>
      </div>
      <div className="lg:sticky lg:top-24"><ExperienceBookingForm packages={packageOptions} sessions={sessions}/></div>
    </div>
  </main>;
}
