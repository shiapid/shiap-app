import { redirect } from "next/navigation";
import { partnerIdentity } from "@/lib/places/partner";
import { loadStayPartnerOperations } from "@/lib/stay-v2/operations-server";
import { StayPartnerOperationsPanel } from "@/components/stay-v2/partner-operations";

export default async function PartnerStayOperations({ searchParams }: {searchParams: Promise<{ room?: string; from?: string }>}) {
  const identity = await partnerIdentity().catch(() => null);
  if (!identity) redirect("/login?next=/partner/stay/operations");
  const result = await loadStayPartnerOperations(identity.client, await searchParams);
  if (!result) return <p role="alert">Operasional Stay belum dapat dimuat.</p>;
  return <section className="space-y-4">
    <h2 className="text-xl font-extrabold">Operasional Stay Partner</h2>
    {result.calendarError && <p role="alert">Kalender belum dapat dimuat.</p>}
    <StayPartnerOperationsPanel {...result} admin={false} />
  </section>;
}
