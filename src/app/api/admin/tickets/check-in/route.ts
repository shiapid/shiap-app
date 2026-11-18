import { BookingError, boundedBody, privateHeaders, rateLimit, routeError, sameOrigin } from "@/lib/customer-bookings";
import { requireAdmin } from "@/lib/admin/guard";
import { bookingAdmin } from "@/lib/supabase/booking-admin";
import { parseTicketQrPayload } from "@/lib/etickets/credentials";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireAdmin();
    let body: { credential?: unknown };
    try { body = JSON.parse((await boundedBody(request, 512)).toString("utf8")); }
    catch { throw new BookingError("QR tiket tidak valid."); }
    if (typeof body.credential !== "string") throw new BookingError("QR tiket tidak valid.");
    const credential = parseTicketQrPayload(body.credential);
    if (!credential) throw new BookingError("QR tiket tidak valid.");
    await rateLimit("ticket-checkin", user.id, 120, 60);
    const { data, error } = await bookingAdmin().rpc("checkin_booking_ticket", { p_credential: credential, p_admin: user.id });
    if (error) throw new BookingError("Check-in belum dapat dicatat.", 503);
    const result = data as Record<string, unknown> | null;
    if (result?.result === "checked_in") return Response.json({ result: "checked_in", ticketCode: result.ticket_code,
      bookingCode: result.booking_code, serviceName: result.service_name, guests: result.guests, checkedInAt: result.checked_in_at }, { headers: privateHeaders });
    if (result?.result === "already_checked_in") return Response.json({ result: "already_checked_in", ticketCode: result.ticket_code,
      checkedInAt: result.checked_in_at }, { status: 409, headers: privateHeaders });
    throw new BookingError("Tiket tidak valid, dibatalkan, kedaluwarsa, atau belum lunas.", 404);
  } catch (error) { return routeError(error); }
}
