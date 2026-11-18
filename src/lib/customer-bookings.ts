import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { bookingAdmin } from "@/lib/supabase/booking-admin";

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cookieName = process.env.NEXT_PUBLIC_SHIAP_ENVIRONMENT === "ci" || process.env.NODE_ENV !== "production"
  ? "shiap_booking_dev" : "__Host-shiap_booking";
export const hashSecret = (value: string) => createHash("sha256").update(value).digest("hex");
export const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export class BookingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") || new URL(request.url).host;
  let valid = false;
  try {
    const parsed = new URL(origin || "");
    valid = parsed.host === host && ["http:", "https:"].includes(parsed.protocol)
      && (!cookieName.startsWith("__Host-") || parsed.protocol === "https:");
  } catch {}
  if (!valid || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new BookingError("Permintaan ditolak.", 403);
  }
}

export async function rateLimit(action: string, identity: string, limit: number, seconds: number) {
  const admin = bookingAdmin();
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!;
  const key = action + ":" + createHmac("sha256", secret).update(identity).digest("hex");
  const { data, error } = await admin.rpc("booking_rate_limit", { p_key: key, p_limit: limit, p_seconds: seconds });
  if (error) throw new BookingError("Layanan pesanan belum tersedia.", 503);
  if (!data) throw new BookingError("Terlalu banyak permintaan. Silakan coba lagi nanti.", 429);
}

export async function clientAddress() {
  const values = await headers();
  return values.get("x-real-ip") || values.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function bookingContext() {
  const admin = bookingAdmin();
  const client = await createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError && authError.name !== "AuthSessionMissingError") throw new BookingError("Sesi akun belum dapat diverifikasi. Coba lagi.", 503);
  const secret = (await cookies()).get(cookieName)?.value;
  const hash = secret && /^[a-f0-9]{64}$/.test(secret) ? hashSecret(secret) : null;
  let guest: string | null = null;
  if (hash) {
    const { data, error } = await admin.from("booking_guest_sessions").select("id")
      .eq("secret_hash", hash).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (error) throw new BookingError("Layanan akses pesanan belum tersedia.", 503);
    guest = data?.id ?? null;
  }
  return { admin, user, guest, hash: guest ? hash : null };
}

export async function prepareGuestSession() {
  const context = await bookingContext();
  if (context.user || context.guest) return;
  await rateLimit("guest-session", await clientAddress(), 12, 3600);
  const secret = randomBytes(32).toString("hex");
  const { error } = await context.admin.from("booking_guest_sessions").insert({ secret_hash: hashSecret(secret) });
  if (error) throw new BookingError("Sesi tamu belum dapat dibuat.", 503);
  (await cookies()).set(cookieName, secret, {
    httpOnly: true, secure: cookieName.startsWith("__Host-"), sameSite: "lax", path: "/", maxAge: 30 * 24 * 3600,
  });
}

export async function revokeGuestSession() {
  const context = await bookingContext();
  if (context.guest) {
    const { error } = await context.admin.from("booking_guest_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", context.guest);
    if (error) throw new BookingError("Akses belum dapat dicabut.", 503);
  }
  (await cookies()).delete(cookieName);
}

export type BookingContext = Awaited<ReturnType<typeof bookingContext>>;

export function ownerFilter(context: BookingContext) {
  const filters = [];
  if (context.user) filters.push("user_id.eq." + context.user.id);
  if (context.guest) filters.push("and(user_id.is.null,guest_session_id.eq." + context.guest + ")");
  return filters.join(",");
}

export const orderFields = "id,order_number,user_id,guest_session_id,customer_name,customer_whatsapp,customer_email,customer_notes,order_status,payment_status,payment_enabled,total_amount,package_subtotal,service_fee_total,service_fee_snapshot,created_at,inventory_hold_expires_at,booking_items(id,service_type,service_category,service_name,variant,date_start,date_end,guests,quantity,unit_price,price_basis,selected_addons,notes)";

export async function ownedBooking(id: string, suppliedContext?: BookingContext) {
  const context = suppliedContext ?? await bookingContext();
  if (!uuidPattern.test(id) || !ownerFilter(context)) throw new BookingError("Pesanan tidak ditemukan atau akses telah berakhir.", 404);
  // Authorization precedes hold maintenance and any payment data retrieval.
  const { data, error } = await context.admin.from("booking_orders").select(orderFields).eq("id", id).or(ownerFilter(context)).maybeSingle();
  if (error) throw new BookingError("Pesanan belum dapat dimuat.", 503);
  if (!data) throw new BookingError("Pesanan tidak ditemukan atau akses telah berakhir.", 404);
  return { context, order: data };
}

export async function refreshOrder(id: string, context: BookingContext) {
  const { error } = await context.admin.rpc("expire_booking_holds");
  if (error) throw new BookingError("Status pesanan belum dapat dimuat.", 503);
  return ownedBooking(id, context);
}

export function routeError(error: unknown) {
  const known = error instanceof BookingError;
  return Response.json({ error: known ? error.message : "Layanan pesanan belum tersedia. Silakan coba lagi." },
    { status: known ? error.status : 503, headers: privateHeaders });
}

export async function boundedBody(request: Request, maximum: number) {
  if (Number(request.headers.get("content-length")) > maximum) throw new BookingError("Ukuran permintaan terlalu besar.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new BookingError("Permintaan kosong.");
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks);
      length += value.length;
      if (length > maximum) {
        await reader.cancel();
        throw new BookingError("Ukuran permintaan terlalu besar.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
}
