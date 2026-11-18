import { bookingAdmin } from "@/lib/supabase/booking-admin";
import { configuredEmailProvider, liveEmailAllowed, notificationAdminContext } from "@/lib/notifications/server";
import { notificationLabels, validEmail } from "@/lib/notifications/messages";
import { boundedBody, BookingError, privateHeaders, routeError, sameOrigin } from "@/lib/customer-bookings";

export async function GET() {
  const {client} = await notificationAdminContext();
  try {
    const [settings,templates] = await Promise.all([client.from("notification_settings").select("*").eq("id",true).single(),client.from("notification_whatsapp_templates").select("id,label,body,enabled").order("id")]);
    if (settings.error || templates.error) throw new BookingError("Pengaturan belum tersedia.",503);
    const provider=configuredEmailProvider();
    return Response.json({settings:{...settings.data,admin_email:settings.data.admin_email || process.env.ADMIN_NOTIFICATION_EMAIL || "",sender_name:settings.data.sender_name || process.env.SMTP_FROM_NAME || "SHIAP"},templates:templates.data,providerConfigured:Boolean(provider) && liveEmailAllowed(),testConfirmed:Boolean(settings.data.smtp_test_confirmed_at && provider && settings.data.verified_transport===provider.fingerprint)},{headers:privateHeaders});
  } catch (error) { return routeError(error); }
}
export async function POST(request: Request) {
  const {user} = await notificationAdminContext();
  try {
    sameOrigin(request);
    const body = JSON.parse((await boundedBody(request,4096)).toString("utf8"));
    if (typeof body.email_enabled!=="boolean" || typeof body.sender_name!=="string" || !body.sender_name.trim() || body.sender_name.length>80 || /[\r\n<>]/.test(body.sender_name)
      || typeof body.admin_email!=="string" || (body.admin_email && !validEmail(body.admin_email))
      || !Array.isArray(body.email_events) || body.email_events.some((type: unknown) => typeof type!=="string" || !(type in notificationLabels))
      || typeof body.payment_reminders!=="boolean" || typeof body.travel_reminders!=="boolean" || !Number.isInteger(body.reminder_minutes) || body.reminder_minutes<1 || body.reminder_minutes>10) throw new BookingError("Pengaturan tidak valid. Lead time pengingat harus 1–10 menit.");
    const provider = configuredEmailProvider();
    const verification=await bookingAdmin().from("notification_settings").select("smtp_test_confirmed_at,verified_transport").eq("id",true).single();
    if(verification.error)throw new BookingError("Status email uji belum tersedia.",503);
    if (body.email_enabled && (!provider || !liveEmailAllowed() || !verification.data.smtp_test_confirmed_at || verification.data.verified_transport!==provider.fingerprint || !await provider.adapter.verifySender(provider.sender))) throw new BookingError("Email tetap nonaktif. Konfigurasikan SMTP TLS dan konfirmasikan kode email uji yang diterima terlebih dahulu.");
    const result = await bookingAdmin().from("notification_settings").update({
      email_enabled:body.email_enabled,sender_name:body.sender_name.trim(),admin_email:body.admin_email,email_events:[...new Set(body.email_events)],
      payment_reminders:body.payment_reminders,travel_reminders:body.travel_reminders,reminder_minutes:body.reminder_minutes,
      ...(body.email_enabled?{provider_verified_at:new Date().toISOString(),verified_sender:provider!.sender}:{}),
      updated_by:user.id,updated_at:new Date().toISOString(),
    }).eq("id",true);
    if (result.error) throw new BookingError("Pengaturan gagal disimpan.",503);
    return Response.json({updated:true},{headers:privateHeaders});
  } catch (error) { return routeError(error); }
}
