import { revalidatePath } from "next/cache";
import { requireApiAdmin } from "@/lib/admin/api-guard";
import { BookingError, boundedBody, privateHeaders, routeError, sameOrigin, uuidPattern } from "@/lib/customer-bookings";
import { bookingAdmin } from "@/lib/supabase/booking-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireApiAdmin();
    let body: Record<string, unknown>;
    try { body = JSON.parse((await boundedBody(request, 16_384)).toString("utf8")); }
    catch { throw new BookingError("Data tindakan booking tidak valid."); }
    const ids = Array.isArray(body.booking_ids) ? [...new Set(body.booking_ids)] : [];
    const action = body.action;
    const scope = body.scope;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!ids.length || ids.length > 100 || ids.some((id) => typeof id !== "string" || !uuidPattern.test(id))
      || !["archive", "remove", "restore"].includes(String(action))
      || !["active", "archived", "trash"].includes(String(scope)) || reason.length < 3 || reason.length > 500) {
      throw new BookingError("Pilih maksimal 100 booking dan isi alasan tindakan minimal 3 karakter.");
    }
    const { data, error } = await bookingAdmin().rpc("admin_manage_booking_records", {
      p_actor: user.id, p_booking_ids: ids, p_action: action, p_scope: scope, p_reason: reason,
    });
    if (error) throw new BookingError("Tindakan booking gagal diproses.", 503);
    const results = (data ?? []) as Array<{ booking_id: string; result: string; message: string }>;
    revalidatePath("/admin/bookings", "page");
    revalidatePath("/admin/bookings/[id]", "page");
    return Response.json({ results, succeeded: results.filter((row) => row.result === "success").length, failed: results.filter((row) => row.result !== "success").length }, { headers: privateHeaders });
  } catch (error) { return routeError(error); }
}
