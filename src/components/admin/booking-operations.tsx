"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Check, ExternalLink, LoaderCircle, ShieldCheck, X, Pencil, Trash2, CircleDollarSign } from "lucide-react";
import { canRemoveBookingFromList } from "@/lib/admin/booking-eligibility";

type Payment = {
  id: string;
  storage_path: string;
  original_file_name: string;
  status: string;
  rejection_reason: string | null;
  submitted_at: string;
  review_due_at: string;
};

type EventRow = {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  created_at: string;
};

export default function BookingOperations({
  bookingId,
  orderStatus,
  paymentStatus,
  totalAmount,
  customerName,
  customerWhatsapp,
  customerEmail,
  customerNotes,
}: {
  bookingId: string;
  orderStatus: string;
  paymentStatus: string;
  totalAmount: number;
  customerName: string;
  customerWhatsapp: string;
  customerEmail: string;
  customerNotes: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [checkedAt, setCheckedAt] = useState(0);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [receivedAmount, setReceivedAmount] = useState(String(totalAmount));
  const [bankReference, setBankReference] = useState("");
  const [note, setNote] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [editName, setEditName] = useState(customerName);
  const [editWhatsapp, setEditWhatsapp] = useState(customerWhatsapp);
  const [editEmail, setEditEmail] = useState(customerEmail);
  const [editNotes, setEditNotes] = useState(customerNotes);

  async function refresh() {
    const [paymentResult, eventResult] = await Promise.all([
      supabase.from("booking_payment_records")
        .select("id,storage_path,original_file_name,status,rejection_reason,submitted_at,review_due_at")
        .eq("booking_id", bookingId).order("submitted_at", { ascending: false }),
      supabase.from("booking_order_events")
        .select("id,event_type,from_status,to_status,note,created_at")
        .eq("booking_id", bookingId).order("created_at", { ascending: false }),
    ]);
    setCheckedAt(Date.now());
    if (paymentResult.error) setError(paymentResult.error.message);
    else {
      const list = (paymentResult.data ?? []) as Payment[];
      setPayments(list);
      const nextUrls: Record<string, string> = {};
      for (const item of list) {
        const { data } = await supabase.storage.from("booking-payment-proofs")
          .createSignedUrl(item.storage_path, 300);
        if (data?.signedUrl) nextUrls[item.id] = data.signedUrl;
      }
      setUrls(nextUrls);
    }
    if (eventResult.error) setError(eventResult.error.message);
    else setEvents((eventResult.data ?? []) as EventRow[]);
  }

  useEffect(() => {
    // The state updates happen only after the Supabase requests resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // Booking ID is stable for this page instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  async function review(paymentId: string, decision: "approved" | "rejected") {
    if (decision === "rejected" && reason.trim().length < 3) {
      setError("Isi alasan penolakan minimal 3 karakter.");
      return;
    }
    if (decision === "approved" && (Number(receivedAmount) !== totalAmount || bankReference.trim().length < 3)) {
      setError("Isi nominal transfer tepat sama dengan total tagihan dan referensi mutasi bank sebelum menyetujui.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    const { error: rpcError } = await supabase.rpc("admin_review_booking_payment_full_amount", {
      p_payment_record_id: paymentId,
      p_decision: decision,
      p_received_amount: decision === "approved" ? Number(receivedAmount) : null,
      p_bank_reference: decision === "approved" ? bankReference.trim() : null,
      p_rejection_reason: decision === "rejected" ? reason.trim() : null,
    });
    if (rpcError) setError(rpcError.message);
    else { setNotice(decision === "approved" ? "Transfer penuh terverifikasi dan tercatat di Finance." : "Bukti pembayaran ditolak."); setReason(""); setBankReference(""); await refresh(); }
    setBusy(false);
  }

  async function changeStatus(nextStatus: string) {
    setBusy(true); setError(""); setNotice("");
    const { error: rpcError } = await supabase.rpc("admin_update_booking_status", {
      p_booking_id: bookingId,
      p_new_status: nextStatus,
      p_note: note.trim() || null,
    });
    if (rpcError) setError(rpcError.message);
    else { setNotice("Status booking berhasil diperbarui."); setNote(""); window.location.reload(); }
    setBusy(false);
  }

  async function saveBookingDetails() {
    setBusy(true); setError(""); setNotice("");
    const { error: updateError } = await supabase.rpc("admin_update_booking_customer", {
      p_booking_id: bookingId, p_name: editName.trim(), p_whatsapp: editWhatsapp.trim(), p_email: editEmail.trim() || null, p_notes: editNotes.trim() || null,
    });
    if (updateError) setError(updateError.message);
    else { setNotice("Data pemesan berhasil diperbarui."); setShowEditor(false); router.refresh(); }
    setBusy(false);
  }

  async function markPaymentReceived() {
    if (Number(receivedAmount) !== totalAmount || bankReference.trim().length < 3) {
      setError("Isi nominal transfer tepat sama dengan total tagihan dan referensi mutasi bank.");
      return;
    }
    if (!window.confirm(`Pastikan mutasi bank sudah diverifikasi. Catat pelunasan penuh ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 2 }).format(totalAmount)}?`)) return;
    setBusy(true); setError(""); setNotice("");
    const { error: rpcError } = await supabase.rpc("admin_mark_booking_paid_full_amount", {
      p_booking_id: bookingId, p_received_amount: Number(receivedAmount), p_bank_reference: bankReference.trim(), p_note: note.trim() || null,
    });
    if (rpcError) setError(rpcError.message);
    else { setNotice("Transfer penuh terverifikasi dan tercatat di Finance."); setNote(""); setBankReference(""); router.refresh(); await refresh(); }
    setBusy(false);
  }

  async function deleteBooking() {
    const reason = window.prompt("Alasan mengeluarkan booking final dari daftar aktif (minimal 3 karakter):")?.trim() || "";
    if (reason.length < 3) return;
    if (!window.confirm("Hapus booking ini dari daftar aktif? Data transaksi tidak akan dihapus dari database dan masih dapat dipulihkan.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/bookings/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking_ids: [bookingId], action: "remove", scope: "active", reason }) });
      const result = await response.json();
      const row = result.results?.[0];
      if (!response.ok || row?.result !== "success") throw new Error(row?.message || result.error || "Booking tidak dapat dikeluarkan dari daftar.");
      router.push("/admin/bookings"); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Tindakan gagal."); }
    finally { setBusy(false); }
  }

  const removable = canRemoveBookingFromList({ order_status: orderStatus, payment_status: paymentStatus, hasPendingProof: payments.some((payment) => payment.status === "pending") });

  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-[#1974FF]" size={19} />
          <h2 className="font-bold text-[#0A2E63]">Operasional booking</h2>
        </div>
        <p className="mt-2 text-xs text-slate-500">Tindakan dicatat dalam riwayat aktivitas. Perubahan status mengikuti aturan transisi sistem.</p>
        <label className="mt-4 block text-xs font-semibold text-slate-600">
          Catatan perubahan (opsional)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-[#1974FF]" placeholder="Catatan internal..." />
        </label>
        {paymentStatus !== "paid" && <div className="mt-3 grid gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-700">Nominal transfer terverifikasi
            <input type="number" min="0.01" step="0.01" value={receivedAmount} onChange={(event) => setReceivedAmount(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" />
            <span className="mt-1 block text-[10px] font-medium text-slate-500">Harus sama persis dengan tagihan penuh {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 2 }).format(totalAmount)}.</span>
          </label>
          <label className="text-xs font-semibold text-slate-700">Referensi mutasi rekening
            <input value={bankReference} onChange={(event) => setBankReference(event.target.value)} maxLength={160} placeholder="Nomor referensi / ID mutasi bank" className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" />
          </label>
        </div>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => setShowEditor((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-[#0A2E63]"><Pencil size={14}/> Edit data booking</button>
          {paymentStatus === "unpaid" && ["pending_confirmation", "confirmed"].includes(orderStatus) && <button disabled={busy} onClick={() => void markPaymentReceived()} className="inline-flex items-center gap-2 rounded-xl bg-green-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"><CircleDollarSign size={15}/> Verifikasi transfer penuh tanpa bukti</button>}
          {removable && <button disabled={busy} onClick={() => void deleteBooking()} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-xs font-bold text-red-700 disabled:opacity-50"><Trash2 size={14}/> Hapus dari Daftar</button>}
          {orderStatus === "pending_confirmation" && <>
            {paymentStatus === "paid" && <button disabled={busy} onClick={() => void changeStatus("confirmed")} className="rounded-xl bg-green-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">Konfirmasi booking lunas</button>}
            <button disabled={busy} onClick={() => void changeStatus("rejected")} className="rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">Tolak booking</button>
            <button disabled={busy} onClick={() => void changeStatus("cancelled")} className="rounded-xl bg-slate-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">Batalkan</button>
          </>}
          {orderStatus === "confirmed" && <>
            <button disabled={busy || paymentStatus !== "paid"} onClick={() => void changeStatus("completed")} className="rounded-xl bg-[#1974FF] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">Tandai selesai</button>
            <button disabled={busy} onClick={() => void changeStatus("cancelled")} className="rounded-xl bg-slate-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">Batalkan</button>
          </>}
        </div>
        {showEditor && <div className="mt-4 grid gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Nama pemesan<input value={editName} onChange={(event) => setEditName(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"/></label><label className="text-xs font-semibold text-slate-600">WhatsApp<input value={editWhatsapp} onChange={(event) => setEditWhatsapp(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"/></label><label className="text-xs font-semibold text-slate-600">Email<input type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"/></label><label className="text-xs font-semibold text-slate-600">Catatan<textarea rows={2} value={editNotes} onChange={(event) => setEditNotes(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"/></label><div className="flex gap-2 sm:col-span-2"><button disabled={busy} onClick={() => void saveBookingDetails()} className="rounded-lg bg-[#1974FF] px-4 py-2 text-xs font-bold text-white">Simpan perubahan</button><button onClick={() => setShowEditor(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">Batal</button></div></div>}
        {paymentStatus !== "paid" && <p className="mt-2 text-[11px] text-slate-500">Periksa mutasi rekening dan pastikan dana masuk 100% sesuai total tagihan. Pembayaran di luar transfer bank tidak digunakan.</p>}
        {orderStatus === "confirmed" && paymentStatus !== "paid" && <p className="mt-2 text-[11px] text-orange-700">Penyelesaian booking hanya tersedia setelah pembayaran diverifikasi.</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-[#0A2E63]">Verifikasi pembayaran</h2>
        <p className="mt-1 text-xs text-slate-500">Bukti disimpan privat. Cocokkan dana masuk 100% pada mutasi rekening sebelum menyetujui. Tautan pratinjau berlaku selama 5 menit.</p>
        {payments.length === 0 ? <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Belum ada bukti pembayaran.</p> : (
          <div className="mt-4 space-y-3">
            {payments.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-100 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="break-all text-xs font-bold text-[#0A2E63]">{item.original_file_name}</p>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${item.status === "approved" ? "bg-green-100 text-green-800" : item.status === "rejected" ? "bg-red-100 text-red-800" : "bg-orange-100 text-orange-800"}`}>
                    {item.status === "approved" ? "Disetujui" : item.status === "rejected" ? "Ditolak" : "Menunggu"}
                  </span>
                </div>
                {urls[item.id] && <a href={urls[item.id]} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-[#1974FF]"><ExternalLink size={14}/> Buka bukti pembayaran</a>}
                {item.status === "pending" && new Date(item.review_due_at).getTime() < checkedAt && <p className="mt-2 rounded-lg bg-orange-50 p-2 text-xs font-bold text-orange-900">Pemeriksaan melewati batas tindak lanjut. Verifikasi mutasi bank dan putuskan status reservasi.</p>}
                {item.rejection_reason && <p className="mt-2 text-xs text-red-700">Alasan: {item.rejection_reason}</p>}
                {item.status === "pending" && <>
                  <label className="mt-3 block text-xs font-semibold text-slate-600">Alasan penolakan (isi jika menolak)
                    <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-[#1974FF]" placeholder="Contoh: nominal tidak sesuai atau bukti tidak terbaca." />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button disabled={busy} onClick={() => void review(item.id, "approved")} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"><Check size={14}/> Setujui</button>
                    <button disabled={busy} onClick={() => void review(item.id, "rejected")} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"><X size={14}/> Tolak bukti</button>
                  </div>
                </>}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-[#0A2E63]">Riwayat aktivitas</h2>
        {events.length === 0 ? <p className="mt-3 text-xs text-slate-500">Belum ada aktivitas yang tercatat setelah V2 dipasang.</p> : (
          <div className="mt-4 space-y-3">
            {events.map((event) => (
              <div key={event.id} className="border-l-2 border-[#1974FF] pl-3">
                <p className="text-xs font-bold text-[#0A2E63]">{event.event_type.replaceAll("_", " ")}</p>
                {event.from_status && <p className="mt-1 text-[11px] text-slate-500">{event.from_status} → {event.to_status}</p>}
                {event.note && <p className="mt-1 text-xs text-slate-600">{event.note}</p>}
                <p className="mt-1 text-[10px] text-slate-400">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" }).format(new Date(event.created_at))} WITA</p>
              </div>
            ))}
          </div>
        )}
      </section>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-green-50 p-3 text-xs text-green-700">{notice}</p>}
      {busy && <p className="flex items-center gap-2 text-xs text-slate-500"><LoaderCircle size={14} className="animate-spin"/> Memproses...</p>}
    </div>
  );
}
