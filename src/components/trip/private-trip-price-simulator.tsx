"use client";

import { useMemo, useState } from "react";

type Tier = { min_pax: number; max_pax: number; price_per_person: number };
const idr = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

export default function PrivateTripPriceSimulator({ tiers, minimumPackagePrice, minPax = 2, maxPax = 20, pax: controlledPax, onPaxChange }: {
  tiers: Tier[]; minimumPackagePrice: number; minPax?: number; maxPax?: number; pax?: number; onPaxChange?: (pax: number) => void;
}) {
  const [localPax, setLocalPax] = useState(minPax);
  const pax = controlledPax ?? localPax;
  const setPax = (next: number) => { setLocalPax(next); onPaxChange?.(next); };
  const quote = useMemo(() => {
    const tier = tiers.find((t) => pax >= t.min_pax && pax <= t.max_pax);
    if (!tier) return null;
    const total = Math.max(minimumPackagePrice, pax * tier.price_per_person);
    return { total, effective: Math.ceil(total / pax), tierRate: tier.price_per_person, tier };
  }, [tiers, minimumPackagePrice, pax]);
  const floor = Math.max(0, minimumPackagePrice);
  const actualOffers = tiers.flatMap((t) => {
    if (t.price_per_person <= 0) return [];
    const firstEligible = Math.max(minPax, t.min_pax, Math.ceil(floor / t.price_per_person));
    if (firstEligible > Math.min(maxPax, t.max_pax)) return [];
    const total = Math.max(floor, firstEligible * t.price_per_person);
    return [{ effective: Math.ceil(total / firstEligible), pax: firstEligible }];
  });
  const cheapestOffer = actualOffers.sort((a, b) => a.effective - b.effective)[0] ?? null;
  return (
    <section className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-[#1974FF]">Simulasi harga private trip</p>
      <p className="mt-1 text-sm text-slate-500">Harga katalog mulai dari {cheapestOffer === null ? "Hubungi admin" : `${idr(cheapestOffer.effective)}/orang`} {cheapestOffer ? `(mulai ${cheapestOffer.pax} peserta)` : ""}</p>
      <div className="mt-4 flex items-center justify-between"><label htmlFor="private-pax" className="text-sm font-semibold text-[#0A2E63]">Jumlah peserta</label><strong className="text-2xl text-[#0A2E63]">{pax} orang</strong></div>
      <input id="private-pax" type="range" min={minPax} max={maxPax} value={pax} onChange={(e) => setPax(Number(e.target.value))} className="mt-3 w-full accent-[#1974FF]" />
      <div className="mt-1 flex justify-between text-xs text-slate-400"><span>{minPax} orang</span><span>{maxPax} orang</span></div>
      {quote ? <div className="mt-4 rounded-xl bg-blue-50 p-4"><p className="text-xs text-slate-500">Harga efektif per orang</p><p className="mt-1 text-2xl font-extrabold text-[#1974FF]">{idr(quote.effective)}</p><div className="mt-3 flex justify-between text-sm"><span className="text-slate-500">Total paket</span><strong className="text-[#0A2E63]">{idr(quote.total)}</strong></div>{quote.total > pax * quote.tierRate && <p className="mt-2 text-xs text-slate-500">Minimum pembayaran paket {idr(minimumPackagePrice)} berlaku untuk jumlah peserta ini.</p>}</div> : <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Belum ada tier harga untuk {pax} peserta. Silakan pilih jumlah peserta lain atau hubungi admin.</p>}
    </section>
  );
}
