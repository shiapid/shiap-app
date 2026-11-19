"use client";

import type {ReactNode} from "react";
import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Search,
  MapPin,
  Clock3,
  Waves,
} from "lucide-react";
import type { Trip, TripCategory } from "@/lib/trips";

const categories: TripCategory[] = [
  "Semua",
  "Open Trip",
  "Private Trip",
  "Snorkeling",
  "Island Hopping",
];

function startingPrivateRate(trip: Trip) {
  const tiers = trip.priceTiers || [];
  const offers = tiers.flatMap((tier) => {
    if (tier.price_per_person <= 0) return [];
    const pax = Math.max(trip.minPax || 2, tier.min_pax, Math.ceil((trip.minimumPackagePrice || 0) / tier.price_per_person));
    if (pax > Math.min(trip.maxPax || 20, tier.max_pax)) return [];
    return [{ price: Math.ceil(Math.max(trip.minimumPackagePrice || 0, pax * tier.price_per_person) / pax), pax }];
  }).sort((a, b) => a.price - b.price);
  const best = offers[0];
  return best ? `Mulai Rp${best.price.toLocaleString("id-ID")} / orang · min. ${best.pax} peserta` : null;
}

export default function TripCatalogClient({ trips, loadError = null, destinationFilter }: { trips: Trip[]; loadError?: string | null; destinationFilter?:ReactNode }) {
  const [activeCategory, setActiveCategory] = useState<TripCategory>("Semua");

  const filteredTrips = useMemo(() => {
    return trips.filter((trip) => {
      return activeCategory === "Semua" || trip.category.includes(activeCategory);
    });
  }, [trips, activeCategory]);

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <section className="mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-8 sm:pt-8">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#1974FF]">
              Find your experience
            </p>
            <h2 className="mt-1 text-xl font-bold text-[#0A2E63] sm:text-2xl">
              Explore Trip
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            {filteredTrips.length} perjalanan
          </span>
        </div>

        {destinationFilter}
        <div className="mb-7 flex flex-wrap gap-2">
          {categories.map((category) => {
            const active = activeCategory === category;
            return (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`shrink-0 rounded-full px-4 py-2.5 text-xs font-semibold transition ${
                  active
                    ? "bg-[#1974FF] text-white shadow-md shadow-blue-500/20"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-[#1974FF]"
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>

        {loadError ? (
          <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-12 text-center">
            <Waves className="mx-auto text-amber-500" size={30} />
            <h3 className="mt-3 font-bold text-[#0A2E63]">Trip belum dapat ditampilkan</h3>
            <p className="mt-1 text-sm text-slate-600">{loadError}</p>
          </div>
        ) : filteredTrips.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
            {filteredTrips.map((trip) => (
              <article
                key={trip.slug}
                className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/5"
              >
                <Link href={`/trip/${trip.slug}`} className="block">
                  <div className="relative aspect-[4/3] overflow-hidden bg-slate-200">
                    <Image
                      src={trip.image}
                      alt={trip.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      unoptimized
                      className="object-cover transition duration-700 group-hover:scale-105"
                    />
                    {trip.featured && (
                      <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-[10px] font-bold text-[#0A2E63] shadow-sm">
                        FEATURED
                      </span>
                    )}
                    <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
                      {trip.category.slice(0, 2).map((category) => (
                        <span
                          key={category}
                          className="rounded-full bg-[#0A2E63]/80 px-2.5 py-1 text-[9px] font-semibold text-white backdrop-blur"
                        >
                          {category}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="p-3 sm:p-4">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <MapPin size={13} className="text-[#1974FF]" />
                      {trip.location}
                    </div>
                    <h3 className="mt-2 line-clamp-2 text-sm font-bold leading-snug text-[#0A2E63] sm:text-lg">
                      {trip.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-slate-500 sm:text-xs">
                      {trip.description}
                    </p>
                    {trip.modes.includes("private") && startingPrivateRate(trip) && (
                      <p className="mt-2 text-[10px] font-bold text-[#1974FF] sm:text-xs">{startingPrivateRate(trip)}</p>
                    )}
                    <div className="mt-3 flex flex-col items-start justify-between gap-2 border-t border-slate-100 pt-3 sm:mt-4 sm:flex-row sm:items-center">
                      <span className="flex items-center gap-1 text-[9px] text-slate-400 sm:gap-1.5 sm:text-[10px]">
                        <Clock3 size={13} />
                        {trip.duration}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] font-bold text-[#1974FF] sm:text-xs">
                        Lihat detail <ArrowRight size={15} />
                      </span>
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
            <Search className="mx-auto text-slate-300" size={30} />
            <h3 className="mt-3 font-bold text-[#0A2E63]">
              {trips.length === 0 ? "Belum ada paket Trip tersedia" : "Tidak ada paket pada kategori ini"}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {trips.length === 0 ? "Paket perjalanan yang sudah diterbitkan akan tampil di sini." : "Pilih kategori lainnya untuk melihat paket Trip."}
            </p>
            <button
              type="button"
              onClick={() => setActiveCategory("Semua")}
              className="mt-4 text-sm font-semibold text-[#1974FF]"
            >
              Reset filter
            </button>
          </div>
        )}
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-8">
        <div className="rounded-3xl bg-[#0A2E63] p-6 text-white sm:p-9">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-200">
            Your journey, your way
          </p>
          <h2 className="mt-2 max-w-lg text-2xl font-bold leading-tight">
            Punya rencana perjalanan sendiri?
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-blue-100">
            Konsultasikan perjalanan private bersama tim SHIAP. Sesuaikan
            destinasi dan pengalaman dengan kebutuhanmu.
          </p>
          <Link
            href="/booking"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-xs font-bold text-[#0A2E63] transition hover:bg-blue-50"
          >
            Konsultasi Trip <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </div>
  );
}

