"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Search,
  MapPin,
  Clock3,
  Waves,
  SlidersHorizontal,
} from "lucide-react";
import { trips, TripCategory } from "@/lib/trips";

const categories: TripCategory[] = [
  "Semua",
  "Open Trip",
  "Private Trip",
  "Snorkeling",
  "Island Hopping",
];

export default function TripPage() {
  const [activeCategory, setActiveCategory] = useState<TripCategory>("Semua");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTrips = useMemo(() => {
    return trips.filter((trip) => {
      const matchesCategory =
        activeCategory === "Semua" || trip.category.includes(activeCategory);
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        trip.title.toLowerCase().includes(query) ||
        trip.location.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchQuery]);

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <section className="relative overflow-hidden bg-[#0A2E63]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(25,116,255,0.5),transparent_45%)]" />
        <div className="relative mx-auto max-w-7xl px-5 pb-12 pt-10 sm:px-8 sm:pb-16 sm:pt-14">
          <div className="max-w-2xl">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.24em] text-blue-200">
              Discover Kotabaru with SHIAP
            </p>
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
              Explore More.
              <br />
              Experience More.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-blue-100 sm:text-base">
              Temukan perjalanan terbaik, jelajahi pulau-pulau eksotis, dan
              ciptakan cerita baru bersama SHIAP.
            </p>
            <div className="mt-7 flex items-center gap-2 text-xs font-semibold text-white">
              <Waves size={17} />
              Travel · Stay · Experience
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-6 max-w-7xl px-4 sm:px-8">
        <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-lg shadow-slate-900/5">
          <div className="flex items-center gap-3 px-2">
            <Search size={20} className="shrink-0 text-[#1974FF]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Cari destinasi atau pengalaman..."
              aria-label="Cari destinasi atau pengalaman"
              className="h-11 min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
            <SlidersHorizontal size={19} className="shrink-0 text-slate-400" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-12 pt-9 sm:px-8">
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

        <div className="-mx-4 mb-7 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
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

        {filteredTrips.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTrips.map((trip) => (
              <article
                key={trip.slug}
                className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/5"
              >
                <Link href={`/trip/${trip.slug}`} className="block">
                  <div className="relative aspect-[16/10] overflow-hidden bg-slate-200">
                    <Image
                      src={trip.image}
                      alt={trip.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
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
                  <div className="p-4">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <MapPin size={13} className="text-[#1974FF]" />
                      {trip.location}
                    </div>
                    <h3 className="mt-2 text-lg font-bold text-[#0A2E63]">
                      {trip.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">
                      {trip.description}
                    </p>
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        <Clock3 size={13} />
                        {trip.duration}
                      </span>
                      <span className="flex items-center gap-1 text-xs font-bold text-[#1974FF]">
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
              Destinasi tidak ditemukan
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Coba kata kunci atau kategori lainnya.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setActiveCategory("Semua");
              }}
              className="mt-4 text-sm font-semibold text-[#1974FF]"
            >
              Reset pencarian
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
