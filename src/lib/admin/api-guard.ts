import "server-only";
import { createClient } from "@/lib/supabase/server";
import { BookingError } from "@/lib/customer-bookings";

export async function requireApiAdmin() {
  const client = await createClient();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError) throw new BookingError("Sesi Admin belum dapat diverifikasi.", 401);
  if (!user) throw new BookingError("Login Admin diperlukan.", 401);
  const { data, error } = await client.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (error) throw new BookingError("Otorisasi Admin belum dapat diverifikasi.", 503);
  if (!data) throw new BookingError("Akses Admin diperlukan.", 403);
  return user;
}
