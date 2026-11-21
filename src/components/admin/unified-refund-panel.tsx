"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah } from "@/lib/booking-engine";
import { itemRefundLabels, refundableRupiah, type RefundAllocation, type RefundRequest } from "@/lib/unified-refunds";

const labels = {
  request: "Ajukan refund", cancel_item: "Batalkan layanan", review: "Mulai tinjauan",
  approve: "Setujui nominal", reject: "Tolak permintaan", queue: "Siapkan transfer manual",
  fail: "Catat transfer gagal", pay: "Catat transfer yang sudah berhasil",
  exception_open: "Tandai masalah rekonsiliasi", exception_resolve: "Tutup rekonsiliasi",
} as const;
type Action = keyof typeof labels;

const steps: Record<RefundRequest["status"], Action[]> = {
  REQUESTED: ["review", "reject"], UNDER_REVIEW: ["approve", "reject"],
  APPROVED: ["queue"], PENDING_PAYMENT: ["pay", "fail"],
  PAID: ["exception_open"], FAILED: ["queue", "exception_open"], REJECTED: [],
};

const field = "mt-1 block w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm";
const money = (v: number) => formatRupiah(Number(v));

function RefundActionForm({ item, request, actions }: { item: RefundAllocation; request?: RefundRequest; actions: Action[] }) {
  const router = useRouter();
  const [action, setAction] = useState<Action>(actions[0]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const needsAmount = ["request", "approve", "pay"].includes(action);
  const maximum = action === "request" ? item.remaining_eligible : request?.requested_idr;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const reason = String(values.get("reason") ?? "").trim();
    const amount = needsAmount ? refundableRupiah(values.get("amount")) : null;
    if (reason.length < 10 || (needsAmount && amount === null)) {
      setMessage("Isi alasan dan nominal Rupiah bulat sesuai tindakan.");
      return;
    }
    if (action === "cancel_item" && !window.confirm("Batalkan layanan ini dan lepaskan reservasinya?")) return;
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const input: Record<string, unknown> = { reason, ...(amount === null ? {} : { amount }) };
      let file: File | null = null;
      let hash: string | null = null;
      if (action === "pay") {
        const evidence = values.get("evidence");
        const date = new Date(String(values.get("time") ?? "") + "+08:00");
        const bankId = String(values.get("bankId") ?? "").trim();
        if (!(evidence instanceof File) || !evidence.size || evidence.size > 5 * 1024 * 1024
          || !["application/pdf", "image/png", "image/jpeg"].includes(evidence.type)
          || !Number.isFinite(date.getTime()) || !values.get("confirmed") || bankId.length < 3) {
          throw new Error("Lengkapi bukti bank, waktu, ID transaksi, dan konfirmasi transfer yang sudah berhasil.");
        }
        file = evidence;
        hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await evidence.arrayBuffer())), (b) => b.toString(16).padStart(2, "0")).join("");
        Object.assign(input, { confirmed: true, bank_id: bankId, reference: String(values.get("reference") ?? "").trim(), occurred_at: date.toISOString() });
      }
      const payload = JSON.stringify([action, item.item_id, request?.id, input, hash]);
      if (attempt.current?.payload !== payload) attempt.current = { payload, key: crypto.randomUUID() };
      const key = attempt.current.key;
      if (file) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Masuk kembali sebagai Admin Finance.");
        const path = user.id + "/" + key;
        const storage = supabase.storage.from("finance-bank-evidence");
        const { error } = await storage.upload(path, file);
        if (error && (await storage.info(path)).error) throw new Error("Bukti belum tersimpan. Coba unggah kembali.");
        input.evidence = path;
      }
      const result = await supabase.rpc("admin_manage_unified_refund", {
        p_request: key, p_action: action, p_item: item.item_id, p_refund: request?.id ?? null, p_input: input,
      });
      if (result.error) {
        if (result.error.code === "23505") throw new Error("ID mutasi bank atau bukti sudah dipakai.");
        if (["40001", "55P03", "40P01"].includes(result.error.code)) throw new Error("Inventori sedang diperbarui. Coba tindakan yang sama lagi.");
        throw new Error(result.error.message);
      }
      attempt.current = null;
      form.reset();
      setMessage("Tindakan tercatat di Finance.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tindakan belum tersimpan.");
    } finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-xs">
    <label className="block">Tindakan
      <select className={field} value={action} disabled={busy} onChange={(event) => setAction(event.target.value as Action)}>
        {actions.map((option) => <option value={option} key={option}>{labels[option]}</option>)}
      </select>
    </label>
    {needsAmount && <label className="block">Nominal (Rp)
      <input key={action} name="amount" type="number" min="1" max={maximum} step="1" required className={field}
        defaultValue={action === "pay" ? request?.approved_idr ?? undefined : undefined} readOnly={action === "pay"} />
    </label>}
    {action === "pay" && <fieldset className="grid gap-2 sm:grid-cols-2">
      <label>ID transaksi keluar dari bank<input name="bankId" minLength={3} maxLength={160} required className={field} /></label>
      <label>Referensi mutasi (opsional)<input name="reference" maxLength={160} className={field} /></label>
      <label>Waktu transfer bank (WITA)<input name="time" type="datetime-local" step="1" required className={field} /></label>
      <label>Bukti mutasi resmi (maks. 5 MB)<input name="evidence" type="file" accept="application/pdf,image/png,image/jpeg" required className={field} /></label>
      <label className="flex items-start gap-2 sm:col-span-2"><input name="confirmed" type="checkbox" required />Saya sudah memeriksa dana keluar, penerima, dan nominal pada mutasi resmi bank.</label>
    </fieldset>}
    <label className="block">Alasan atau hasil verifikasi
      <textarea name="reason" minLength={10} maxLength={500} rows={2} required className={field} />
    </label>
    <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-[#1265D8] px-3 font-bold text-white disabled:opacity-50">
      {busy ? "Menyimpan…" : labels[action]}
    </button>
    {message && <p role="status">{message}</p>}
  </form>;
}

export default function UnifiedRefundPanel({ item, requests }: { item: RefundAllocation; requests: RefundRequest[] }) {
  const [evidenceError, setEvidenceError] = useState("");
  async function downloadEvidence(path: string) {
    setEvidenceError("");
    try {
      const { data, error } = await createClient().storage.from("finance-bank-evidence").createSignedUrl(path, 60, { download: true });
      if (error || !data?.signedUrl) throw new Error("Bukti mutasi belum dapat diunduh.");
      window.location.assign(data.signedUrl);
    } catch {
      setEvidenceError("Bukti mutasi belum dapat diunduh.");
    }
  }

  const actions: Action[] = [];
  if (item.payment_status === "paid") {
    if (Number(item.remaining_eligible) > 0) actions.push("request");
    if (!item.cancelled_at && ["pending_confirmation", "confirmed"].includes(item.order_status)) actions.push("cancel_item");
  }
  return <section className="mt-3 min-w-0 rounded-lg border border-blue-100 p-3 text-xs">
    <h4 className="font-bold text-[#0A2E63]">Refund layanan</h4>
    <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {[
        ["Alokasi awal", item.original_amount], ["Biaya layanan", item.service_fee], ["Pajak", item.tax], ["Diskon", item.discount],
        ["Liabilitas disetujui", item.liability], ["Refund dibayar", item.executed], ["Sisa nilai item", item.remaining_value],
        ["Sisa alokasi refund", item.remaining_eligible],
        ...(item.remaining_vendor_share === null ? [] : [["Porsi vendor tersisa", item.remaining_vendor_share], ["Komisi snapshot tersisa", item.remaining_commission ?? 0]]),
      ].map(([label, value]) => <div key={label}><dt className="text-slate-600">{label}</dt><dd className="font-semibold">{money(Number(value))}</dd></div>)}
    </dl>
    {actions.length > 0 && <RefundActionForm key={actions.join(":")} item={item} actions={actions} />}
    {evidenceError && <p role="alert">{evidenceError}</p>}
    {requests.map((request) => {
      const available = request.reconcile_required ? ["exception_resolve" as const] : steps[request.status];
      return <details className="mt-3 rounded-lg border border-slate-200 p-2" key={request.id}>
        <summary className="cursor-pointer font-semibold">{itemRefundLabels[request.status]} · {money(request.requested_idr)}
          {request.reconcile_required && " · Perlu rekonsiliasi"}</summary>
        <p className="mt-2 break-words">{request.reason}</p>
        <p>Disetujui {money(request.approved_idr ?? 0)} · Dibayar {money(request.paid_idr)}</p>
        {request.bank_id && <p className="break-all">ID bank {request.bank_id}</p>}
        {request.evidence_path && <button type="button" className="min-h-11 font-semibold text-[#1265D8]"
          onClick={() => void downloadEvidence(request.evidence_path!)}>Unduh bukti mutasi</button>}
        {request.history.length > 0 && <details className="my-2">
          <summary className="cursor-pointer font-semibold">Riwayat keputusan</summary>
          <ul className="mt-1 divide-y divide-slate-100">{request.history.map((event) =>
            <li key={event.occurred_at + event.action} className="break-words py-2">
              <p>{labels[event.action as Action] ?? event.action} · {new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Makassar" }).format(new Date(event.occurred_at))} WITA</p>
              <p className="text-slate-600">{event.reason}</p>
              <p className="break-all text-slate-600">Admin {event.actor_id}</p>
            </li>)}</ul>
        </details>}
        {available.length > 0 && <RefundActionForm key={available.join(":")} item={item} request={request} actions={available} />}
      </details>;
    })}
  </section>;
}
