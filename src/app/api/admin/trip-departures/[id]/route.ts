import { parseCatalogRupiah } from "@/lib/rupiah-input";
import { revalidatePath } from "next/cache";
import { requireApiAdmin } from "@/lib/admin/api-guard";
import { BookingError, boundedBody, privateHeaders, routeError, sameOrigin, uuidPattern } from "@/lib/customer-bookings";
import { bookingAdmin } from "@/lib/supabase/booking-admin";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const user = await requireApiAdmin();
    const { id } = await params;
    if (!uuidPattern.test(id)) throw new BookingError("Jadwal tidak valid.");
    let body: Record<string, unknown>;
    try { body = JSON.parse((await boundedBody(request, 8192)).toString("utf8")); }
    catch { throw new BookingError("Data jadwal tidak valid."); }
    const date = typeof body.departure_date === "string" ? body.departure_date : "";
    const endDate = typeof body.end_date === "string" && body.end_date ? body.end_date : null;
    const time = typeof body.departure_time === "string" && body.departure_time ? body.departure_time : null;
    const hasPrice = body.price_per_person != null && body.price_per_person !== "";
    const price = hasPrice ? parseCatalogRupiah(body.price_per_person) : null;
    const minimum = Number(body.min_participants);
    const maximum = Number(body.max_participants);
    const status = body.status;
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const meetingPoint = typeof body.meeting_point === "string" ? body.meeting_point.trim() : "";
    const expectedVersion = Number(body.expected_version);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const confirmImpact = body.confirm_impact === true;
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0,10) === value;
    if (!validDate(date) || (endDate && (!validDate(endDate) || endDate < date))
      || (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) || (hasPrice && price === null)
      || !Number.isSafeInteger(minimum) || minimum < 1 || !Number.isSafeInteger(maximum) || maximum < minimum
      || !["draft", "open", "full", "cancelled"].includes(String(status)) || notes.length > 2000 || meetingPoint.length > 500
      || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || reason.length > 500) {
      throw new BookingError("Tanggal, harga, kapasitas, status, atau detail jadwal tidak valid.");
    }
    const admin = bookingAdmin();
    const { data, error } = await admin.rpc("admin_update_trip_departure", {
      p_actor: user.id, p_departure_id: id, p_expected_version: expectedVersion,
      p_departure_date: date, p_end_date: endDate, p_departure_time: time,
      p_price_per_person: price, p_min_participants: minimum, p_max_participants: maximum,
      p_status: status, p_meeting_point: meetingPoint || null, p_notes: notes || null,
      p_reason: reason || null, p_confirm_impact: confirmImpact,
    });
    if (error) throw new BookingError(error.message || "Jadwal gagal diperbarui.", 409);
    const result = data as Record<string, unknown>;
    if (result.result === "updated") {
      const { data: departure } = await admin.from("trip_departures").select("trip_id").eq("id", id).maybeSingle();
      const { data: trip } = departure ? await admin.from("trip_packages").select("slug").eq("id", departure.trip_id).maybeSingle() : { data: null };
      if (trip?.slug) revalidatePath(`/trip/${trip.slug}`, "page");
      revalidatePath("/explore", "page");
      revalidatePath("/booking", "page");
    }
    return Response.json(result, { status: result.result === "conflict" ? 409 : 200, headers: privateHeaders });
  } catch (error) { return routeError(error); }
}
