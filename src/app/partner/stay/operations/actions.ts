"use server";

import { revalidatePath } from "next/cache";
import { uuidPattern } from "@/lib/customer-bookings";
import { createClient } from "@/lib/supabase/server";
import type { StayV2FormState } from "@/components/stay-v2/mutation-form";

const configActions = ["SUBMIT","VERIFY_BANK","REVOKE_BANK","APPROVE","ACTIVATE","APPROVE_INSTANT","DISABLE_INSTANT","SUSPEND","TERMINATE"];
const itemActions = ["APPROVE","REJECT","CONFIRM","CHECK_IN","CHECK_OUT","COMPLETE","HOLD","RELEASE_HOLD"];

export async function saveStayPartnerOperation(_state: StayV2FormState, data: FormData): Promise<StayV2FormState> {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { ok: false, message: "Masuk untuk mengelola Stay Partner." };
  const kind = String(data.get("kind") ?? "");
  const action = String(data.get("action") ?? "");
  const property = String(data.get("property") ?? "");
  const room = String(data.get("room") ?? "");
  const note = String(data.get("note") ?? "").trim();
  const item = String(data.get("item") ?? "");
  const bank = String(data.get("bank") ?? "").trim();
  const last4 = String(data.get("last4") ?? "").trim();
  let response;
  if (kind === "register") {
    const application = String(data.get("application") ?? "");
    const agreement = String(data.get("agreement") ?? "");
    if (!uuidPattern.test(property) || !uuidPattern.test(application) || !uuidPattern.test(agreement)) {
      return { ok: false, message: "Periksa properti, pengajuan dan perjanjian." };
    }
    response = await client.rpc("admin_register_stay_partner_booking", {
      p_property: property, p_application: application, p_agreement: agreement, p_note: note,
    });
  } else if (kind === "config" && uuidPattern.test(property) && configActions.includes(action)) {
    response = await client.rpc("manage_stay_partner_booking_config", {
      p_property: property, p_action: action, p_note: note,
      p_bank_name: action === "VERIFY_BANK" ? bank : null, p_last4: action === "VERIFY_BANK" ? last4 : null,
    });
  } else if (kind === "item" && uuidPattern.test(item) && itemActions.includes(action)) {
    const units = action === "CHECK_IN" ? data.getAll("unit").map(String) : [];
    if (units.length > 200 || units.some(id => !uuidPattern.test(id))) return { ok: false, message: "Pilihan unit tidak valid." };
    response = await client.rpc("manage_stay_partner_item", { p_item: item, p_action: action, p_note: note, p_units: units });
  } else if (kind === "inventory" && uuidPattern.test(property) && (room === "" || uuidPattern.test(room))) {
    const payload: Record<string,string | boolean> = {};
    for (const field of ["name","capacity","units","included","weekday","weekend","extraGuest","label","start","end","reason","blockId","rateId","price"]) {
      const value = data.get(field);
      if (typeof value === "string") payload[field] = value.trim();
    }
    if (action === "SAVE_ADDON") payload.enabled = data.get("enabled") === "on";
    response = await client.rpc("manage_stay_partner_inventory", { p_property: property, p_room: room || null, p_action: action, p_data: payload });
  } else {
    return { ok: false, message: "Aksi operasional tidak valid." };
  }
  if (response.error) {
    const message = ["22023","P0001","PT409","23514"].includes(response.error.code)
      ? response.error.message
      : response.error.code === "42501" ? "Akses operasional tidak tersedia." : "Perubahan belum dapat disimpan. Periksa kelengkapan dan konflik data.";
    return { ok: false, message };
  }
  revalidatePath("/partner/stay/operations");
  revalidatePath("/admin/stay/operations");
  revalidatePath("/stay/[slug]", "page");
  return { ok: true, message: "Perubahan operasional tersimpan." };
}
