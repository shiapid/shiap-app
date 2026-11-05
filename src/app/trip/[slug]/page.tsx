import { notFound } from "next/navigation";
import { trips } from "@/lib/trips";
import TripDetailClient from "@/components/trips/trip-detail-client";

type TripDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function TripDetailPage({ params }: TripDetailPageProps) {
  const { slug } = await params;
  const trip = trips.find((item) => item.slug === slug);

  if (!trip) notFound();

  return <TripDetailClient trip={trip} />;
}
