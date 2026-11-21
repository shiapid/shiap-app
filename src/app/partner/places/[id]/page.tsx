import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DigitalPropertyKit } from "@/components/places/digital-kit";
import { PremiumEditor, type PremiumDraftRow } from "@/components/places/premium-editor";
import { StayV2MutationForm } from "@/components/stay-v2/mutation-form";
import { memberProperty, stayV2PropertyAccess } from "@/lib/places/partner";
import { BookingError } from "@/lib/customer-bookings";
import { saveStayV2Basics } from "./actions";

export const dynamic = "force-dynamic";

const field = "mt-1 block min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm";
const types = { villa: "Villa", hotel: "Hotel", homestay: "Homestay", guesthouse: "Guesthouse", resort: "Resort", other: "Lainnya" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let access;
  try { access = await memberProperty(id); }
  catch (error) {
    if (error instanceof BookingError && error.status === 401) redirect("/login?next=" + encodeURIComponent("/partner/places/" + id));
    notFound();
  }
  const { client, property, role } = access;
  const plan = await stayV2PropertyAccess(client, id);
  const canEdit = role === "OWNER" || role === "MANAGER";
  const [destinations, publication, draft] = await Promise.all([
    canEdit && !property.stay_property_id ? client.from("destinations_public_v").select("id,name,city").eq("is_active", true).is("archived_at", null).order("name") : { data: [] },
    plan?.premium_content ? client.from("places_public_premium_v").select("property_id").eq("property_id", id).maybeSingle() : { data: null },
    plan?.premium_content ? client.from("places_property_profiles").select("*").eq("property_id", id).maybeSingle() : { data: null, error: null },
  ]);

  return <div className="space-y-4">
    <header className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="break-words text-xl font-extrabold">{property.name}</h2>
      <p className="mt-2 text-sm text-slate-600">{plan?.commercial_plan ?? "Status paket belum tersedia"} · {role}</p>
      <p className="mt-2 text-xs text-slate-600">{plan?.contact_verified ? "Kontak terverifikasi" : "Kontak menunggu verifikasi"} · {plan?.owner_verified ? "Pemilik terverifikasi" : "Pemilik menunggu verifikasi"}</p>
      {plan?.partner_status === "IN_REVIEW" && <p className="mt-2 text-xs text-slate-600">Kemitraan sedang ditinjau.</p>}
      <p className="mt-2 text-xs text-slate-600">WhatsApp resmi {property.whatsapp_phone}. Perubahan nama atau kontak resmi perlu diperiksa Admin.</p>
      <Link href="/places/partners" className="mt-1 inline-flex min-h-11 items-center text-xs font-bold text-[#1265D8]">Dukungan kemitraan</Link>
    </header>
    {canEdit && <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-bold">Profil dasar</h2>
      <StayV2MutationForm action={saveStayV2Basics.bind(null, id)} label="Simpan profil dasar">
        <label className="block text-xs font-semibold">Jenis penginapan
          <select name="accommodationType" defaultValue={property.accommodation_type} className={field}>
            {Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {property.stay_property_id
          ? <><input type="hidden" name="destinationId" value={property.destination_id} /><p className="text-xs text-slate-600">Destinasi properti terhubung dikelola Admin.</p></>
          : <label className="block text-xs font-semibold">Destinasi
            <select name="destinationId" defaultValue={property.destination_id} required className={field}>
              {!destinations.data?.some(item => item.id === property.destination_id) &&
                <option value={property.destination_id}>Pertahankan destinasi saat ini</option>}
              {destinations.data?.map(item => <option key={item.id} value={item.id}>{item.name}{item.city ? " · " + item.city : ""}</option>)}
            </select>
          </label>}
      </StayV2MutationForm>
    </section>}
    {plan?.premium_content && <>
      {draft.error ? <p role="alert" className="text-sm">Draft belum dapat dimuat.</p> :
        canEdit ? <PremiumEditor key={id + ":" + (draft.data?.version || 0)} propertyId={id} initial={draft.data as PremiumDraftRow | null} admin={false} /> :
          <p className="rounded-xl bg-white p-4 text-sm">Hubungi pemilik untuk perubahan konten.</p>}
      {publication.data && <DigitalPropertyKit propertyId={id} name={property.name} slug={property.slug} />}
      {draft.data && <Link href={"/partner/places/" + id + "/preview"} className="inline-flex min-h-11 items-center text-xs font-bold text-[#1265D8]">Pratinjau draft tersimpan →</Link>}
    </>}
  </div>;
}
