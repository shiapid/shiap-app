import { bookingAdmin } from "@/lib/supabase/booking-admin";
import { bookingMessageContext, notificationAdminContext } from "@/lib/notifications/server";
import { normalizeWhatsApp, renderWhatsApp } from "@/lib/notifications/messages";
import { boundedBody, BookingError, privateHeaders, routeError, sameOrigin, uuidPattern } from "@/lib/customer-bookings";

export async function GET(_request: Request, {params}: {params: Promise<{id:string}>}) {
  const {client} = await notificationAdminContext();
  try {
    const {id} = await params;
    if (!uuidPattern.test(id)) throw new BookingError("Booking tidak valid.");
    const templates = await client.from("notification_whatsapp_templates").select("id,label").eq("enabled",true).order("label");
    if (templates.error) throw new BookingError("Template belum tersedia.",503);
    return Response.json({templates:templates.data},{headers:privateHeaders});
  } catch(error) { return routeError(error); }
}
export async function POST(request: Request, {params}: {params: Promise<{id:string}>}) {
  const {user,client} = await notificationAdminContext();
  try {
    sameOrigin(request);
    const {id} = await params;
    if (!uuidPattern.test(id)) throw new BookingError("Booking tidak valid.");
    const body = JSON.parse((await boundedBody(request,1024)).toString("utf8"));
    const admin = bookingAdmin();
    if (body.action === "prepare") {
      const template = await client.from("notification_whatsapp_templates").select("id,body").eq("id",body.template).eq("enabled",true).maybeSingle();
      if (template.error || !template.data) throw new BookingError("Template tidak tersedia.");
      const context = await bookingMessageContext(id);
      const booking = context.booking;
      if (template.data.id === "payment_verified") {
        const ledger = await admin.from("finance_transaction_entries").select("id").eq("booking_id",id).eq("entry_type","payment").eq("status","posted").eq("amount",booking.total_amount).not("external_reference","is",null).limit(1);
        if (ledger.error || !ledger.data?.length || booking.payment_status !== "paid") throw new BookingError("Pembayaran penuh belum terverifikasi.");
      }
      if (["payment_reminder","payment_instructions"].includes(template.data.id)) {
        const proof = await admin.from("booking_payment_records").select("id").eq("booking_id",id).in("status",["pending","approved"]).limit(1);
        if (proof.error || proof.data?.length || !booking.payment_enabled || booking.payment_status!=="unpaid" || !["pending_confirmation","confirmed"].includes(booking.order_status)
          || !booking.inventory_hold_expires_at || new Date(booking.inventory_hold_expires_at).getTime()<=Date.now() || !context.bank) throw new BookingError("Pesanan tidak memenuhi syarat instruksi atau pengingat pembayaran.");
      }
      if (template.data.id === "booking_cancelled" && !["cancelled","expired"].includes(booking.order_status)) throw new BookingError("Pesanan belum dibatalkan atau kedaluwarsa.");
      if (template.data.id === "proof_received") {
        const proof = await admin.from("booking_payment_records").select("id").eq("booking_id",id).eq("status","pending").limit(1);
        if (proof.error || !proof.data?.length) throw new BookingError("Tidak ada bukti yang menunggu verifikasi.");
      }
      if (template.data.id === "payment_rejected") {
        const proof = await admin.from("booking_payment_records").select("status").eq("booking_id",id).order("submitted_at",{ascending:false}).limit(1);
        if (proof.error || proof.data?.[0]?.status!=="rejected" || booking.payment_status==="paid") throw new BookingError("Pesanan tidak memerlukan koreksi bukti.");
      }
      const phone = normalizeWhatsApp(booking.customer_whatsapp);
      if (!phone) throw new BookingError("Nomor WhatsApp pelanggan belum valid. Periksa nomor sebelum mengirim.");
      const audit = await admin.from("notification_whatsapp_activity").insert({booking_id:id,template_id:template.data.id,operator_id:user.id}).select("id").single();
      if (audit.error) throw new BookingError("Aktivitas belum dapat dicatat.",503);
      return Response.json({id:audit.data.id,phone,message:renderWhatsApp(template.data.body,context)},{headers:privateHeaders});
    }
    if (!["opened","manual_sent"].includes(body.action) || !uuidPattern.test(body.id || "")) throw new BookingError("Aksi tidak valid.");
    const result = await admin.from("notification_whatsapp_activity").update({state:body.action,...(body.action==="opened" ? {opened_at:new Date().toISOString()} : {manually_confirmed_at:new Date().toISOString()})})
      .eq("id",body.id).eq("booking_id",id).eq("operator_id",user.id).eq("state",body.action==="opened" ? "selected" : "opened").select("id").maybeSingle();
    if (result.error || !result.data) throw new BookingError("Aktivitas tidak dapat diubah. Muat ulang preview.");
    return Response.json({updated:true},{headers:privateHeaders});
  } catch(error) { return routeError(error); }
}
