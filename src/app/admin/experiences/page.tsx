import ExperiencePlatformManager from "@/components/admin/experience-platform-manager";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminExperiencesPage() {
  const supabase = await createClient();
  const [categories, products, packages, addons, sessions, resources, assignments] = await Promise.all([
    supabase.from("shiap_experience_categories").select("id,slug,name,description,sort_order,is_active").order("sort_order"),
    supabase.from("shiap_experience_products").select("id,category_id,slug,title,tagline,description,duration,location_label,cover_image_url,gallery_urls,highlights,inclusions,exclusions,prerequisites,safety_information,cancellation_policy,status,is_demo").order("created_at", { ascending: false }),
    supabase.from("shiap_experience_packages").select("id,product_id,catalog_service_id,slug,title,description,price,pricing_basis,price_label,booking_mode,min_guests,max_guests,status").order("created_at", { ascending: false }),
    supabase.from("shiap_experience_addons").select("id,package_id,slug,name,price,is_active").order("sort_order"),
    supabase.from("shiap_experience_sessions").select("id,package_id,starts_at,ends_at,capacity,status,weather_status,safety_plan_verified").order("starts_at", { ascending: false }),
    supabase.from("shiap_experience_resources").select("id,name,resource_type,verification_status,is_active").order("name"),
    supabase.from("shiap_experience_session_resources").select("session_id,resource_id"),
  ]);
  return <ExperiencePlatformManager categories={categories.data ?? []} products={products.data ?? []} packages={packages.data ?? []} addons={addons.data ?? []} sessions={sessions.data ?? []} resources={resources.data ?? []} assignments={assignments.data ?? []}/>;
}

