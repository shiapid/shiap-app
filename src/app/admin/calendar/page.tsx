import BookingCalendar, { type CalendarBlockRecord, type CalendarBookingRecord } from "@/components/admin/booking-calendar";
import { isStayDate, todayInStay } from "@/lib/admin/stay-navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminCalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const [bookingResult, blockResult, tripResult, stayResult, experienceResult] = await Promise.all([
    supabase.from("booking_orders").select("id,order_number,customer_name,order_status,payment_status,booking_items(id,service_type,service_name,date_start,date_end,guests,quantity,property_id,room_type_id)").eq("payment_status", "paid").order("created_at", { ascending: false }),
    supabase.from("calendar_date_blocks").select("id,service_type,service_id,start_date,end_date,reason,created_at").order("start_date"),
    supabase.from("trip_packages").select("id,title").order("title"),
    supabase.from("stay_properties").select("id,name").order("name"),
    supabase.from("shiap_experiences").select("id,title,location,experience_type").order("title"),
  ]);

  const tripOptions = (tripResult.data ?? []).map((row) => ({ id: row.id, title: row.title }));
  const stayOptions = (stayResult.data ?? []).map((row) => ({ id: row.id, title: row.name }));
  const experiences = experienceResult.data ?? [];
  const stayOnly = query.service === "stay";
  const property = stayOnly ? stayOptions.find(item => item.id === query.property)?.id : undefined;
  const room = property && typeof query.room === "string" && /^[0-9a-f-]{36}$/i.test(query.room) ? query.room : undefined;
  const date = isStayDate(query.date) ? query.date : todayInStay();
  return <BookingCalendar key={`${stayOnly}:${property}:${room}:${date}`} stayOnly={stayOnly} stayProperty={property} stayRoom={room} initialDate={date}
    bookings={(bookingResult.data ?? []) as CalendarBookingRecord[]}
    initialBlocks={(blockResult.data ?? []) as CalendarBlockRecord[]}
    catalogs={{
      trip: tripOptions,
      stay: stayOptions,
      activity: experiences.filter((row) => row.experience_type === "activity").map((row) => ({ id: row.id, title: row.title, location: row.location })),
      documentation: experiences.filter((row) => row.experience_type === "documentation").map((row) => ({ id: row.id, title: row.title, location: row.location })),
    }}
  />;
}
