import ExperienceCatalog, { type PublicExperience } from "@/components/experiences/experience-catalog";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ShinemaPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("shiap_experiences").select("id,experience_type,title,slug,short_description,description,duration,location,base_price,price_basis,price_unit_label,highlights,inclusions,cover_image_url,featured,addons,bundle_requires").eq("experience_type", "documentation").eq("status", "published").order("featured", { ascending: false }).order("title");
  return <ExperienceCatalog type="documentation" items={(data ?? []) as PublicExperience[]} error={Boolean(error)}/>;
}
