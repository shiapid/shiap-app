import { placesBillingEmail } from "@/lib/places/billing-notifications";
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import { bookingAdmin } from "@/lib/supabase/booking-admin";
import { BookingError } from "@/lib/customer-bookings";
import { renderEmail, type MessageBooking, type MessageContext } from "./messages";
import type { EmailMessage } from "./provider";
import { smtpConfiguration, smtpProvider } from "./smtp";
import { validCronAuthorization } from "./authorization";

export async function notificationAdminContext() {
  const user = await requireAdmin();
  return { user, client: await createClient() };
}
export function cronAuthorized(header: string | null, secret = process.env.NOTIFICATION_CRON_SECRET) {
  return validCronAuthorization(header,secret);
}
export function configuredEmailProvider() {
  const config=smtpConfiguration(process.env);
  return config ? {adapter:smtpProvider(config),sender:config.sender,name:config.name,fingerprint:createHash("sha256").update(JSON.stringify([config.host,config.port,config.secure,config.auth.user,config.sender,config.name])).digest("hex")} : null;
}
export function liveEmailAllowed() {
  return process.env.NODE_ENV === "production"
    && process.env.NEXT_PUBLIC_SHIAP_ENVIRONMENT === "production"
    && process.env.NEXT_PUBLIC_SUPABASE_URL === "https://sbomjhwmjmqteybsegdl.supabase.co";
}

export async function bookingMessageContext(id: string, itemId?: string | null): Promise<MessageContext> {
  const admin = bookingAdmin();
  const { data: booking, error } = await admin.from("booking_orders").select("id,order_number,customer_name,customer_whatsapp,customer_email,user_id,order_status,payment_status,payment_enabled,total_amount,inventory_hold_expires_at,booking_items(id,service_name,date_start,date_end,trip_id,departure_id,property_id,service_catalog_id)").eq("id",id).single();
  if (error || !booking) throw new BookingError("Booking tidak tersedia.",404);
  const items = (booking.booking_items as MessageBooking["booking_items"]).filter((item) => !itemId || item.id === itemId);
  const [bank, trips, departures, stays, experiences, sessions] = await Promise.all([
    admin.from("payment_settings").select("bank_name,account_name,account_number,is_active").eq("id",true).maybeSingle(),
    items.some((item) => item.trip_id) ? admin.from("trip_packages").select("location,meeting_point").in("id",items.flatMap((item) => item.trip_id ? [item.trip_id] : [])) : Promise.resolve({data:[],error:null}),
    items.some((item) => item.departure_id) ? admin.from("trip_departures").select("id,departure_date,end_date,departure_time,meeting_point").in("id",items.flatMap((item) => item.departure_id ? [item.departure_id] : [])) : Promise.resolve({data:[],error:null}),
    items.some((item) => item.property_id) ? admin.from("stay_properties").select("location,check_in_time").in("id",items.flatMap((item) => item.property_id ? [item.property_id] : [])) : Promise.resolve({data:[],error:null}),
    items.some((item) => item.service_catalog_id) ? admin.from("shiap_experiences").select("location").in("id",items.flatMap((item) => item.service_catalog_id ? [item.service_catalog_id] : [])) : Promise.resolve({data:[],error:null}),
    admin.from("shiap_experience_booking_records").select("booking_item_id,shiap_experience_sessions(starts_at,location_note)").eq("booking_id",id),
  ]);
  if (bank.error || trips.error || departures.error || stays.error || experiences.error || sessions.error) throw new BookingError("Rincian pesan belum dapat dimuat.",503);
  const location = [
    ...(trips.data || []).map((trip) => [trip.location,trip.meeting_point ? "Titik temu: " + trip.meeting_point : null].filter(Boolean).join(" · ")),
    ...(departures.data || []).map((departure) => departure.meeting_point ? "Titik temu jadwal: " + departure.meeting_point : null),
    ...(stays.data || []).map((stay) => [stay.location,stay.check_in_time ? "Check-in: " + stay.check_in_time : null].filter(Boolean).join(" · ")),
    ...(experiences.data || []).map((experience) => experience.location),
  ].filter(Boolean).join("\n");
  const exact = (sessions.data || []).filter((record) => !itemId || record.booking_item_id === itemId).flatMap((record) => {
    const raw = record.shiap_experience_sessions;
    const session = Array.isArray(raw) ? raw[0] : raw;
    return session?.starts_at ? [new Intl.DateTimeFormat("id-ID",{dateStyle:"long",timeStyle:"short",timeZone:"Asia/Makassar"}).format(new Date(session.starts_at)) + " WITA" + (session.location_note ? " · " + session.location_note : "")] : [];
  });
  const departureSchedules = (departures.data || []).map((departure) => {
    const date = new Intl.DateTimeFormat("id-ID",{dateStyle:"long",timeZone:"UTC"}).format(new Date(departure.departure_date + "T00:00:00Z"));
    const end = departure.end_date ? " – " + new Intl.DateTimeFormat("id-ID",{dateStyle:"long",timeZone:"UTC"}).format(new Date(departure.end_date + "T00:00:00Z")) : "";
    return date + end + (departure.departure_time ? " · " + departure.departure_time.slice(0,5) + " WITA" : "");
  });
  return { booking: { ...booking, booking_items: items } as MessageBooking, location, schedule: exact.length ? exact.join("\n") : departureSchedules.length ? departureSchedules.join("\n") : undefined,
    bank: booking.payment_enabled && bank.data?.is_active ? `${bank.data.bank_name}\n${bank.data.account_number}\na.n. ${bank.data.account_name}` : "" };
}

export async function dispatchNotifications() {
  const admin = bookingAdmin();
  const scheduled = await admin.rpc("notification_schedule");
  if (scheduled.error) throw new BookingError("Penjadwalan notifikasi belum tersedia.",503);
  const { data: settings, error } = await admin.from("notification_settings").select("*").eq("id",true).single();
  if (error) throw new BookingError("Pengaturan notifikasi belum tersedia.",503);
  if (!settings.email_enabled) return { processed: 0, sending: "disabled" };
  const provider = configuredEmailProvider();
  if (!provider || !liveEmailAllowed() || settings.verified_sender !== provider.sender || settings.verified_transport!==provider.fingerprint || !settings.provider_verified_at || !settings.smtp_test_confirmed_at) throw new BookingError("Konfigurasi pengiriman email belum terverifikasi.",503);
  const lease = randomUUID();
  const jobs = await admin.rpc("notification_claim", { p_limit:3,p_lease:lease });
  if (jobs.error) throw new BookingError("Antrean notifikasi belum tersedia.",503);
  let processed = 0;
  for (const job of jobs.data || []) {
    let smtpStarted=false;
    try {
      const {data:event,error:eventError} = await admin.from("notification_events").select("booking_id,booking_item_id,event_type,places_invoice_id,places_subscription_id").eq("id",job.event_id).single();
      if (eventError || !event) throw new Error("EVENT_READ_FAILURE");
      let message = job.message as EmailMessage | null;
      if (!message) {
        const rendered = event.event_type.startsWith("places_") ? await placesBillingEmail(event) : renderEmail(event.event_type,await bookingMessageContext(event.booking_id,event.booking_item_id),job.audience);
        message = { ...rendered,from:settings.sender_name + " <" + provider.sender + ">",to:[job.recipient] };
        const saved = await admin.from("notification_deliveries").update({message}).eq("id",job.id).eq("lease_id",lease).eq("state","processing").select("id").maybeSingle();
        if (saved.error || !saved.data) throw new Error("MESSAGE_SAVE_FAILURE");
      }
      // Recheck immediately before dispatch. Never send a stale reminder after
      // proof submission, cancellation, expiry, verification or a settings change.
      const ready = await admin.rpc("notification_delivery_ready",{p_id:job.id,p_lease:lease});
      if (ready.error) throw new Error("ELIGIBILITY_READ_FAILURE");
      let canSend=Boolean(ready.data);
      if(canSend && !provider.adapter.idempotent){
        const started=await admin.rpc("notification_begin_smtp",{p_id:job.id,p_lease:lease});
        if(started.error)throw new Error("DISPATCH_START_FAILURE");
        canSend=Boolean(started.data);smtpStarted=canSend;
      }
      const result = canSend ? await provider.adapter.send(message,"shiap-notification/" + job.id) : {state:"skipped",error:"NO_LONGER_ELIGIBLE"};
      const finished = await admin.rpc("notification_finish", {p_id:job.id,p_lease:lease,p_state:result.state,p_provider:"reference" in result ? result.reference : null,p_error:result.error || null});
      if (finished.error) throw new Error("ACKNOWLEDGEMENT_FAILURE");
      processed++;
    } catch {
      // No raw exceptions, provider responses, recipients or credentials in logs.
      await admin.rpc("notification_finish",{p_id:job.id,p_lease:lease,p_state:smtpStarted?"failed":"retry",p_error:smtpStarted?"SMTP_DELIVERY_UNCERTAIN":"DISPATCH_RUNTIME_FAILURE"});
    }
  }
  return { processed };
}
