import { bookingAdmin } from "@/lib/supabase/booking-admin";
import { boundedBody, BookingError, clientAddress, privateHeaders, rateLimit, routeError, sameOrigin } from "@/lib/customer-bookings";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = JSON.parse((await boundedBody(request, 4096)).toString("utf8"));
    if (!Array.isArray(body?.subtotals) || body.subtotals.length > 20 || body.subtotals.some((item: { subtotal?: unknown; category?: unknown }) =>
      !item || typeof item.category !== "string" || !["trip", "stay", "activity", "rental", "documentation", "other"].includes(item.category)
      || typeof item.subtotal !== "number" || !Number.isSafeInteger(item.subtotal) || item.subtotal < 0 || item.subtotal > 999_999_999_999)) throw new BookingError("Subtotal tidak valid.");
    await rateLimit("fee-quote", await clientAddress(), 240, 60);
    // Estimated subtotals are for display only. Checkout ignores this quote and
    // snapshots fees against catalog-priced booking_items inside its transaction.
    const { data, error } = await bookingAdmin().rpc("quote_service_fees", { p_subtotals: body.subtotals });
    if (error) throw new BookingError("Biaya layanan belum dapat dihitung. Coba lagi.", 503);
    return Response.json(data, { headers: privateHeaders });
  } catch (error) { return routeError(error); }
}
