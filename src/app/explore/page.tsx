import ExploreCatalogClient, { type ExploreItem } from "@/components/explore/explore-catalog-client";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jelajah" };

function lowestPrice(values: (number | null)[]) {
  const prices = values.map(Number).filter((price) => Number.isFinite(price) && price > 0);
  return prices.length ? Math.min(...prices) : null;
}

function categoryName(value: { name: string } | { name: string }[]) {
  return Array.isArray(value) ? value[0]?.name : value.name;
}

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const [{ q }, supabase] = await Promise.all([searchParams, createClient()]);
  const [trips, stays, services, products] = await Promise.all([
    supabase.from("trip_packages").select("id,slug,title,location,short_description,cover_image_url,trip_departures(departure_date,status,price_per_person)").eq("status", "published").order("featured", { ascending: false }).order("title"),
    supabase.from("stay_properties").select("id,slug,name,location,short_description,cover_image_url,stay_room_types(weekday_price,weekend_price,status)").eq("status", "published").order("featured", { ascending: false }).order("name"),
    supabase.from("shiap_experiences").select("id,experience_type,catalog_category,title,location,short_description,cover_image_url,base_price,price_unit_label").eq("status", "published").is("experience_package_id", null).order("title"),
    supabase.from("shiap_experience_products").select("id,slug,title,location_label,description,cover_image_url,is_demo,shiap_experience_categories!inner(name,is_active),shiap_experience_packages(price,price_label,is_demo,status)").eq("status", "published").eq("shiap_experience_categories.is_active", true).order("sort_order").order("title"),
  ]);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Makassar" }).format(new Date());
  const items: ExploreItem[] = [
    ...(products.data ?? []).flatMap((row): ExploreItem[] => {
      const packages = row.shiap_experience_packages.filter((item) => item.status === "published" && !item.is_demo);
      if (!row.is_demo && !packages.length) return [];
      const price = row.is_demo ? null : lowestPrice(packages.map((item) => item.price));
      return [{ id: row.id, category: "experience", title: row.title, location: row.is_demo ? "" : row.location_label,
        description: row.description, image: row.cover_image_url, href: "/experiences/" + row.slug,
        price, priceUnit: packages.find((item) => Number(item.price) === price)?.price_label,
        isPreview: row.is_demo, keywords: categoryName(row.shiap_experience_categories) }];
    }),
    ...(trips.data ?? []).map((row): ExploreItem => ({
      id: row.id, category: "trip", title: row.title, location: row.location, description: row.short_description,
      image: row.cover_image_url, href: "/trip/" + row.slug,
      price: lowestPrice(row.trip_departures.filter((item) => item.status === "open" && item.departure_date >= today).map((item) => item.price_per_person)),
      priceUnit: "orang",
    })),
    ...(stays.data ?? []).map((row): ExploreItem => ({
      id: row.id, category: "stay", title: row.name, location: row.location, description: row.short_description,
      image: row.cover_image_url, href: "/stay/" + row.slug,
      price: lowestPrice(row.stay_room_types.filter((room) => room.status === "active").flatMap((room) => [room.weekday_price, room.weekend_price])),
      priceUnit: "malam",
    })),
    ...(services.data ?? []).map((row): ExploreItem => ({
      id: row.id, category: row.catalog_category === "rental" ? "rental" : row.experience_type === "documentation" ? "shinema" : "experience",
      title: row.title, location: row.location, description: row.short_description, image: row.cover_image_url,
      href: "/booking?service=" + encodeURIComponent(row.id), price: /^DEMO\s*[—–-]/i.test(row.title) ? null : lowestPrice([row.base_price]), priceUnit: row.price_unit_label,
      keywords: row.experience_type === "activity" ? "Wahana Aktivitas" : "Dokumentasi",
    })),
  ];

  return <ExploreCatalogClient initialQuery={typeof q === "string" ? q : ""} items={items} loadError={[trips, stays, services, products].some((result) => Boolean(result.error))} />;
}
