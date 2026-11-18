"use client";

import { Heart } from "lucide-react";
import { toggleFavoriteTrip, useFavoriteTripSlugs } from "@/lib/favorites";
import { SiteIcon } from "@/components/site/site-icon-provider";

export default function FavoriteTripButton({ slug, title, className = "" }: { slug: string; title: string; className?: string }) {
  const favorites = useFavoriteTripSlugs();
  const selected = favorites.includes(slug);
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={selected ? `Hapus ${title} dari favorit` : `Simpan ${title} ke favorit`}
      title={selected ? "Hapus dari favorit" : "Simpan ke favorit"}
      onClick={() => toggleFavoriteTrip(slug)}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/60 ${selected ? "bg-[#FF8518] text-[#0A2E63]" : "bg-[#0A2E63]/35 text-white"} shadow-sm backdrop-blur-sm transition hover:scale-105 hover:bg-[#0A2E63]/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${className}`}
    >
      <SiteIcon iconKey="favorites" fallback={Heart} size={19} />
    </button>
  );
}
