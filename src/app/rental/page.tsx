import ExperienceCatalog, { type PublicExperience } from "@/components/experiences/experience-catalog";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Rental Perlengkapan Wisata | SHIAP",
  description: "Temukan rental perlengkapan wisata SHIAP dan tambahkan ke satu keranjang booking.",
};

export default async function RentalPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shiap_experiences")
    .select("id,experience_type,catalog_category,rental_category,title,slug,short_description,description,duration,location,base_price,price_basis,price_unit_label,highlights,inclusions,cover_image_url,featured,addons,bundle_requires")
    .eq("experience_type", "activity")
    .eq("catalog_category", "rental")
    .eq("status", "published")
    .order("featured", { ascending: false })
    .order("title");

  return <ExperienceCatalog type="activity" viewMode="rental" items={(data ?? []) as PublicExperience[]} error={Boolean(error)} />;
}
