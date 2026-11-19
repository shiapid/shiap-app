import { PremiumWebsite } from "@/components/places/premium-website";
import { validatePremiumProfile } from "@/lib/places/premium";
import { loadPlacesWhatsAppTemplate } from "@/lib/places/whatsapp-settings";
import Link from "next/link";
import type { Metadata } from "next";
import { BadgeCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createPlacesReferralCode } from "@/lib/places/referral";
import { buildWhatsAppUrl } from "@/lib/places/utils";
import { type PlacesListing } from "@/lib/places/types";
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
  const template = await loadPlacesWhatsAppTemplate();
  const whatsAppUrl = buildWhatsAppUrl({ template, phone: property.whatsapp_phone, propertyName: property.name, refCode });
  const premiumClient=await createClient();
  const {data:publication}=await premiumClient.from("places_public_premium_v").select("profile").eq("property_id",property.id).maybeSingle();
  const premium=publication?validatePremiumProfile(publication.profile):null;
  if(premium)return <PremiumWebsite property={property} profile={premium} template={template} refCode={refCode}/>;
  // Free remains a contact directory. Draft/expired Premium content is never rendered here.
  return <main className="min-h-dvh bg-[#F7F9FC] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 text-[#0A2E63]"><div className="mx-auto max-w-3xl"><Link href="/places" className="inline-flex min-h-11 items-center text-xs font-bold text-[#1265D8]">← Kembali ke Places</Link><article className="mt-3 rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs text-slate-500">{[property.destination_name,property.city,property.province].filter(Boolean).join(" · ")}</p><h1 className="mt-2 text-2xl font-extrabold">{property.name}</h1><p className="mt-3 flex items-center gap-1 text-xs font-bold text-[#1265D8]"><BadgeCheck size={16}/>Kontak resmi terverifikasi</p>{whatsAppUrl?<aside><PlacesWhatsAppLink href={whatsAppUrl} propertyId={property.id} refCode={refCode} className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#1265D8] px-4 text-sm font-bold text-white"/></aside>:null}<p className="mt-4 text-xs leading-6 text-slate-500">Verifikasi kontak bukan jaminan harga, ketersediaan atau keamanan pembayaran. Konfirmasikan informasi langsung dengan pengelola.</p></article></div></main>;
}
