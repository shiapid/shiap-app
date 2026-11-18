import { createClient } from "@/lib/supabase/server";
import CustomersListClient, { type CustomerBookingRow } from "@/components/admin/customers-list-client";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage() {
  const supabase = await createClient();
  const [{ data, error }, { data: contacts, error: contactsError }] = await Promise.all([
    supabase.from("booking_orders")
    .select("id,user_id,customer_name,customer_whatsapp,customer_email,order_status,payment_status,total_amount,created_at")
    .order("created_at", { ascending: false }),
    supabase.from("admin_customer_contacts").select("id,full_name,whatsapp,email,notes,created_at,updated_at").order("created_at", { ascending: false }),
  ]);

  return <CustomersListClient bookings={(data ?? []) as CustomerBookingRow[]} contacts={contacts ?? []} error={[error?.message, contactsError?.message].filter(Boolean).join(" · ") || null}/>;
}
