"use client";

import { useState } from "react";
import { Play } from "lucide-react";

export function getYouTubeId(input: string): string | null {
  try {
    const url = new URL(input.trim());
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      const parts = url.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live"].includes(parts[0])) return parts[1] ?? null;
    }
  } catch { return null; }
  return null;
}

export default function YouTubeTourEmbed({ url, title = "Video Tour" }: { url?: string | null; title?: string }) {
  const [playing, setPlaying] = useState(false);
  const id = url ? getYouTubeId(url) : null;
  if (!id) return null;
  const thumb = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-[#0A2E63]">{title}</h2>
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-950">
        {playing ? (
          <iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`} title={title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} aria-label={`Putar ${title}`} className="group relative h-full w-full">
            {/* YouTube thumbnail is served by YouTube. */}
            <img src={thumb} alt={`Thumbnail ${title}`} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
            <span className="absolute inset-0 grid place-items-center bg-black/20 transition group-hover:bg-black/35"><span className="grid h-16 w-16 place-items-center rounded-full bg-red-600 text-white shadow-xl"><Play fill="currentColor" size={27}/></span></span>
          </button>
        )}
      </div>
    </section>
  );
}
