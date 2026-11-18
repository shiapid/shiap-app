import { createClient } from "@/lib/supabase/server";
import CustomTripPlanner, { type CustomTripSettings } from "@/components/booking/custom-trip-planner";

export const dynamic = "force-dynamic";

export default async function CustomTripPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("custom_trip_settings")
    .select("is_active,whatsapp_number,destinations,durations_days,activities,stays,min_participants,max_participants,documentation_services,documentation_deliverables")
    .eq("id", true).maybeSingle();
  return <CustomTripPlanner settings={(data ?? null) as CustomTripSettings | null} loadError={error?.message ?? null}/>;
}
