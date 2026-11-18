import type { CustomerOrder, ProofRecord } from "@/lib/booking-view";
import { bookingContext, boundedBody, BookingError, clientAddress, ownerFilter, orderFields, privateHeaders, rateLimit, routeError, sameOrigin, uuidPattern } from "@/lib/customer-bookings";

export async function GET() {
  try {
    const context = await bookingContext();
    const filter = ownerFilter(context);
    if (!filter) return Response.json({ orders: [], guest: true }, { headers: privateHeaders });
    await rateLimit("booking-read", context.user?.id || context.guest!, 90, 60);
    const expiry = await context.admin.rpc("expire_booking_holds");
    if (expiry.error) throw new BookingError("Status pesanan belum dapat dimuat.", 503);
    const { data, error } = await context.admin.from("booking_orders").select(orderFields + ",booking_payment_records(status,submitted_at)").or(filter).order("created_at", { ascending: false }).returns<(CustomerOrder & { booking_payment_records: Pick<ProofRecord, "status" | "submitted_at">[] })[]>();
    if (error) throw new BookingError("Pesanan belum dapat dimuat.", 503);
    return Response.json({ orders: data?.map((order) => ({ ...order, proofRejected: order.booking_payment_records.slice().sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))[0]?.status === "rejected" })), guest: !context.user }, { headers: privateHeaders });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const context = await bookingContext();
    if (!ownerFilter(context)) throw new BookingError("Sesi tamu berakhir. Coba lagi.", 401);
    const id = request.headers.get("idempotency-key") || "";
    if (!uuidPattern.test(id)) throw new BookingError("Kunci checkout tidak valid.");
    const body = JSON.parse((await boundedBody(request, 64 * 1024)).toString("utf8"));
    if (!body || !["booking", "experience"].includes(body.kind) || typeof body.payload !== "object" || !body.payload) throw new BookingError("Permintaan booking tidak valid.");
    await rateLimit("checkout-address", await clientAddress(), 20, 3600);
    await rateLimit("checkout-owner", context.user?.id || context.guest!, 10, 3600);
    const { data, error } = await context.admin.rpc("checkout_booking", {
      p_actor: context.user?.id ?? null, p_guest_hash: context.hash, p_request_id: id, p_payload: body.payload, p_kind: body.kind,
    });
    if (error) throw new BookingError(error.code === "P0001" || error.code === "23514" ? error.message : "Booking belum dapat diproses. Periksa data layanan dan Pesanan Saya.");
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.id) throw new BookingError("Pesanan belum dapat dikonfirmasi. Periksa Pesanan Saya.", 503);
    return Response.json({ id: result.id }, { headers: privateHeaders });
  } catch (error) { return routeError(error); }
}
