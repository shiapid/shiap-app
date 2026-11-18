import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, BadgeCheck, MapPin, UsersRound } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createPlacesReferralCode } from "@/lib/places/referral";
import { buildWhatsAppUrl } from "@/lib/places/utils";
import { accommodationLabels, formatIdr, type PlacesListing } from "@/lib/places/types";
import { PlacesWhatsAppLink } from "@/components/places/whatsapp-link";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

async function getProperty(slug: string) {
  const supabase = await createClient();
  return supabase.from("places_public_directory_v").select("id,slug,name,accommodation_type,whatsapp_phone,contact_verified_at,destination_id,destination_slug,destination_name,city,province,destination_aliases,description,cover_image_url,gallery_urls,capacity,facilities,room_summaries,starting_price_idr,policies,map_url,stay_slug,search_document").eq("slug", slug).maybeSingle();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const { data } = await getProperty(slug);
    if (!data) return { title: "Penginapan tidak ditemukan" };
    return { title: data.name, description: `${data.name} di ${data.destination_name}. Kontak resmi diverifikasi SHIAP.` };
  } catch { return { title: "Places" }; }
}

export default async function PlacesPropertyPage({ params }: Props) {
  const { slug } = await params;
  let result;
  try { result = await getProperty(slug); }
  catch { return <main className="min-h-dvh bg-[#F7F9FC] px-4 py-12 text-center text-sm text-slate-600">Informasi Places belum dapat dimuat. Silakan coba lagi.</main>; }
  if (result.error) return <main className="min-h-dvh bg-[#F7F9FC] px-4 py-12 text-center text-sm text-slate-600">Informasi Places belum dapat dimuat. Silakan coba lagi.</main>;
  if (!result.data) notFound();
  const property = result.data as PlacesListing;
  const refCode = createPlacesReferralCode();
  const whatsAppUrl = buildWhatsAppUrl({ phone: property.whatsapp_phone, propertyName: property.name, refCode });
  const mapUrl = property.map_url && /^https?:\/\//i.test(property.map_url) ? property.map_url : null;
  const verifiedDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(property.contact_verified_at));
  const price = formatIdr(property.starting_price_idr);
  return <main className="min-h-dvh bg-[#F7F9FC] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#0A2E63]">
    <div className="mx-auto max-w-5xl px-4 py-5 sm:px-8 sm:py-8">
      <Link href="/places" className="inline-flex min-h-10 items-center gap-2 text-xs font-bold text-[#1265D8]"><ArrowLeft size={16}/> Kembali ke Places</Link>
      <article className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="relative aspect-[16/8] min-h-52 bg-[#E9EFF6] sm:aspect-[16/7]">
          {property.cover_image_url ? <Image src={property.cover_image_url} alt={property.name} fill unoptimized priority sizes="100vw" className="object-cover"/> : <div className="flex h-full items-center justify-center text-5xl font-bold text-[#1265D8]/25">Places</div>}
          <span className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-[11px] font-extrabold text-[#0A2E63]"><BadgeCheck size={16} className="text-[#1265D8]"/> Kontak Terverifikasi</span>
        </div>
        <div className="grid gap-7 p-5 sm:p-8 lg:grid-cols-[1fr_280px]">
          <div>
            <p className="flex items-center gap-1.5 text-xs text-slate-500"><MapPin size={14} className="text-[#1265D8]"/>{property.destination_name}{property.city ? ` · ${property.city}` : ""}{property.province ? `, ${property.province}` : ""}</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{property.name}</h1>
            <p className="mt-2 text-sm text-slate-600">{accommodationLabels[property.accommodation_type] ?? "Penginapan"}</p>
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-2 text-[11px] font-bold text-[#0A2E63]"><BadgeCheck size={15} className="text-[#1265D8]"/> Kontak terakhir diverifikasi {verifiedDate}</p>
            {property.description ? <section className="mt-6"><h2 className="text-base font-extrabold">Tentang properti</h2><p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-600">{property.description}</p></section> : null}
            {property.capacity ? <p className="mt-5 inline-flex items-center gap-2 text-sm text-slate-700"><UsersRound size={17} className="text-[#1265D8]"/> Kapasitas hingga {property.capacity} tamu</p> : null}
            {property.facilities?.length ? <section className="mt-6"><h2 className="text-base font-extrabold">Fasilitas</h2><ul className="mt-2 flex flex-wrap gap-2">{property.facilities.map((facility)=><li key={facility} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700">{facility}</li>)}</ul></section> : null}
            {property.room_summaries?.length ? <section className="mt-6"><h2 className="text-base font-extrabold">Tipe kamar</h2><div className="mt-2 grid gap-2 sm:grid-cols-2">{property.room_summaries.map((room,index)=><article key={`${room.name ?? "room"}-${index}`} className="rounded-xl border border-slate-200 p-3"><h3 className="text-sm font-bold">{room.name || "Tipe kamar"}</h3>{room.capacity ? <p className="mt-1 text-xs text-slate-500">Kapasitas {room.capacity} tamu</p> : null}{room.description ? <p className="mt-1 text-xs leading-5 text-slate-600">{room.description}</p> : null}</article>)}</div></section> : null}
            {property.policies ? <section className="mt-6"><h2 className="text-base font-extrabold">Kebijakan</h2><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{property.policies}</p></section> : null}
            {property.gallery_urls?.length ? <section className="mt-6"><h2 className="text-base font-extrabold">Galeri</h2><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{property.gallery_urls.map((url,index)=><div key={`${url}-${index}`} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100"><Image src={url} alt={`${property.name} · foto ${index+1}`} fill unoptimized sizes="(max-width:640px) 45vw, 220px" className="object-cover"/></div>)}</div></section> : null}
            {mapUrl ? <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex min-h-10 items-center text-xs font-bold text-[#1265D8]">Lihat lokasi di peta <MapPin size={14} className="ml-1"/></a> : null}
            <p className="mt-7 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Verifikasi kontak membantu memastikan kanal yang ditampilkan sesuai data yang ditinjau SHIAP. Verifikasi bukan jaminan kualitas properti, ketersediaan, harga, ataupun keamanan transaksi. Konfirmasikan detail langsung dengan pengelola.</p>
          </div>
          <aside className="h-fit rounded-2xl border border-slate-200 bg-[#F9FBFE] p-4">
            <p className="text-xs font-bold text-slate-500">Informasi properti</p><p className="mt-1 font-extrabold">{property.name}</p>
            {price ? <p className="mt-3 text-sm font-extrabold text-[#1265D8]">Mulai {price}</p> : <p className="mt-3 text-xs text-slate-500">Harga dikonfirmasi langsung dengan pengelola.</p>}
            {property.capacity ? <p className="mt-2 text-xs text-slate-600">Hingga {property.capacity} tamu</p> : null}
            {whatsAppUrl ? <PlacesWhatsAppLink href={whatsAppUrl} propertyId={property.id} refCode={refCode} className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#1265D8] px-3 text-sm font-bold text-white hover:bg-[#0A2E63]"/> : null}
            {property.stay_slug ? <Link href={`/stay/${encodeURIComponent(property.stay_slug)}`} className="mt-2 flex min-h-11 items-center justify-center rounded-xl border border-blue-200 bg-white px-3 text-xs font-bold text-[#1265D8]">Lihat opsi reservasi Stay SHIAP</Link> : null}
            <p className="mt-3 text-[10px] leading-4 text-slate-500">SHIAP tidak memproses pembayaran untuk listing Places. Hubungi properti untuk memastikan detail dan ketentuan.</p>
          </aside>
        </div>
      </article>
    </div>
  </main>;
}
