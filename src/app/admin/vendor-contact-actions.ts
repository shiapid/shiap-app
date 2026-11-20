"use server";

import { requireAdmin } from "@/lib/admin/guard";
import { vendorProductColumns, parseVendorContact, type VendorProductColumn } from "@/lib/admin/vendor-contact";
import { createClient } from "@/lib/supabase/server";

function validTarget(column: VendorProductColumn, id: string) {
  return vendorProductColumns.includes(column) &&
    typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function loadVendorContact(column: VendorProductColumn, id: string) {
  await requireAdmin();
  if (!validTarget(column, id)) return { error: true, data: null };
  const client = await createClient();
  const { data, error } = await client.from("internal_vendor_contacts")
    .select("name,whatsapp,notes").eq(column, id).maybeSingle();
  return { error: Boolean(error), data };
}

export async function saveVendorContact(column: VendorProductColumn, id: string, form: FormData) {
  await requireAdmin();
  const contact = parseVendorContact(form);
  if (!validTarget(column, id) || !contact) {
    return { error: "Periksa nama, nomor WhatsApp Indonesia, dan panjang catatan.", data: null };
  }
  const client = await createClient();
  const { data, error } = await client.from("internal_vendor_contacts")
    .upsert({ [column]: id, ...contact }, { onConflict: column })
    .select("name,whatsapp,notes").single();
  return { error: error ? "Kontak vendor gagal disimpan. Coba lagi." : null, data };
}
