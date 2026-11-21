"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guard";
import { uuidPattern } from "@/lib/customer-bookings";
import { createClient } from "@/lib/supabase/server";
import type { StayV2FormState } from "@/components/stay-v2/mutation-form";

export async function verifyStayV2(_state: StayV2FormState, data: FormData): Promise<StayV2FormState> {
  await requireAdmin();
  const placesId = String(data.get("placesId") ?? "");
  const stayId = String(data.get("stayId") ?? "");
  const agreementId = String(data.get("agreementId") ?? "");
  const decision = data.get("decision");
  const note = String(data.get("note") ?? "").trim();
  const mapping = decision === null;
  if (note.length < 10 || note.length > 500 || data.get("verified") !== "on" ||
      (mapping ? !uuidPattern.test(placesId) || !uuidPattern.test(stayId) :
        !uuidPattern.test(agreementId) || (decision !== "approve" && decision !== "revoke"))) {
    return { ok: false, message: "Periksa pilihan, konfirmasi pemeriksaan, dan isi catatan." };
  }
  const client = await createClient();
  const { error } = mapping
    ? await client.rpc("admin_reconcile_stay_v2_property", { p_places_id: placesId, p_stay_id: stayId, p_note: note })
    : await client.rpc("admin_approve_stay_v2_marketing", { p_agreement_id: agreementId, p_approve: decision === "approve", p_note: note });
  if (error) return { ok: false, message: ["PT409", "22023"].includes(error.code) ? error.message : "Keputusan belum dapat disimpan." };
  revalidatePath("/admin/stay/reconciliation");
  return { ok: true, message: mapping ? "Pemetaan Places dan Stay terverifikasi." : "Keputusan akses pemasaran tersimpan." };
}
