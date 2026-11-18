import { createClient } from "@/lib/supabase/server";
import { mapTripPackage, type TripPackageRow } from "@/lib/catalog-mappers";
import TripCatalogClient from "@/components/trips/trip-catalog-client";

export const dynamic = "force-dynamic";

export default async function TripPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trip_packages")
    .select("*")
    .eq("status", "published")
    .order("featured", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[SHIAP] Gagal memuat katalog Trip:", error.message);
    return <TripCatalogClient trips={[]} loadError="Katalog Trip sedang tidak dapat dimuat. Silakan coba beberapa saat lagi." />;
  }

  const catalogTrips = (data ?? []).map((row) => mapTripPackage(row as TripPackageRow));
  return <TripCatalogClient trips={catalogTrips} />;
}
