import { createHmac } from "node:crypto";
import { BookingError, boundedBody, clientAddress, privateHeaders, rateLimit, routeError, sameOrigin } from "@/lib/customer-bookings";
import { bookingAdmin } from "@/lib/supabase/booking-admin";
import { validatePlacesLead, PLACES_PRIVACY_VERSION } from "@/lib/places/leads";
import { createPlacesReferralCode } from "@/lib/places/referral";
import { loadPlacesWhatsAppTemplate } from "@/lib/places/whatsapp-settings";
import { buildWhatsAppUrl } from "@/lib/places/utils";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await rateLimit("places-lead-ip", await clientAddress(), 10, 600);
    let body: unknown;
    try { body = JSON.parse((await boundedBody(request, 2048)).toString("utf8")); }
    catch { throw new BookingError("Data kontak tidak valid."); }
    const input = validatePlacesLead(body);
    if (!input) throw new BookingError("Isi nama dan nomor WhatsApp Indonesia yang valid.");
    await rateLimit("places-lead-phone", input.phone, 6, 3600);
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!;
    const fingerprint = createHmac("sha256", secret).update(JSON.stringify([input.propertyId,input.name,input.phone])).digest("hex");
    const admin = bookingAdmin();
    for (let attempt=0; attempt<3; attempt++) {
      const { data, error } = await admin.rpc("create_places_contact_lead", {
        p_request_id:input.requestId, p_property_id:input.propertyId, p_name:input.name, p_phone:input.phone,
        p_fingerprint:fingerprint, p_reference:createPlacesReferralCode(), p_privacy_version:PLACES_PRIVACY_VERSION,
      });
      if (error?.code === "23505") continue;
      if (error) throw new BookingError(error.code === "P0002" ? "Properti tidak tersedia." : "Kontak belum dapat disimpan. Coba lagi atau hubungi properti langsung.", error.code === "P0002" ? 404 : 503);
      const result = data as { phone:string; name:string; reference:string };
      const url = buildWhatsAppUrl({phone:result.phone, propertyName:result.name, refCode:result.reference, template:await loadPlacesWhatsAppTemplate()});
      if (!url) throw new BookingError("Tautan WhatsApp belum tersedia.",503);
      return Response.json({url,status:"HANDOFF_INITIATED",reference:result.reference},{headers:privateHeaders});
    }
    throw new BookingError("Kontak belum dapat disimpan. Silakan coba lagi.",503);
  } catch (error) { return routeError(error); }
}
