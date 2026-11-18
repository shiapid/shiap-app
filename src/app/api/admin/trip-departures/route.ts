import { revalidatePath } from "next/cache";
import { requireApiAdmin } from "@/lib/admin/api-guard";
import { bookingAdmin } from "@/lib/supabase/booking-admin";
import { BookingError, boundedBody, privateHeaders, routeError, sameOrigin, uuidPattern } from "@/lib/customer-bookings";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireApiAdmin();
    const tripId = new URL(request.url).searchParams.get("trip_id") || "";
    if (!uuidPattern.test(tripId)) throw new BookingError("Trip tidak valid.");
    const { data, error } = await bookingAdmin().from("trip_departures")
      .select("id,trip_id,departure_date,end_date,departure_time,price_per_person,min_participants,max_participants,booked_seats,status,meeting_point,notes,updated_at,version")
      .eq("trip_id", tripId).order("departure_date", { ascending: true });
    if (error) throw new BookingError("Jadwal Trip belum dapat dimuat.", 503);
    return Response.json({ departures: data ?? [] }, { headers: privateHeaders });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await requireApiAdmin();
    let body: Record<string, unknown>;
    try { body = JSON.parse((await boundedBody(request, 8192)).toString("utf8")); }
    catch { throw new BookingError("Data jadwal tidak valid."); }
    const date = typeof body.departure_date === "string" ? body.departure_date : "";
    const endDate = typeof body.end_date === "string" && body.end_date ? body.end_date : null;
    const time = typeof body.departure_time === "string" && body.departure_time ? body.departure_time : null;
    const price = body.price_per_person === null || body.price_per_person === "" ? null : Number(body.price_per_person);
    const minimum = Number(body.min_participants);
    const maximum = Number(body.max_participants);
    const status = body.status;
    const tripId = typeof body.trip_id === "string" ? body.trip_id : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const meetingPoint = typeof body.meeting_point === "string" ? body.meeting_point.trim() : "";
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0,10) === value;
    if (!uuidPattern.test(tripId) || !validDate(date) || (endDate && (!validDate(endDate) || endDate < date))
      || (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) || (price !== null && (!Number.isFinite(price) || price < 0))
      || !Number.isSafeInteger(minimum) || minimum < 1 || !Number.isSafeInteger(maximum) || maximum < minimum
      || !["draft", "open", "full", "cancelled"].includes(String(status)) || notes.length > 2000 || meetingPoint.length > 500) {
      throw new BookingError("Tanggal, harga, kapasitas, status, atau detail jadwal tidak valid.");
    }
    const admin = bookingAdmin();
    const { data: trip, error: tripError } = await admin.from("trip_packages").select("slug").eq("id", tripId).maybeSingle();
    if (tripError || !trip) throw new BookingError("Trip tidak ditemukan.", 404);
    const { error } = await admin.from("trip_departures").insert({
      trip_id: tripId, departure_date: date, end_date: endDate, departure_time: time,
      price_per_person: price, min_participants: minimum, max_participants: maximum,
      status, meeting_point: meetingPoint || null, notes: notes || null,
    });
    if (error) throw new BookingError("Jadwal baru gagal disimpan. Pastikan tanggal belum terdaftar.", 409);
    revalidatePath("/trip/[slug]", "page");
    revalidatePath("/explore", "page");
    revalidatePath("/booking", "page");
    return Response.json({ created: true }, { status: 201, headers: privateHeaders });
  } catch (error) { return routeError(error); }
}
