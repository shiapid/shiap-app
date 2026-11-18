import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mapTripPackage, type TripPackageRow } from "@/lib/catalog-mappers";
import TripDetailClient from "@/components/trips/trip-detail-client";

type Props = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";

export default async function TripDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trip_packages")
    .select("*,trip_departures(*)")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    console.error("[SHIAP] Gagal memuat detail Trip:", error.message);
    throw new Error("Detail Trip tidak dapat dimuat. Silakan coba kembali.");
  }
  if (!data) notFound();

  return <TripDetailClient trip={mapTripPackage(data as TripPackageRow)} />;
}
