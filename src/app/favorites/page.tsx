import { createClient } from "@/lib/supabase/server";
import { mapTripPackage, type TripPackageRow } from "@/lib/catalog-mappers";
import FavoritesPageClient from "@/components/home/favorites-page-client";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  let trips: { slug: string; title: string; location: string; duration: string; image: string }[] = [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("trip_packages").select("*").eq("status", "published").order("featured", { ascending: false }).order("title");
    if (!error) trips = (data ?? []).map((row) => {
      const trip = mapTripPackage(row as TripPackageRow);
      return { slug: trip.slug, title: trip.title, location: trip.location, duration: trip.duration, image: trip.image === "/file.svg" ? "" : trip.image };
    });
  } catch {
    // Keep the saved-list page usable if the local catalog is temporarily unavailable.
  }
  return <FavoritesPageClient trips={trips} />;
}
