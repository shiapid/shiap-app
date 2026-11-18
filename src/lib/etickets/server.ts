import "server-only";
import { BookingError, ownedBooking, rateLimit } from "@/lib/customer-bookings";
import { bookingAdmin } from "@/lib/supabase/booking-admin";

export type BusinessContact = {
  contact_name: string;
  whatsapp: string | null;
  email: string | null;
  website: string;
  instagram: string | null;
  tiktok: string | null;
  youtube: string | null;
};

export type TicketRecord = {
  id: string;
  booking_item_id: string;
  ticket_code: string;
  qr_credential: string;
  status: "issued" | "checked_in" | "revoked";
  issued_at: string;
};

export type TicketPdfData = {
  isSyntheticSample?: boolean;
  ticket: TicketRecord;
  bookingCode: string;
  customerName: string;
  orderStatus: string;
  items: {
    id: string;
    service_type: string;
    service_category: string | null;
    service_name: string;
    variant: string | null;
    date_start: string;
    date_end: string | null;
    guests: number;
    quantity: number;
    notes: string | null;
    selected_addons: unknown;
    trip_id: string | null;
    property_id: string | null;
    room_type_id: string | null;
    service_catalog_id: string | null;
    session: string | null;
    location: string | null;
    check_in_time: string | null;
    check_out_time: string | null;
  }[];
  contacts: BusinessContact;
};

const emptyContacts: BusinessContact = {
  contact_name: "SHIAP", whatsapp: null, email: null, website: "https://shiap.id", instagram: null, tiktok: null, youtube: null,
};

export async function loadOwnedTicketData(bookingId: string): Promise<TicketPdfData[]> {
  const { context, order } = await ownedBooking(bookingId);
  if (order.payment_status !== "paid" || ["cancelled", "expired", "rejected"].includes(order.order_status)) {
    throw new BookingError("E-Tiket tersedia setelah pembayaran penuh diverifikasi.", 404);
  }
  const identity = context.user?.id || context.guest;
  if (!identity) throw new BookingError("Akses pesanan tidak tersedia.", 404);
  await rateLimit("ticket-read", identity, 60, 60);

  const admin = bookingAdmin();
  const [itemResult, ticketResult, contactResult, sessionResult] = await Promise.all([
    admin.from("booking_items").select("id,service_type,service_category,service_name,variant,date_start,date_end,guests,quantity,notes,selected_addons,trip_id,property_id,room_type_id,service_catalog_id").eq("booking_id", bookingId),
    admin.from("booking_tickets").select("id,booking_item_id,ticket_code,qr_credential,status,issued_at").eq("booking_id", bookingId).order("issued_at"),
    admin.from("shiap_business_contact_settings").select("contact_name,whatsapp,email,website,instagram,tiktok,youtube").eq("id", true).maybeSingle(),
    admin.from("shiap_experience_booking_records").select("booking_item_id,shiap_experience_sessions(starts_at,ends_at,location_note)").eq("booking_id", bookingId),
  ]);
  if (itemResult.error || ticketResult.error || contactResult.error || sessionResult.error) throw new BookingError("E-Tiket belum dapat dimuat.", 503);

  const items = itemResult.data ?? [];
  const itemIds = new Set(items.map((item) => item.id));
  const ticketRows = (ticketResult.data ?? []).filter((ticket) => itemIds.has(ticket.booking_item_id) && ticket.status !== "revoked");
  if (ticketRows.length === 0) return [];

  const tripIds = items.flatMap((item) => item.trip_id ? [item.trip_id] : []);
  const propertyIds = items.flatMap((item) => item.property_id ? [item.property_id] : []);
  const experienceIds = items.flatMap((item) => item.service_catalog_id ? [item.service_catalog_id] : []);
  const [trips, properties, experiences] = await Promise.all([
    tripIds.length ? admin.from("trip_packages").select("id,location,meeting_point").in("id", tripIds) : Promise.resolve({ data: [], error: null }),
    propertyIds.length ? admin.from("stay_properties").select("id,location,address,check_in_time,check_out_time").in("id", propertyIds) : Promise.resolve({ data: [], error: null }),
    experienceIds.length ? admin.from("shiap_experiences").select("id,location").in("id", experienceIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (trips.error || properties.error || experiences.error) throw new BookingError("Informasi layanan E-Tiket belum dapat dimuat.", 503);

  const sessions = new Map<string, string>();
  const sessionLocations = new Map<string, string>();
  for (const record of sessionResult.data ?? []) {
    const raw = record.shiap_experience_sessions;
    const session = Array.isArray(raw) ? raw[0] : raw;
    if (session?.starts_at) {
      const start = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" }).format(new Date(session.starts_at));
      const end = session.ends_at ? new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Makassar" }).format(new Date(session.ends_at)) : "";
      sessions.set(record.booking_item_id, `${start}${end ? " – " + end : ""} WITA`);
      if (session.location_note) sessionLocations.set(record.booking_item_id, session.location_note);
    }
  }
  const tripMap = new Map((trips.data ?? []).map((trip) => [trip.id, trip]));
  const propertyMap = new Map((properties.data ?? []).map((property) => [property.id, property]));
  const experienceMap = new Map((experiences.data ?? []).map((experience) => [experience.id, experience]));
  const enriched = items.map((item) => {
    const trip = item.trip_id ? tripMap.get(item.trip_id) : null;
    const property = item.property_id ? propertyMap.get(item.property_id) : null;
    const experience = item.service_catalog_id ? experienceMap.get(item.service_catalog_id) : null;
    const location = item.service_type === "trip"
      ? [trip?.location, trip?.meeting_point ? "Titik kumpul: " + trip.meeting_point : null].filter(Boolean).join(" · ")
      : item.service_type === "stay"
        ? [property?.location, property?.address].filter(Boolean).join(" · ")
        : experience?.location ?? sessionLocations.get(item.id) ?? null;
    return { ...item, location: location || null, session: sessions.get(item.id) ?? null,
      check_in_time: property?.check_in_time ?? null, check_out_time: property?.check_out_time ?? null };
  });
  const contacts = contactResult.data ?? emptyContacts;
  const byItem = new Map(enriched.map((item) => [item.id, item]));
  return ticketRows.flatMap((ticket) => {
    const item = byItem.get(ticket.booking_item_id);
    return item ? [{ ticket: ticket as TicketRecord, bookingCode: order.order_number, customerName: order.customer_name,
      orderStatus: order.order_status, items: [item], contacts }] : [];
  });
}
