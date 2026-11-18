import { BookingError, boundedBody, clientAddress, privateHeaders, rateLimit, routeError, sameOrigin } from "@/lib/customer-bookings";
import { bookingAdmin } from "@/lib/supabase/booking-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await rateLimit("places-wa-click", await clientAddress(), 30, 3600);
    const raw = await boundedBody(request, 2048);
    let body: unknown;
    try { body = JSON.parse(raw.toString("utf8")); } catch { throw new BookingError("Permintaan tidak valid."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BookingError("Permintaan tidak valid.");
    const value = body as Record<string, unknown>;
    const propertyId = typeof value.propertyId === "string" ? value.propertyId : "";
    const refCode = typeof value.refCode === "string" ? value.refCode.toUpperCase() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(propertyId)
      || !/^SHP-[A-HJ-NP-Z2-9]{5}$/.test(refCode)) throw new BookingError("Referensi Places tidak valid.");

    const admin = bookingAdmin();
    const { data: property, error: propertyError } = await admin.from("places_public_directory_v").select("id").eq("id", propertyId).maybeSingle();
    if (propertyError) throw new BookingError("Layanan Places belum tersedia.", 503);
    if (!property) throw new BookingError("Properti tidak tersedia.", 404);
    const { error } = await admin.from("places_wa_click_events").insert({ property_id: propertyId, ref_code: refCode });
    if (error) throw new BookingError("Aktivitas belum dapat dicatat.", 503);
    // No visitor phone number, IP address, or WhatsApp message is stored.
    return new Response(null, { status: 204, headers: privateHeaders });
  } catch (error) {
    return routeError(error);
  }
}
