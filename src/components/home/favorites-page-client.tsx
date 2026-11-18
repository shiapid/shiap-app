"use client";

import Image from "next/image";
import Link from "next/link";
import { Compass, Heart, MapPin } from "lucide-react";
import { useFavoriteTripSlugs } from "@/lib/favorites";
import FavoriteTripButton from "@/components/home/favorite-trip-button";

type FavoriteTrip = { slug: string; title: string; location: string; duration: string; image: string };

export default function FavoritesPageClient({ trips }: { trips: FavoriteTrip[] }) {
  const favoriteSlugs = useFavoriteTripSlugs();
  const savedTrips = trips.filter((trip) => favoriteSlugs.includes(trip.slug));

  return (
    <main className="min-h-screen bg-[#F7FAFC] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 text-[#0A2E63] sm:px-6 md:pb-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="text-xs font-bold text-[#1974FF]">← Beranda SHIAP</Link>
        <header className="mb-5 mt-5">
          <p className="text-[9px] font-extrabold tracking-[.18em] text-[#1974FF]">TERSIMPAN DI PERANGKAT INI</p>
          <h1 className="mt-1 text-2xl font-extrabold">Favorit Saya</h1>
          <p className="mt-1 text-xs text-slate-500">Trip yang kamu tandai untuk dilihat lagi.</p>
        </header>

        {savedTrips.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {savedTrips.map((trip) => (
              <article key={trip.slug} className="overflow-hidden rounded-[22px] border border-slate-100 bg-white shadow-sm">
                <div className="relative h-44 bg-gradient-to-br from-[#1974FF] to-[#0A2E63]">
                  {trip.image && <Image src={trip.image} alt={trip.title} fill unoptimized sizes="(max-width: 640px) 100vw, 33vw" className="object-cover"/>}
                  <FavoriteTripButton slug={trip.slug} title={trip.title} className="absolute right-3 top-3" />
                </div>
                <div className="p-4">
                  <h2 className="line-clamp-2 text-base font-extrabold">{trip.title}</h2>
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-500"><MapPin size={13}/>{trip.location}</p>
                  <p className="mt-1 text-[10px] text-slate-500">{trip.duration}</p>
                  <Link href={`/trip/${encodeURIComponent(trip.slug)}`} className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-[#1974FF] px-4 text-xs font-bold text-white hover:bg-[#0A2E63]">Lihat trip</Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <section className="rounded-[24px] border border-dashed border-blue-200 bg-white px-5 py-12 text-center shadow-sm">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-[#1974FF]"><Heart size={24}/></span>
            <h2 className="mt-4 text-lg font-extrabold">Belum ada trip favorit</h2>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">Tekan ikon hati pada kartu trip untuk menyimpan pilihanmu. Favorit ini tersimpan di perangkat yang sedang digunakan.</p>
            <Link href="/trip" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-[#1974FF] px-5 text-xs font-bold text-white hover:bg-[#0A2E63]"><Compass size={15}/> Jelajahi trip</Link>
          </section>
        )}
      </div>
    </main>
  );
}
