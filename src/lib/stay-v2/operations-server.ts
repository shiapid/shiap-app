import "server-only";
import { isStayDate, todayInStay } from "@/lib/admin/stay-navigation";
import { createClient } from "@/lib/supabase/server";
import type { StayPartnerCalendarNight, StayPartnerOperations } from "./operations";

export async function loadStayPartnerOperations(client: Awaited<ReturnType<typeof createClient>>, query: { room?: string; from?: string }) {
  const response = await client.rpc("read_stay_partner_operations");
  if (response.error || !response.data) return null;
  const data = response.data as StayPartnerOperations;
  const room = data.rooms.find(row => row.id === query.room) ?? data.rooms[0];
  const from = isStayDate(query.from ?? null) ? query.from! : todayInStay();
  const until = new Date(Date.parse(from + "T00:00:00Z") + 7 * 86400_000).toISOString().slice(0,10);
  const calendar = room
    ? await client.rpc("read_stay_partner_calendar", { p_room: room.id, p_start: from, p_end: until })
    : { error: null, data: [] };
  return { data, calendar: (calendar.data as StayPartnerCalendarNight[] | null) ?? [], calendarRoom: room?.id ?? "", calendarError: calendar.error };
}
