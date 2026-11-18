"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guard";

const serviceTypes = ["trip", "stay", "rental", "activity", "documentation", "other"] as const;
const costBases = ["fixed_per_booking", "per_participant", "per_night", "per_hour", "per_day", "per_unit", "percentage"] as const;
const expenseStatuses = ["approved", "rejected", "void", "pending"] as const;

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function validAmount(value: string) {
  return /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;
}

function notice(kind: "success" | "error", code: string): never {
  redirect(`/admin/finance?${kind}=${encodeURIComponent(code)}`);
}

function refreshFinance() {
  revalidatePath("/admin/finance");
}

export async function createCostTemplate(form: FormData) {
  const user = await requireAdmin();
  const name = field(form, "name");
  const serviceType = field(form, "serviceType");
  const basis = field(form, "basis");
  const amount = field(form, "amount");
  const productId = field(form, "productId");
  if (name.length < 2 || name.length > 120 || !serviceTypes.includes(serviceType as (typeof serviceTypes)[number]) ||
    !costBases.includes(basis as (typeof costBases)[number]) || !validAmount(amount) ||
    (basis === "percentage" && Number(amount) > 100) || (productId && !/^[0-9a-f-]{36}$/i.test(productId))) notice("error", "template-invalid");

  const supabase = await createClient();
  const { error } = await supabase.from("finance_cost_templates").insert({
    name, service_type: serviceType, cost_basis: basis, amount, product_id: productId || null,
    notes: field(form, "notes") || null, created_by: user.id,
  });
  if (error) notice("error", "template-save");
  refreshFinance();
  notice("success", "template-saved");
}

export async function updateCostTemplate(form: FormData) {
  await requireAdmin();
  const id = field(form, "id");
  const name = field(form, "name");
  const amount = field(form, "amount");
  const notes = field(form, "notes");
  if (!/^[0-9a-f-]{36}$/i.test(id) || name.length < 2 || name.length > 120 || !validAmount(amount)) notice("error", "template-invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("finance_cost_templates").update({ name, amount, notes: notes || null }).eq("id", id);
  if (error) notice("error", "template-save");
  refreshFinance();
  notice("success", "template-updated");
}

export async function toggleCostTemplate(form: FormData) {
  await requireAdmin();
  const id = field(form, "id");
  const isActive = field(form, "isActive") === "true";
  if (!/^[0-9a-f-]{36}$/i.test(id)) notice("error", "template-invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("finance_cost_templates").update({ is_active: !isActive }).eq("id", id);
  if (error) notice("error", "template-save");
  refreshFinance();
  notice("success", "template-updated");
}

function fileMatches(mimeType: string, bytes: Uint8Array) {
  if (mimeType === "application/pdf") return bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-";
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v);
  if (mimeType === "image/webp") return bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
  return false;
}

export async function createExpense(form: FormData) {
  const user = await requireAdmin();
  const amount = field(form, "amount");
  const categoryId = field(form, "categoryId");
  const bookingId = field(form, "bookingId");
  const bookingItemId = field(form, "bookingItemId");
  const serviceType = field(form, "serviceType");
  const description = field(form, "description");
  const date = field(form, "expenseDate");
  if (!validAmount(amount) || !categoryId || description.length < 2 || description.length > 500 ||
    (bookingId && !/^[0-9a-f-]{36}$/i.test(bookingId)) || (bookingItemId && !/^[0-9a-f-]{36}$/i.test(bookingItemId)) ||
    (serviceType && !serviceTypes.includes(serviceType as (typeof serviceTypes)[number])) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) notice("error", "expense-invalid");

  const supabase = await createClient();
  const expenseId = randomUUID();
  const upload = form.get("receipt");
  let receiptPath: string | null = null;
  if (upload instanceof File && upload.size > 0) {
    if (upload.size > 8 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(upload.type)) notice("error", "receipt-invalid");
    const bytes = new Uint8Array(await upload.arrayBuffer());
    if (!fileMatches(upload.type, bytes)) notice("error", "receipt-invalid");
    const safeName = upload.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100) || "receipt";
    receiptPath = `${user.id}/${expenseId}/${safeName}`;
    const { error: uploadError } = await supabase.storage.from("shiap-finance-receipts").upload(receiptPath, new Blob([bytes], { type: upload.type }), { contentType: upload.type, upsert: false });
    if (uploadError) notice("error", "receipt-upload");
  }

  const { error } = await supabase.from("finance_expenses").insert({
    id: expenseId, booking_id: bookingId || null, booking_item_id: bookingItemId || null,
    service_type: serviceType || null, category_id: categoryId, supplier_name: field(form, "supplier") || null,
    description, amount, expense_date: date, receipt_path: receiptPath,
    external_reference: field(form, "reference") || null, created_by: user.id, status: "pending",
  });
  if (error) {
    if (receiptPath) await supabase.storage.from("shiap-finance-receipts").remove([receiptPath]);
    notice("error", "expense-save");
  }
  refreshFinance();
  notice("success", "expense-saved");
}

export async function reviewExpense(form: FormData) {
  const user = await requireAdmin();
  const id = field(form, "id");
  const status = field(form, "status");
  const reason = field(form, "reason");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !expenseStatuses.includes(status as (typeof expenseStatuses)[number]) ||
    (["rejected", "void"].includes(status) && reason.length < 3)) notice("error", "expense-review-invalid");
  const supabase = await createClient();
  const { error } = await supabase.from("finance_expenses").update({
    status, status_note: reason || null, reviewed_by: status === "pending" ? null : user.id,
    reviewed_at: status === "pending" ? null : new Date().toISOString(),
  }).eq("id", id);
  if (error) notice("error", "expense-review");
  refreshFinance();
  notice("success", "expense-reviewed");
}

export async function recordTransaction(form: FormData) {
  await requireAdmin();
  const bookingId = field(form, "bookingId");
  const entryType = field(form, "entryType");
  const amount = field(form, "amount");
  const key = field(form, "idempotencyKey");
  const reference = field(form, "reference");
  if (!/^[0-9a-f-]{36}$/i.test(bookingId) || !["payment", "refund", "processing_fee"].includes(entryType) || !validAmount(amount) || !/^[0-9a-f-]{36}$/i.test(key) || (entryType === "payment" && reference.length < 3)) notice("error", "transaction-invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("finance_record_transaction", {
    p_booking_id: bookingId, p_entry_type: entryType, p_amount: amount,
    p_idempotency_key: `admin:${key}`, p_note: field(form, "note") || null,
    p_external_reference: reference || null,
  });
  if (error) notice("error", "transaction-save");
  refreshFinance();
  notice("success", "transaction-saved");
}

export async function recalculateBookingCosts(form: FormData) {
  await requireAdmin();
  const bookingId = field(form, "bookingId");
  const reason = field(form, "reason");
  if (!/^[0-9a-f-]{36}$/i.test(bookingId) || reason.length < 4) notice("error", "recalculate-invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("finance_recalculate_booking_costs", { p_booking_id: bookingId, p_reason: reason });
  if (error) notice("error", "recalculate-failed");
  refreshFinance();
  notice("success", "recalculated");
}
