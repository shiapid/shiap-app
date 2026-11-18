export type PlacesDestination = {
  id: string;
  slug: string;
  name: string;
  canonical_name: string;
  city: string | null;
  province: string | null;
  aliases: string[];
  listing_count: number;
};

export type PlacesListing = {
  id: string;
  slug: string;
  name: string;
  accommodation_type: string;
  whatsapp_phone: string;
  contact_verified_at: string;
  destination_id: string;
  destination_slug: string;
  destination_name: string;
  city: string | null;
  province: string | null;
  destination_aliases: string[];
  description: string | null;
  cover_image_url: string | null;
  gallery_urls: string[];
  capacity: number | null;
  facilities: string[];
  room_summaries: { name?: string; capacity?: number; description?: string }[];
  starting_price_idr: number | null;
  policies: string | null;
  map_url: string | null;
  stay_slug: string | null;
  search_document: string;
};

export type PlacesPublicPlan = {
  premium_monthly_price_idr: number;
  price_status: "proposed" | "actual";
  max_units: number;
  premium_enabled: boolean;
};

export const accommodationLabels: Record<string, string> = {
  villa: "Villa",
  hotel: "Hotel",
  homestay: "Homestay",
  guesthouse: "Guest house",
  resort: "Resort",
  other: "Penginapan",
};

export function formatIdr(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) < 0) return null;
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value));
}
