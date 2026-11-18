"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import type { ProofRecord } from "@/lib/booking-view";

export default function PaymentProofUpload({ bookingId, records, eligible, onSubmitted }: {
  bookingId: string; records: ProofRecord[]; eligible: boolean; onSubmitted: () => Promise<void>;
}) {
  const lock = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    if (lock.current) return;
    setError("");
    if (!file.size || file.size > 8 * 1024 * 1024) { setError("Ukuran bukti maksimal 8 MB."); return; }
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) { setError("Pilih JPEG, PNG, WebP, atau PDF."); return; }
    lock.current = true;
    setUploading(true);
    try {
      const response = await fetch("/api/bookings/" + bookingId + "/proof", {
        method: "PUT", headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) }, body: file,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Bukti belum dapat dikirim.");
      await onSubmitted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Bukti belum dapat dikirim. Muat ulang status sebelum mencoba lagi.");
    } finally { lock.current = false; setUploading(false); }
  }

  return <section className="border-t border-slate-200 pt-3" aria-labelledby="proof-title">
    <h3 id="proof-title" className="text-sm font-bold text-[#0A2E63]">Bukti pembayaran</h3>
    {eligible && <label className={"mt-2 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#1265D8] px-3 text-sm font-bold text-white focus-within:outline-2 focus-within:outline-offset-2 " + (uploading ? "pointer-events-none opacity-60" : "")}>
      <FileUp aria-hidden size={17} />{uploading ? "Mengunggah…" : "Unggah bukti transfer"}
      <input type="file" disabled={uploading} accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(event) => {
        const file = event.target.files?.[0];
        event.currentTarget.value = "";
        if (file) void upload(file);
      }} />
    </label>}
    {eligible && <p className="mt-1 text-xs text-slate-600">JPEG, PNG, WebP, atau PDF · maksimal 8 MB</p>}
    {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>}
    <ul className="mt-1 divide-y divide-slate-100">
      {records.map((record) => <li key={record.id} className="py-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <a href={`/api/bookings/${bookingId}/proof?proof=${record.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all font-semibold text-[#1265D8] underline">{record.original_file_name}</a>
          <span className="font-semibold text-[#0A2E63]">{record.status === "approved" ? "Terverifikasi" : record.status === "rejected" ? "Perlu Tindakan" : "Menunggu Verifikasi"}</span>
        </div>
        {record.rejection_reason && <p className="mt-1 text-xs text-red-800">{record.rejection_reason}</p>}
        <p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" }).format(new Date(record.submitted_at))} WITA</p>
      </li>)}
    </ul>
  </section>;
}
