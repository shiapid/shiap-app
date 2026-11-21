"use server";

import { revalidatePath } from "next/cache";
import { requirePlacesMember } from "@/lib/places/partner";
import { uuidPattern } from "@/lib/customer-bookings";
import type { StayV2FormState } from "@/components/stay-v2/mutation-form";

export async function saveStayV2Basics(propertyId: string, _state: StayV2FormState, data: FormData): Promise<StayV2FormState> {
  const destinationId = String(data.get("destinationId") ?? "");
  if (!uuidPattern.test(destinationId)) return { ok: false, message: "Pilih destinasi yang valid." };
  try {
    const { client } = await requirePlacesMember(propertyId, true);
    const { error } = await client.rpc("partner_update_stay_v2_basics", {
      p_property_id: propertyId, p_destination_id: destinationId, p_accommodation_type: String(data.get("accommodationType") ?? ""),
    });
    if (error) return { ok: false, message: error.code === "22023" ? error.message : "Profil belum dapat disimpan." };
    revalidatePath("/partner/places/" + propertyId);
    return { ok: true, message: "Profil dasar tersimpan." };
  } catch {
    return { ok: false, message: "Akses pengelola properti diperlukan." };
  }
}
