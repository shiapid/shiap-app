import { requireAdmin } from "@/lib/admin/guard";
import { bookingAdmin } from "@/lib/supabase/booking-admin";
import BookingListClient from "@/components/admin/booking-list-client";

export const dynamic = "force-dynamic";

export default async function AdminBookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const search = value("search");
  const requestedScope = value("scope");
  const scope = (["active", "archived", "trash"].includes(requestedScope) ? requestedScope : "active") as "active" | "archived" | "trash";
  const supabase = bookingAdmin();
  const { error: holdError } = await supabase.rpc("expire_booking_holds");
  if (holdError) {
    return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Pemeriksaan masa reservasi gagal: {holdError.message}</p>;
  }

  const [orders, states] = await Promise.all([
    supabase.from("booking_orders")
      .select("id,order_number,customer_name,customer_whatsapp,customer_email,order_status,payment_status,total_amount,created_at,inventory_hold_expires_at,booking_payment_records(status,review_due_at),booking_items(id,service_type,service_category,service_name,date_start,date_end,guests,quantity)")
      .order("created_at", { ascending: false }),
    supabase.from("booking_admin_record_state").select("*"),
  ]);
  if (orders.error || states.error) {
    return <div><p className="text-[10px] font-bold tracking-[0.2em] text-[#1974FF]">OPERATIONS / BOOKINGS</p><h1 className="mt-2 text-2xl font-extrabold text-[#0A2E63]">Booking Center</h1><p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Data booking gagal dimuat: {(orders.error || states.error)?.message}</p></div>;
  }

  const stateByBooking = new Map((states.data ?? []).map((state) => [state.booking_id, state]));
  const allRows = (orders.data ?? []).map((order) => ({ ...order, ...(stateByBooking.get(order.id) ?? {}) }));
  const scopeCounts = {
    active: allRows.filter((order) => !order.deleted_at && !order.archived_at).length,
    archived: allRows.filter((order) => !order.deleted_at && Boolean(order.archived_at)).length,
    trash: allRows.filter((order) => Boolean(order.deleted_at)).length,
  };
  const data = allRows.filter((order) => scope === "active"
    ? !order.archived_at && !order.deleted_at
    : scope === "archived" ? Boolean(order.archived_at) && !order.deleted_at : Boolean(order.deleted_at));
  const timestamp = (order: (typeof data)[number]) => scope === "active" ? order.created_at : scope === "archived" ? order.archived_at : order.deleted_at;
  data.sort((a, b) => new Date(timestamp(b) || 0).getTime() - new Date(timestamp(a) || 0).getTime());

  const actorIds = [...new Set(data.flatMap((order) => [order.archived_by, order.deleted_by, order.restored_by].filter((id): id is string => Boolean(id))))];
  const { data: profiles } = actorIds.length
    ? await supabase.from("profiles").select("id,full_name").in("id", actorIds)
    : { data: [] };
  const actorNames = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name || profile.id.slice(0, 8)]));

  return <BookingListClient
    bookings={data.map((order) => ({
      ...order,
      archived_by_name: order.archived_by ? actorNames.get(order.archived_by) ?? null : null,
      deleted_by_name: order.deleted_by ? actorNames.get(order.deleted_by) ?? null : null,
      restored_by_name: order.restored_by ? actorNames.get(order.restored_by) ?? null : null,
      reviewOverdue: order.booking_payment_records.some((proof: { status: string; review_due_at: string }) => proof.status === "pending" && new Date(proof.review_due_at).getTime() <= Date.now()),
      hasPendingProof: order.booking_payment_records.some((proof: { status: string }) => proof.status === "pending"),
    }))}
    scope={scope}
    scopeCounts={scopeCounts}
    initialSearch={search}
    initialStatus={value("status") || "all"}
    initialPayment={value("payment") || "all"}
    initialService={value("service") || "all"}
    initialSchedule={value("schedule") || "all"}
  />;
}
