import { BookingError, bookingContext, ownedBooking, privateHeaders, rateLimit, refreshOrder, routeError, sameOrigin, boundedBody } from "@/lib/customer-bookings";

import { unifiedCheckoutEnabled, type UnifiedBookingView } from "@/lib/unified-checkout";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authorized = await ownedBooking(id);
    const { context, order } = await refreshOrder(id, authorized.context);
    await rateLimit("booking-read", context.user?.id || context.guest!, 90, 60);
    const unifiedResult = unifiedCheckoutEnabled
      ? await context.admin.rpc("server_unified_booking_view", { p_booking: id })
      : { data: null, error: null };
    if (unifiedResult.error) throw new BookingError("Status ketersediaan belum dapat dimuat. Coba lagi.", 503);
    const unified = unifiedResult.data as UnifiedBookingView | null;
    const paymentAvailable = order.payment_enabled && (!unified || unified.payment_available);
    const [proofs, settings, support, experience] = await Promise.all([
      context.admin.from("booking_payment_records").select("id,original_file_name,status,rejection_reason,submitted_at,review_due_at").eq("booking_id", id).order("submitted_at", { ascending: false }),
      paymentAvailable && process.env.NEXT_PUBLIC_SHIAP_DEMO_MODE !== "true"
        ? context.admin.from("payment_settings").select("bank_name,account_name,account_number,instructions,is_active").eq("id", true).eq("is_active", true).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      context.admin.from("custom_trip_settings").select("whatsapp_number").eq("id", true).maybeSingle(),
      context.admin.from("shiap_experience_booking_records").select("request_status,review_note").eq("booking_id", id).maybeSingle(),
    ]);
    if (proofs.error || settings.error || experience.error) throw new BookingError("Detail pembayaran belum dapat dimuat.", 503);
    return Response.json({ order, proofs: proofs.data, settings: settings.data, serverNow: new Date().toISOString(),
      supportPhone: support.data?.whatsapp_number || null, experience: experience.data, unified,
      canClaim: Boolean(context.user && !order.user_id && context.guest === order.guest_session_id),
      guest: !order.user_id,
    }, { headers: privateHeaders });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const { id } = await params;
    const { context } = await ownedBooking(id, await bookingContext());
    const body = JSON.parse((await boundedBody(request, 1024)).toString("utf8"));
    if (!["cancel", "claim"].includes(body?.action)) throw new BookingError("Aksi tidak didukung.");
    await rateLimit("booking-action", context.user?.id || context.guest!, 20, 3600);
    const { error } = await context.admin.rpc("customer_booking_action", {
      p_actor: context.user?.id ?? null, p_guest_hash: context.hash, p_booking_id: id, p_action: body.action,
    });
    if (error) throw new BookingError(error.code === "P0001" ? error.message : "Pesanan belum dapat diperbarui.");
    return Response.json({ updated: true }, { headers: privateHeaders });
  } catch (error) { return routeError(error); }
}
