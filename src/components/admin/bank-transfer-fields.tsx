"use client";

import { createClient } from "@/lib/supabase/client";

const uploadAttempts = new WeakMap<HTMLFormElement, { key: string; id: string; uploaded: boolean }>();
const field = "mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm";

export function BankTransferFields() {
  return (
    <fieldset className="grid min-w-0 gap-3 text-xs sm:grid-cols-2">
      <legend className="mb-2 font-bold text-[#0A2E63]">Mutasi rekening resmi SHIAP</legend>
      <label>
        ID transaksi dari bank
        <input name="bankSourceId" maxLength={160} className={field} autoComplete="off" />
        <span className="mt-1 block text-slate-600">Kosongkan jika bank tidak memiliki ID yang andal. Kasus masuk rekonsiliasi tanpa pelunasan.</span>
      </label>
      <label>
        Referensi yang tampil di mutasi (opsional)
        <input name="bankReference" maxLength={160} className={field} autoComplete="off" />
      </label>
      <label>
        Waktu transaksi bank (WITA)
        <input name="bankOccurredAt" type="datetime-local" step="1" className={field} />
      </label>
      <label>
        Bukti mutasi bank (PDF, PNG, atau JPG, maks. 5 MB)
        <input name="bankEvidence" type="file" accept="application/pdf,image/png,image/jpeg" className="mt-1 block w-full text-xs" />
      </label>
      <label className="flex items-start gap-2 sm:col-span-2">
        <input name="bankConfirmed" type="checkbox" />
        Saya sudah mencocokkan data dengan catatan bank resmi pada rekening penerima SHIAP.
      </label>
    </fieldset>
  );
}

export async function verifyBankTransfer(form: HTMLFormElement, {
  kind, target, proof = null, amount, note,
}: { kind: "booking" | "invoice"; target: string; proof?: string | null; amount: number; note: string }) {
  const values = new FormData(form);
  const file = values.get("bankEvidence");
  const sourceId = String(values.get("bankSourceId") || "").trim();
  const reference = String(values.get("bankReference") || "").trim();
  const time = String(values.get("bankOccurredAt") || "");
  const occurredAt = new Date(time + "+08:00");
  if (!(file instanceof File) || file.size < 1 || file.size > 5 * 1024 * 1024 ||
    !["application/pdf", "image/png", "image/jpeg"].includes(file.type) || !values.get("bankConfirmed")) {
    throw new Error("Unggah bukti mutasi bank resmi dan konfirmasi pemeriksaan dana.");
  }
  if (!Number.isSafeInteger(amount) || amount < 1 || !Number.isFinite(occurredAt.getTime()) ||
    occurredAt.getTime() > Date.now() || (sourceId && sourceId.length < 3)) {
    throw new Error("Periksa nominal bulat, ID transaksi, dan waktu pada mutasi resmi.");
  }
  if ((!sourceId || kind === "invoice") && note.trim().length < 10) {
    throw new Error("Isi catatan pemeriksaan atau alasan rekonsiliasi, minimal 10 karakter.");
  }

  const client = createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error("Sesi Admin berakhir. Masuk kembali untuk memverifikasi transfer.");
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const fileHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const key = JSON.stringify([user.id, kind, target, proof, amount, sourceId, reference, time, note, fileHash]);
  let attempt = uploadAttempts.get(form);
  if (attempt?.key !== key) {
    attempt = { key, id: crypto.randomUUID(), uploaded: false };
    uploadAttempts.set(form, attempt);
  }
  const requestId = attempt.id;
  const path = user.id + "/" + requestId;
  if (!attempt.uploaded) {
    const { error } = await client.storage.from("finance-bank-evidence").upload(path, file);
    if (error) {
      const { error: lookupError } = await client.storage.from("finance-bank-evidence").info(path);
      if (lookupError) throw new Error("Bukti mutasi bank belum tersimpan. Coba unggah kembali.");
    }
    attempt.uploaded = true;
  }

  const { data, error } = await client.rpc("finance_verify_bank_transfer", {
    p_kind: kind, p_target: target, p_proof: proof, p_amount: amount, p_source_id: sourceId || null,
    p_reference: reference || null, p_occurred_at: occurredAt.toISOString(), p_evidence: path,
    p_note: note.trim() || null, p_request: requestId,
  });
  if (error) throw new Error(error.code === "23505" ? "Booking atau invoice sudah memiliki alokasi mutasi bank." : error.message);
  return data?.status === "NEEDS_RECONCILIATION"
    ? "Kasus dicatat untuk rekonsiliasi Finance. Status pembayaran belum berubah."
    : "Transfer penuh terverifikasi dan tercatat di Finance.";
}
