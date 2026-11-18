import { createClient } from "@/lib/supabase/server";
import BookingListClient from "@/components/admin/booking-list-client";

export const dynamic = "force-dynamic";

export default async function AdminBookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const search = value("search");
  const supabase = await createClient();
  const { error: holdError } = await supabase.rpc("expire_booking_holds");
  if (holdError) {
    return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Pemeriksaan masa reservasi gagal: {holdError.message}</p>;
  }
  const { data, error } = await supabase
    .from("booking_orders")
    .select("id,order_number,customer_name,customer_whatsapp,customer_email,order_status,payment_status,total_amount,created_at,inventory_hold_expires_at,booking_payment_records(status,review_due_at),booking_items(id,service_type,service_category,service_name,date_start,date_end,guests,quantity)")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div>
        <p className="text-[10px] font-bold tracking-[0.2em] text-[#1974FF]">OPERATIONS / BOOKINGS</p>
        <h1 className="mt-2 text-2xl font-extrabold text-[#0A2E63]">Booking Center</h1>
        <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Data booking gagal dimuat: {error.message}</p>
      </div>
    );
  }

  return <BookingListClient bookings={(data ?? []).map((order) => ({ ...order, reviewOverdue: order.booking_payment_records.some((proof) => proof.status === "pending" && new Date(proof.review_due_at).getTime() <= Date.now()) }))} initialSearch={search} initialStatus={value("status") || "all"} initialPayment={value("payment") || "all"} initialService={value("service") || "all"} initialSchedule={value("schedule") || "all"} />;
}
