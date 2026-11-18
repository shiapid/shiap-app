import { notificationAdminContext } from "@/lib/notifications/server";
import { notificationLabels } from "@/lib/notifications/messages";
import { boundedBody, BookingError, privateHeaders, routeError, sameOrigin, uuidPattern } from "@/lib/customer-bookings";

export async function GET(request: Request) {
  const {client} = await notificationAdminContext();
  try {
    const type = new URL(request.url).searchParams.get("type") || "";
    if (type && !(type in notificationLabels)) throw new BookingError("Jenis notifikasi tidak valid.");
    let query = client.from("notification_events").select("id,booking_id,event_type,priority,created_at,booking_orders(order_number),notification_reads(admin_id),notification_deliveries!inner(channel)").eq("notification_deliveries.channel","admin").order("created_at",{ascending:false}).limit(100);
    if (type) query = query.eq("event_type",type);
    const [events, unread, failures] = await Promise.all([
      query,
      client.from("notification_events").select("id,notification_reads(event_id),notification_deliveries!inner(channel)",{count:"exact",head:true}).eq("notification_deliveries.channel","admin").is("notification_reads","null"),
      client.from("notification_deliveries").select("id,event_id,state,attempts,last_error,updated_at,notification_events(booking_id,event_type)").eq("channel","email").in("state",["failed","retry"]).order("updated_at",{ascending:false}).limit(30),
    ]);
    if (events.error || unread.error || failures.error) throw new BookingError("Notifikasi belum dapat dimuat.",503);
    return Response.json({events:events.data,unread:unread.count,failures:failures.data},{headers:privateHeaders});
  } catch (error) { return routeError(error); }
}
export async function POST(request: Request) {
  const {client} = await notificationAdminContext();
  try {
    sameOrigin(request);
    const body = JSON.parse((await boundedBody(request,1024)).toString("utf8"));
    if (body.id !== null && !uuidPattern.test(body.id || "")) throw new BookingError("Notifikasi tidak valid.");
    const result = await client.rpc("notification_mark_read",{p_event:body.id});
    if (result.error) throw new BookingError("Status baca gagal disimpan.",503);
    return Response.json({updated:true},{headers:privateHeaders});
  } catch (error) { return routeError(error); }
}
