"use client";

import { useEffect, useState } from "react";
import { formatRupiah } from "@/lib/booking-engine";
import { feeLabels, type FeeCategory, type FeeQuote } from "@/lib/service-fees";

export function useServiceFeeQuote(subtotals: { category: FeeCategory; subtotal: number }[]) {
  const key = JSON.stringify(subtotals);
  const [state, setState] = useState<{ key: string; data?: FeeQuote; error?: string }>({ key: "" });
  useEffect(() => {
    if (key === "[]") return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/bookings/fee-quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subtotals: JSON.parse(key) }), signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Biaya layanan belum dapat dihitung.");
        if (!controller.signal.aborted) setState({ key, data: body });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : "Periksa koneksi lalu coba lagi." });
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key]);
  return state.key === key ? state : { key };
}

export default function ServiceFeeSummary({ quote, error }: { quote?: FeeQuote; error?: string }) {
  if (error) return <p role="alert" className="text-sm text-red-700">{error} Ubah pilihan atau muat ulang untuk mencoba kembali.</p>;
  if (!quote) return <p role="status" className="text-sm text-slate-600">Menghitung biaya layanan…</p>;
  return <div className="space-y-1 text-sm text-[#0A2E63]" aria-label="Rincian pembayaran">
    <div className="flex justify-between gap-2"><span>Harga Paket</span><strong>{formatRupiah(quote.subtotal)}</strong></div>
    <div className="flex justify-between gap-2"><span>Biaya Layanan SHIAP</span><strong>{formatRupiah(quote.fee)}</strong></div>
    {quote.lines.filter((line) => line.fee > 0 || line.capped).map((line) => <p key={line.category} className="text-xs text-slate-600">{feeLabels[line.category]}: {formatRupiah(line.fee)}{line.capped ? ` (dibatasi dari ${formatRupiah(line.requested_fee)} sesuai plafon ${line.max_percentage_bps / 100}%)` : ""}</p>)}
    <div className="flex justify-between gap-2 border-t border-slate-200 pt-2 font-bold"><span>Total Pembayaran 100%</span><span>{formatRupiah(quote.total)}</span></div>
  </div>;
}
