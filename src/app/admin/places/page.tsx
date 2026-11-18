import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import { PlacesAdminClient } from "@/components/admin/places-admin-client";

export const dynamic = "force-dynamic";

export default async function AdminPlacesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [destinationsResult, propertiesResult, profilesResult, planResult] = await Promise.all([
    supabase.from("places_destinations").select("id,slug,name,canonical_name,city,province,aliases,is_active").order("sort_order"),
    supabase.from("places_properties").select("id,slug,name,destination_id,accommodation_type,whatsapp_phone,status,is_demo,contact_verified_at,contact_verification_expires_at").order("created_at", { ascending: false }),
    supabase.from("places_property_profiles").select("property_id,description,cover_image_url,gallery_urls,capacity,facilities,room_summaries,starting_price_idr,policies,map_url"),
    supabase.from("places_plan_settings").select("premium_monthly_price_idr,price_status,max_units,premium_enabled").eq("id", true).maybeSingle(),
  ]);
  const loadError = Boolean(destinationsResult.error || propertiesResult.error || profilesResult.error || planResult.error);
  return <PlacesAdminClient destinations={destinationsResult.data ?? []} properties={propertiesResult.data ?? []} profiles={profilesResult.data ?? []} plan={planResult.data ?? null} loadError={loadError}/>;
}
