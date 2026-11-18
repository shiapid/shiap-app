import { resolveAvatar } from "@/lib/profile-avatar";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { mapTripPackage, type TripPackageRow } from "@/lib/catalog-mappers";
import type { Trip } from "@/lib/trips";
import HomePageSections, { type HomeDestination, type HomeHero } from "@/components/home/homepage-sections";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Jelajahi Indonesia bersama SHIAP",
  description: "Temukan trip, stay, aktivitas, dokumentasi, dan pengalaman wisata pilihan di Indonesia bersama SHIAP.",
};

const defaultHero: HomeHero = {
  eyebrow: "JELAJAH INDONESIA",
  title_line_one: "Lebih dari Sekadar",
  title_line_two: "Liburan",
  description: "Temukan pengalaman wisata pilihan di berbagai penjuru Indonesia.",
  button_label: "Mulai Jelajah",
  button_href: "/explore",
  search_placeholder: "Cari destinasi, trip, villa, aktivitas, atau layanan...",
  image_url: null,
};

type PublicStayLocation = { name: string; location: string | null; slug: string; cover_image_url: string | null };

function mapHomeHero(row: Record<string, unknown> | null, imageUrl: string | null): HomeHero {
  if (!row) return { ...defaultHero, image_url: imageUrl };
  const usesLegacyDefaults = row.title_line_one === "Explore More." && row.title_line_two === "With SHIAP.";
  return {
    eyebrow: row.eyebrow === "TRAVEL · EXPLORE · DISCOVER" ? defaultHero.eyebrow : String(row.eyebrow ?? defaultHero.eyebrow),
    title_line_one: usesLegacyDefaults ? defaultHero.title_line_one : String(row.title_line_one ?? defaultHero.title_line_one),
    title_line_two: usesLegacyDefaults ? defaultHero.title_line_two : String(row.title_line_two ?? defaultHero.title_line_two),
    description: row.description === "Satu pintu untuk trip, stay, aktivitas laut, dokumentasi dan pengalaman wisata di Kotabaru."
      ? defaultHero.description
      : String(row.description ?? defaultHero.description),
    button_label: String(row.button_label ?? defaultHero.button_label),
    button_href: String(row.button_href ?? defaultHero.button_href),
    search_placeholder: row.search_placeholder === "Cari trip, stay, snorkeling..."
      ? defaultHero.search_placeholder
      : String(row.search_placeholder ?? defaultHero.search_placeholder),
    image_url: imageUrl,
  };
}

export default async function HomePage() {
  let hero = defaultHero;
  let trips: Trip[] = [];
  let stayLocations: PublicStayLocation[] = [];
  let profile: { name: string; avatarUrl: string | null; isLoggedIn: boolean } | null = null;

  try {
    const supabase = await createClient();
    const [heroResult, tripResult, stayResult, authResult] = await Promise.all([
      supabase.from("home_hero_settings")
        .select("eyebrow,title_line_one,title_line_two,description,button_label,button_href,search_placeholder,image_path")
        .eq("id", true).maybeSingle(),
      supabase.from("trip_packages").select("*").eq("status", "published")
        .order("featured", { ascending: false }).order("updated_at", { ascending: false }),
      // Homepage destination cards only need these stable public fields. Avoid
      // ordering by the optional catalog merchandising flag so older schema
      // caches do not break the whole Stay location query.
      supabase.from("stay_properties").select("name,location,slug,cover_image_url")
        .eq("status", "published").order("name"),
      supabase.auth.getUser(),
    ]);

    if (tripResult.error) console.warn("[SHIAP] Katalog trip homepage tidak dapat dimuat.", { code: tripResult.error.code });
    else trips = (tripResult.data ?? []).map((row) => mapTripPackage(row as TripPackageRow));
    if (stayResult.error) console.warn("[SHIAP] Lokasi stay homepage tidak dapat dimuat.", { code: stayResult.error.code });
    else stayLocations = (stayResult.data ?? []) as PublicStayLocation[];

    if (authResult.data.user) {
      const { data: accountProfile } = await supabase.from("profiles")
        .select("full_name,avatar_url,avatar_path").eq("id", authResult.data.user.id).maybeSingle();
      profile = {
        name: accountProfile?.full_name?.trim() || authResult.data.user.user_metadata?.full_name || "",
        avatarUrl: await resolveAvatar(supabase, accountProfile ?? { avatar_url: authResult.data.user.user_metadata?.avatar_url }),
        isLoggedIn: true,
      };
    }

    const imagePath = typeof heroResult.data?.image_path === "string" ? heroResult.data.image_path : null;
    const fallbackImage = trips.find((trip) => trip.featured && trip.image !== "/file.svg")?.image
      || trips.find((trip) => trip.image !== "/file.svg")?.image
      || null;
    const heroImage = imagePath
      ? supabase.storage.from("shiap-catalog-images").getPublicUrl(imagePath).data.publicUrl
      : fallbackImage;
    hero = mapHomeHero(heroResult.data as Record<string, unknown> | null, heroImage);
  } catch {
    // Keep the homepage usable with its branded fallback if local Supabase is unavailable.
  }

  const destinationMap = new Map<string, HomeDestination>();
  for (const trip of trips) {
    const name = trip.location.trim();
    if (name && !destinationMap.has(name.toLocaleLowerCase("id"))) {
      destinationMap.set(name.toLocaleLowerCase("id"), {
        name,
        image: trip.image === "/file.svg" ? null : trip.image,
        href: `/explore?q=${encodeURIComponent(name)}`,
        source: "Trip",
      });
    }
  }
  for (const stay of stayLocations) {
    const name = stay.location?.trim();
    if (name && !destinationMap.has(name.toLocaleLowerCase("id"))) {
      destinationMap.set(name.toLocaleLowerCase("id"), {
        name,
        image: stay.cover_image_url,
        href: `/explore?q=${encodeURIComponent(name)}`,
        source: "Stay",
      });
    }
  }

  return (
    <main className="min-h-screen overflow-x-clip bg-[#F7FAFC] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#0A2E63] md:pb-12">
      <HomePageSections hero={hero} trips={trips.filter((trip) => trip.featured).slice(0, 8).map((trip) => ({ ...trip, image: trip.image === "/file.svg" ? null : trip.image }))} destinations={[...destinationMap.values()].slice(0, 10)} profile={profile} />
    </main>
  );
}
