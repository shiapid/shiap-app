import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import { StayV2MutationForm } from "@/components/stay-v2/mutation-form";
import type { StayV2Access } from "@/lib/stay-v2/plans";
import { verifyStayV2 } from "./actions";

const field = "mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm";
const card = "min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-white p-4";

function VerificationFields({ confirmation }: { confirmation: string }) {
  return <>
    <label className="block text-xs font-semibold">Catatan pemeriksaan
      <textarea name="note" required minLength={10} maxLength={500} className={field + " py-2"} />
    </label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="verified" required className="mt-1" />{confirmation}</label>
  </>;
}

export default async function StayV2Reconciliation() {
  await requireAdmin();
  const client = await createClient();
  const [places, stay, agreements] = await Promise.all([
    client.from("places_properties").select("id,name,stay_property_id").eq("is_demo", false).neq("status", "archived").order("name"),
    client.from("stay_properties").select("id,name,location").neq("status", "archived").order("name"),
    client.from("stay_service_agreements").select("id,places_property_id,contract_reference,status").eq("model", "BOOKING_PARTNER").not("places_property_id", "is", null).order("created_at", { ascending: false }),
  ]);
  if (places.error || stay.error || agreements.error) return <p role="alert">Data pemetaan belum dapat dimuat.</p>;
  const mapped = new Set(places.data.map(property => property.stay_property_id));
  const linked = places.data.filter(property => property.stay_property_id);
  const { data: access, error: accessError } = linked.length
    ? await client.rpc("stay_v2_property_access", { p_property_ids: linked.map(property => property.id) })
    : { data: [], error: null };

  return (
    <section className="space-y-4 text-[#0A2E63]">
      <header><h1 className="text-2xl font-extrabold">Pemetaan Properti Stay</h1>
        <p className="mt-1 text-sm text-slate-600">Cocokkan listing Places dengan properti yang mengelola kamar dan reservasi.</p></header>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-bold">Verifikasi pemetaan</h2>
          <StayV2MutationForm action={verifyStayV2} label="Verifikasi & tautkan">
            <label className="block text-xs font-semibold">Listing Places
              <select name="placesId" required defaultValue="" className={field}>
                <option value="">Pilih listing Places</option>
                {places.data.filter(p => !p.stay_property_id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold">Properti Stay
              <select name="stayId" required defaultValue="" className={field}>
                <option value="">Pilih properti Stay</option>
                {stay.data.filter(p => !mapped.has(p.id)).map(p => <option key={p.id} value={p.id}>{p.name} · {p.location}</option>)}
              </select>
            </label>
            <VerificationFields confirmation="Saya sudah memeriksa bahwa kedua listing adalah properti yang sama." />
          </StayV2MutationForm>
        </section>
        <section className={card}>
          <h2 className="font-bold">Akses pemasaran Partner</h2>
          <p className="text-xs text-slate-600">Aktivasi booking dan pencairan mengikuti fase selanjutnya.</p>
          <StayV2MutationForm action={verifyStayV2} label="Simpan keputusan">
            <label className="block text-xs font-semibold">Perjanjian yang terhubung
              <select name="agreementId" required defaultValue="" className={field}>
                <option value="">Pilih perjanjian</option>
                {agreements.data.map(a => <option key={a.id} value={a.id}>{places.data.find(p => p.id === a.places_property_id)?.name} · {a.contract_reference} · {a.status}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold">Keputusan
              <select name="decision" required className={field}><option value="approve">Setujui akses pemasaran</option><option value="revoke">Cabut akses pemasaran</option></select>
            </label>
            <VerificationFields confirmation="Saya sudah memeriksa keputusan dan bukti penerimaan perjanjian." />
          </StayV2MutationForm>
        </section>
      </div>
      <section className={card}>
        <h2 className="font-bold">Properti terhubung</h2>
        {!linked.length && <p className="text-sm text-slate-600">Belum ada properti terhubung.</p>}
        {accessError && <p role="alert" className="text-sm text-red-700">Status paket belum dapat dimuat.</p>}
        <ul className="divide-y divide-slate-100">{linked.map(p => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <span className="min-w-0 break-words"><strong>{p.name}</strong> · {stay.data.find(item => item.id === p.stay_property_id)?.name ?? "Properti Stay"}</span>
            <span className="text-xs font-bold text-[#1265D8]">{(access as StayV2Access[] | null)?.find(row => row.property_id === p.id)?.commercial_plan}</span>
          </li>
        ))}</ul>
      </section>
    </section>
  );
}
