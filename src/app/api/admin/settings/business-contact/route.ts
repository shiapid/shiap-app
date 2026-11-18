import { BookingError, boundedBody, privateHeaders, routeError, sameOrigin } from "@/lib/customer-bookings";
import { requireAdmin } from "@/lib/admin/guard";
import { normalizeWhatsApp, validEmail } from "@/lib/notifications/messages";
import { bookingAdmin } from "@/lib/supabase/booking-admin";

export const runtime = "nodejs";
export async function GET() {
  try {
    await requireAdmin();
    const { data, error } = await bookingAdmin().from("shiap_business_contact_settings").select("contact_name,whatsapp,email,website,instagram,tiktok,youtube").eq("id", true).single();
    if (error || !data) throw new BookingError("Pengaturan kontak bisnis belum tersedia. Periksa migration E-Ticket.", 503);
    return Response.json({ settings: data, ready: Boolean(data.whatsapp && data.email) }, { headers: privateHeaders });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireAdmin();
    let body: Record<string, unknown>;
    try { body = JSON.parse((await boundedBody(request, 4096)).toString("utf8")); }
    catch { throw new BookingError("Data kontak tidak valid."); }
    const value = (key: string, max: number) => typeof body[key] === "string" ? (body[key] as string).trim().slice(0, max) : "";
    const contactName = value("contact_name", 80);
    const rawWhatsApp = value("whatsapp", 40);
    const whatsapp = rawWhatsApp ? normalizeWhatsApp(rawWhatsApp) : null;
    const email = value("email", 254).toLowerCase();
    const website = value("website", 300);
    const instagram = value("instagram", 300);
    const tiktok = value("tiktok", 300);
    const youtube = value("youtube", 300);
    if (!contactName || /[\r\n<>]/.test(contactName)) throw new BookingError("Nama kontak wajib diisi.");
    if (rawWhatsApp && !whatsapp) throw new BookingError("Nomor WhatsApp harus berupa nomor Indonesia yang valid.");
    if (email && !validEmail(email)) throw new BookingError("Email Customer Service tidak valid.");
    const validHttpsUrl = (input: string) => {
      try { const url = new URL(input); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
    };
    if (!validHttpsUrl(website)) throw new BookingError("Website harus menggunakan URL HTTPS yang valid.");
    if (instagram && (!validHttpsUrl(instagram) || new URL(instagram).hostname.toLowerCase() !== "instagram.com" && !new URL(instagram).hostname.toLowerCase().endsWith(".instagram.com"))) {
      throw new BookingError("Instagram harus berupa tautan HTTPS Instagram resmi.");
    }
    for (const [label, link, hosts] of [["TikTok", tiktok, ["tiktok.com"]], ["YouTube", youtube, ["youtube.com", "youtu.be"]]] as const) {
      const host = link ? new URL(link).hostname.toLowerCase() : "";
      if (link && (!validHttpsUrl(link) || !hosts.some((allowed) => host === allowed || host.endsWith("." + allowed)))) {
        throw new BookingError(`${label} harus berupa tautan HTTPS resmi.`);
      }
    }
    const admin = bookingAdmin();
    const { data, error } = await admin.from("shiap_business_contact_settings").upsert({ id: true, contact_name: contactName, whatsapp,
      email: email || null, website, instagram: instagram || null, tiktok: tiktok || null, youtube: youtube || null, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "id" })
      .select("contact_name,whatsapp,email,website,instagram,tiktok,youtube").single();
    if (error || !data) throw new BookingError("Pengaturan kontak belum dapat disimpan.", 503);
    return Response.json({ settings: data, ready: Boolean(data.whatsapp && data.email) }, { headers: privateHeaders });
  } catch (error) { return routeError(error); }
}
