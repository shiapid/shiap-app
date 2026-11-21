import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import { loadStayPartnerOperations } from "@/lib/stay-v2/operations-server";
import { StayPartnerOperationsPanel, StayPartnerRegistration } from "@/components/stay-v2/partner-operations";

export default async function AdminStayOperations({ searchParams }: {searchParams: Promise<{ room?: string; from?: string }>}) {
  await requireAdmin();
  const client = await createClient();
  const [result, stays, agreements, applications, places] = await Promise.all([
    loadStayPartnerOperations(client, await searchParams),
    client.from("stay_properties").select("id,name").neq("status","archived").order("name"),
    client.from("stay_service_agreements").select("id,stay_property_id,contract_reference,status").eq("model","BOOKING_PARTNER"),
    client.from("stay_service_applications").select("id,property_id,status").eq("model","BOOKING_PARTNER").neq("status","WITHDRAWN"),
    client.from("places_properties").select("id,name"),
  ]);
  if (!result || stays.error || agreements.error || applications.error || places.error) return <p role="alert">Operasional Stay belum dapat dimuat.</p>;
  const byStay = new Map(stays.data.map(row => [row.id,row.name]));
  const byPlaces = new Map(places.data.map(row => [row.id,row.name]));
  return <section className="space-y-4">
    <header><h1 className="text-2xl font-extrabold text-[#0A2E63]">Operasional Stay Partner</h1>
      <Link href="/admin/stay/partners" className="inline-flex min-h-11 items-center text-sm font-bold text-[#1265D8]">Pengajuan & perjanjian Partner →</Link>
    </header>
    <StayPartnerRegistration stays={stays.data}
      agreements={agreements.data.map(row => ({ id: row.id, label: [byStay.get(row.stay_property_id),row.contract_reference,row.status].filter(Boolean).join(" · ") }))}
      applications={applications.data.map(row => ({ id: row.id, label: [byPlaces.get(row.property_id),row.status].filter(Boolean).join(" · ") }))} />
    {result.calendarError && <p role="alert">Kalender belum dapat dimuat.</p>}
    <StayPartnerOperationsPanel {...result} admin />
  </section>;
}
