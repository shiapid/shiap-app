"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { UnifiedItemState } from "@/lib/unified-checkout";

export default function UnifiedItemActions({ item, canComplete }: { item: UnifiedItemState; canComplete: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function submit(complete: boolean) {
    if (busy) return;
    const reason = note.trim();
    if (reason.length < 10) {
      setMessage("Isi catatan minimal 10 karakter.");
      setFailed(true);
      return;
    }
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const supabase = createClient();
      const common = { p_item: item.item_id, p_note: reason };
      const result = complete
        ? await supabase.rpc("admin_complete_unified_service", common)
        : await supabase.rpc("admin_review_unified_service", { ...common, p_open: !item.review_open });
      if (result.error) {
        setMessage(result.error.message);
        setFailed(true);
      } else {
        setMessage("Keputusan layanan tersimpan.");
        setNote("");
        router.refresh();
      }
    } catch {
      setMessage("Keputusan layanan belum tersimpan. Coba lagi.");
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return <details className="mt-2 rounded-lg border border-slate-200 p-2">
    <summary className="cursor-pointer text-xs font-semibold text-[#1265D8]">Tindakan layanan</summary>
    <label className="mt-2 block text-xs text-slate-700">Catatan operasional
      <textarea value={note} maxLength={500} rows={2} onChange={(event) => setNote(event.target.value)}
        className="mt-1 block w-full rounded-lg border border-slate-200 p-2 text-sm" />
    </label>
    <div className="mt-2 flex flex-wrap gap-2">
      {canComplete && item.service !== "stay" && item.fulfillment !== "COMPLETED" && !item.review_open &&
        <button type="button" disabled={busy} onClick={() => void submit(true)}
          className="min-h-11 rounded-lg bg-[#1265D8] px-3 text-xs font-bold text-white">Catat layanan selesai</button>}
      <button type="button" disabled={busy} onClick={() => void submit(false)}
        className="min-h-11 rounded-lg border border-orange-200 px-3 text-xs font-bold text-orange-800">
        {item.review_open ? "Tutup tinjauan Finance" : "Buka tinjauan Finance"}
      </button>
    </div>
    {message && <p role={failed ? "alert" : "status"} className="mt-2 text-xs text-slate-700">{message}</p>}
  </details>;
}
