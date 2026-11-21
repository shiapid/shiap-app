import { placesNotificationLabels } from "../places/billing-messages.ts";
export const notificationLabels: Record<string, string> = {
  ...placesNotificationLabels,
  booking_created: "Booking baru", payment_reminder: "Pengingat pembayaran", proof_received: "Bukti baru · menunggu verifikasi",
  payment_verified: "Pembayaran diverifikasi", payment_rejected: "Pembayaran perlu tindakan", booking_cancelled: "Booking dibatalkan",
  booking_expired: "Booking kedaluwarsa", travel_reminder: "Pengingat perjalanan / check-in", approval_required: "Perlu persetujuan Admin",
  activity_today: "Keberangkatan / check-in hari ini", delivery_failed: "Pengiriman email gagal",
  trip_schedule_changed: "Perubahan jadwal Trip",
  item_refund_requested: "Refund layanan diajukan", item_refund_approved: "Refund layanan disetujui",
  item_refund_rejected: "Refund layanan ditolak", item_refund_paid: "Refund layanan dibayar",
  booking_item_cancelled: "Layanan dibatalkan",
};
export type MessageBooking = {
  id: string; order_number: string; customer_name: string; customer_whatsapp: string; customer_email: string | null;
  user_id: string | null; order_status: string; payment_status: string; payment_enabled: boolean; total_amount: number;
  inventory_hold_expires_at: string | null;
  booking_items: { id: string; service_name: string; date_start: string; date_end: string | null; trip_id?: string | null; departure_id?: string | null; property_id?: string | null; service_catalog_id?: string | null }[];
};
export type MessageContext = { booking: MessageBooking; bank: string; location: string; schedule?: string };
export function validEmail(value: string) { return value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value); }
export function normalizeWhatsApp(value: string) {
  if (!/^[+\d\s().-]+$/.test(value)) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0062")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  else if (digits.startsWith("8")) digits = "62" + digits;
  return /^628\d{8,11}$/.test(digits) ? digits : null;
}
const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const day = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" }).format(new Date(value.slice(0,10) + "T00:00:00Z"));
export function messageVariables(context: MessageContext) {
  const b = context.booking;
  return {
    customer_name: b.customer_name, booking_code: b.order_number,
    services: b.booking_items.map((item) => item.service_name).join(", "), total: money(Number(b.total_amount)),
    deadline: b.payment_enabled && b.inventory_hold_expires_at ? new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Makassar" }).format(new Date(b.inventory_hold_expires_at)) + " WITA" : "Pembayaran belum dibuka; menunggu persetujuan Admin",
    booking_url: "https://app.shiap.id/my-booking/" + encodeURIComponent(b.id),
    access_instructions: b.user_id ? "Masuk ke akun pemilik booking untuk melihat Pesanan Saya." : "Buka Pesanan Saya dengan browser dan perangkat saat memesan. Tautan ini tidak memberikan akses di perangkat lain. Jika akses hilang, hubungi SHIAP untuk verifikasi kepemilikan manual. Kode booking atau nomor telepon saja tidak memberi akses.",
    bank: context.bank || "Informasi rekening tersedia di Pesanan Saya ketika pembayaran dibuka.",
    schedule: context.schedule || b.booking_items.map((item) => `${item.service_name}: ${day(item.date_start)}${item.date_end ? " s.d. " + day(item.date_end) : ""}`).join("\n"),
    location: context.location || "Detail lokasi atau titik temu belum tersedia. Hubungi SHIAP bila diperlukan.",
  };
}
export function renderWhatsApp(template: string, context: MessageContext) {
  const variables = messageVariables(context);
  return template.replace(/\{\{([a-z_]+)\}\}/g, (match, key: keyof typeof variables) => variables[key] ?? match);
}
export function whatsappUrl(phone: string, message: string) {
  const number = normalizeWhatsApp(phone);
  if (!number || message.length > 6000) return null;
  return "https://wa.me/" + number + "?text=" + encodeURIComponent(message);
}
export function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!)); }
export function renderEmail(event: string, context: MessageContext, audience: string) {
  const variables = messageVariables(context);
  const explanations: Record<string, string> = {
    booking_created: "Pesanan Anda telah dibuat. Periksa rincian dan status di Pesanan Saya. Pembayaran penuh 100% melalui transfer bank ketika pembayaran dibuka.",
    payment_reminder: "Pesanan masih menunggu pembayaran. Periksa batas waktu dan instruksi transfer di Pesanan Saya. Jangan transfer jika reservasi telah berakhir.",
    proof_received: "Bukti transfer telah diterima. Admin sedang memeriksa dana masuk dan nominal penuh. Bukti diterima belum berarti pembayaran berhasil atau lunas.",
    payment_verified: "Admin telah memverifikasi pembayaran penuh terhadap dana bank yang diterima. Periksa status layanan di Pesanan Saya.",
    payment_rejected: "Bukti transfer memerlukan tindakan. Periksa alasan penolakan di Pesanan Saya lalu ikuti petunjuk Admin. Jika reservasi sudah berakhir, hubungi SHIAP.",
    item_refund_requested: "Permintaan refund untuk layanan ini tercatat dan menunggu tinjauan Finance.",
    item_refund_approved: "Finance menyetujui refund untuk layanan ini. Transfer masih menunggu pencatatan.",
    item_refund_rejected: "Finance tidak menyetujui permintaan refund untuk layanan ini. Periksa rincian pesanan.",
    item_refund_paid: "Finance telah mencatat transfer refund untuk layanan ini berdasarkan mutasi bank.",
    booking_item_cancelled: "Layanan ini dibatalkan. Periksa status layanan lain dan refund pada rincian pesanan.",
    booking_cancelled: "Status pesanan telah berubah menjadi dibatalkan. Jika sudah transfer, hubungi SHIAP untuk pemeriksaan manual. Pesan ini tidak mengonfirmasi refund.",
    booking_expired: "Reservasi telah kedaluwarsa. Jangan transfer ke pesanan ini. Jika sudah transfer, hubungi SHIAP untuk pemeriksaan manual.",
    trip_schedule_changed: "Jadwal Trip pada pesanan Anda telah diperbarui. Periksa tanggal, waktu, titik temu, dan status terbaru pada detail pesanan sebelum berangkat.",
    travel_reminder: "Pengingat jadwal layanan Anda. Gunakan informasi lokasi dan titik temu yang telah dikonfirmasi. Bila detail belum tersedia, hubungi SHIAP.",
    approval_required: "Pesanan Experience memerlukan pemeriksaan dan persetujuan Admin sebelum pembayaran dibuka.",
    activity_today: "Terdapat layanan yang dijadwalkan hari ini. Periksa rincian dan kesiapan operasional.",
  };
  const title = notificationLabels[event] || "Informasi pesanan SHIAP";
  const partner = audience === "partner";
  const paragraphs = partner ? [explanations[event] || "Periksa status layanan Anda.",
    "Kode booking: " + variables.booking_code, "Layanan: " + variables.services,
    "Masuk ke dashboard Partner untuk melihat rincian layanan Anda."] : ["Halo " + variables.customer_name + ",", explanations[event] || "Periksa status pesanan Anda.",
    "Kode booking: " + variables.booking_code, "Layanan: " + variables.services, "Total Pembayaran 100%: " + variables.total,
    ...(["booking_created","payment_reminder"].includes(event) ? ["Batas pembayaran: " + variables.deadline] : []),
    ...(["travel_reminder","activity_today","trip_schedule_changed"].includes(event) ? [variables.schedule,variables.location] : []),
    audience === "admin" ? "Notifikasi operasional untuk Admin SHIAP." : variables.access_instructions];
  const url = partner ? "https://app.shiap.id/partner/stay/operations" : audience === "admin" ? "https://app.shiap.id/admin/bookings/" + encodeURIComponent(context.booking.id) : variables.booking_url;
  const text = [title,...paragraphs,url].join("\n\n");
  const html = `<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="UTF-8"></head><body style="margin:0;background:#F7F9FC;font-family:Arial,sans-serif;color:#0A2E63"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:20px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:auto;background:white;border-radius:16px"><tr><td style="padding:24px"><p style="color:#1265D8;font-weight:bold">SHIAP</p><h1 style="font-size:22px">${escapeHtml(title)}</h1>${paragraphs.map((p) => `<p style="font-size:15px;line-height:1.6;overflow-wrap:anywhere">${escapeHtml(p).replaceAll("\n","<br>")}</p>`).join("")}<a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 18px;background:#1265D8;color:white;border-radius:10px;text-decoration:none">${partner ? "Buka dashboard Partner" : audience === "admin" ? "Buka booking" : "Lihat Pesanan Saya"}</a><p style="font-size:12px;color:#64748B;margin-top:24px">Pesan transaksional SHIAP. Jangan bagikan informasi akses akun atau bukti pembayaran.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject: (title + " · " + variables.booking_code).replace(/[\r\n]/g," "), text, html };
}
