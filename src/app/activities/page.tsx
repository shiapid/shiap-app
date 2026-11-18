import ExperienceCatalog, { type PublicExperience } from "@/components/experiences/experience-catalog";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const [{ category }, supabase] = await Promise.all([searchParams, createClient()]);
  const rentalMode = category === "rental";
  const { data, error } = await supabase.from("shiap_experiences").select("id,experience_type,catalog_category,rental_category,title,slug,short_description,description,duration,location,base_price,price_basis,price_unit_label,highlights,inclusions,cover_image_url,featured,addons,bundle_requires").eq("experience_type", "activity").eq("catalog_category", rentalMode ? "rental" : "activity").is("experience_package_id", null).eq("status", "published").order("featured", { ascending: false }).order("title");
  const items = (data ?? []) as PublicExperience[];
  return <ExperienceCatalog type="activity" viewMode={rentalMode ? "rental" : "catalog"} items={items} error={Boolean(error)}/>;
}
