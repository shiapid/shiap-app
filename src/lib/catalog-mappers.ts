import type { Trip } from "@/lib/trips";

export type TripPackageRow = {
  id: string; slug: string; title: string; location: string; categories?: string[] | null; trip_modes?: string[] | null;
  duration?: string | null; short_description?: string | null; description?: string | null; cover_image_url?: string | null;
  gallery_urls?: string[] | null; highlights?: string[] | null; itinerary?: unknown; included?: string[] | null; excluded?: string[] | null;
  meeting_point?: string | null; preparation?: string[] | null; notes?: string[] | null; featured?: boolean | null;
  youtube_tour_url?: string | null; pricing_model?: string | null; minimum_package_price?: number | null; price_tiers?: unknown;
  min_pax?: number | null; max_pax?: number | null; base_price?: number | null; trip_departures?: unknown[] | null;
};

type JsonRecord = Record<string, unknown>;
function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : null;
}

const arr = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
const itinerary = (value: unknown): Trip["itinerary"] => Array.isArray(value) ? value.flatMap((item, i) => {
  const row = record(item);
  if (!row) return [];

  // Admin stores itinerary as day groups; older catalog rows use flat activity rows.
  const day = String(row.day ?? `Hari ${i + 1}`);
  const dayTitle = String(row.title ?? "");
  const nested = Array.isArray(row.activities) ? row.activities : Array.isArray(row.items) ? row.items : null;
  if (nested) return nested.flatMap((activityValue) => {
    const activity = record(activityValue);
    return activity ? [{
      day,
      dayTitle,
      time: String(activity.time ?? ""),
      title: String(activity.title ?? "Aktivitas"),
      description: String(activity.description ?? ""),
    }] : [];
  });

  return [{
    day: String(row.day ?? ""),
    dayTitle: "",
    time: String(row.time ?? ""),
    title: String(row.title ?? "Aktivitas"),
    description: String(row.description ?? ""),
  }];
}) : [];
const priceTiers = (value: unknown): NonNullable<Trip["priceTiers"]> => Array.isArray(value) ? value.flatMap((item) => {
  const row = record(item);
  if (!row) return [];
  const tier = { min_pax: Number(row.min_pax ?? row.minPax ?? 1), max_pax: Number(row.max_pax ?? row.maxPax ?? 999), price_per_person: Number(row.price_per_person ?? row.price_per_pax ?? row.price ?? 0) };
  return tier.price_per_person > 0 && tier.min_pax > 0 && tier.max_pax >= tier.min_pax ? [tier] : [];
}) : [];

export function mapTripPackage(row: TripPackageRow): Trip {
  const categories = arr(row.categories).filter((v): v is Exclude<Trip["category"][number], "Semua"> => ["Open Trip", "Private Trip", "Snorkeling", "Island Hopping"].includes(v)) as Trip["category"];
  const modes = arr(row.trip_modes).filter((v): v is "open" | "private" => v === "open" || v === "private");
  const gallery = arr(row.gallery_urls);
  const cover = row.cover_image_url || gallery[0] || "/file.svg";
  const parsedTiers = priceTiers(row.price_tiers);
  const departures = (row.trip_departures ?? []).flatMap((value) => {
    const departure = record(value);
    if (!departure) return [];
    return [{ id: String(departure.id), departureDate: String(departure.departure_date), endDate: typeof departure.end_date === "string" ? departure.end_date : null, departureTime: typeof departure.departure_time === "string" ? departure.departure_time : null, meetingPoint: typeof departure.meeting_point === "string" ? departure.meeting_point : null, pricePerPerson: departure.price_per_person == null ? null : Number(departure.price_per_person), minParticipants: Number(departure.min_participants ?? 1), maxParticipants: Number(departure.max_participants ?? 0), bookedSeats: Number(departure.booked_seats ?? 0), status: String(departure.status ?? "draft") }];
  });
  return { slug: row.slug, title: row.title, location: row.location, category: categories.length ? categories : ["Island Hopping"], duration: row.duration || "Durasi menyesuaikan paket", description: row.short_description || row.description || "Jelajahi pengalaman bersama SHIAP.", image: cover, gallery: [cover, ...gallery.filter((url) => url !== cover)], highlights: arr(row.highlights), featured: Boolean(row.featured), modes: modes.length ? modes : ["private"], openTripInfo: "Pilih jadwal keberangkatan yang tersedia. Harga mengikuti jadwal aktif.", privateTripInfo: "Ajukan tanggal perjalanan dan jumlah peserta. Harga dihitung berdasarkan tier dan minimum paket.", itinerary: itinerary(row.itinerary), included: arr(row.included), excluded: arr(row.excluded), meetingPoint: row.meeting_point || "Dikonfirmasi oleh tim SHIAP.", preparation: arr(row.preparation), notes: arr(row.notes), youtubeTourUrl: row.youtube_tour_url, pricingModel: row.pricing_model, minimumPackagePrice: Number(row.minimum_package_price ?? 0), priceTiers: parsedTiers, minPax: Number(row.min_pax ?? 2), maxPax: Number(row.max_pax ?? 20), departures };
}
