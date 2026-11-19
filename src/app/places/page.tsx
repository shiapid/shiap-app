import { loadPlacesWhatsAppTemplate } from "@/lib/places/whatsapp-settings";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createPlacesReferralCode } from "@/lib/places/referral";
import { normalizePlacesSearch } from "@/lib/places/utils";
import type { PlacesDestination, PlacesListing } from "@/lib/places/types";
import { PlacesDirectory, type DirectoryListing } from "@/components/places/directory-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Places — Penginapan Terverifikasi",
  description: "Temukan villa, homestay, dan penginapan berdasarkan destinasi wisata. Hubungi kontak resmi yang telah diverifikasi SHIAP.",
};

type SearchParams = Promise<{ q?: string | string[]; destination?: string | string[]; page?: string | string[] }>;
function one(value: string | string[] | undefined) { return typeof value === "string" ? value : ""; }

export default async function PlacesPage({ searchParams }: { searchParams: SearchParams }) {
  const template = await loadPlacesWhatsAppTemplate();
  const params = await searchParams;
  const page = Math.max(1, Math.min(100000, Number.parseInt(one(params.page),10)||1));
  let total = 0;
  const query = normalizePlacesSearch(one(params.q));
  const destinationSlug = one(params.destination).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 100);
  let destinations: PlacesDestination[] = [];
  let listings: DirectoryListing[] = [];
  let loadError = false;
  try {
    const supabase = await createClient();
    let listingQuery = supabase.from("places_public_directory_v").select("id,slug,name,accommodation_type,whatsapp_phone,contact_verified_at,destination_id,destination_slug,destination_name,city,province,destination_aliases,description,cover_image_url,gallery_urls,capacity,facilities,room_summaries,starting_price_idr,policies,map_url,stay_slug,search_document",{count:"exact"}).order("name").order("id").range((page-1)*25,page*25-1);
    if (query) listingQuery = listingQuery.ilike("search_document", `%${query}%`);
    if (destinationSlug) listingQuery = listingQuery.eq("destination_slug", destinationSlug);
    const [destinationsResult, listingsResult] = await Promise.all([
      supabase.from("places_public_destinations_v").select("id,slug,name,canonical_name,city,province,aliases,listing_count").order("sort_order"),
      listingQuery,
    ]);
    if (destinationsResult.error || listingsResult.error) loadError = true;
    total = listingsResult.count ?? 0;
    destinations = (destinationsResult.data ?? []) as PlacesDestination[];
    listings = ((listingsResult.data ?? []) as PlacesListing[]).map((item) => ({ ...item, ref_code: createPlacesReferralCode() }));
  } catch {
    loadError = true;
  }
  return <PlacesDirectory page={page} total={total} template={template} destinations={destinations} listings={listings} query={query} destinationSlug={destinationSlug} loadError={loadError}/>;
}
