
"use client";

import Link from "next/link";
import {
  X,
  Camera,
  Waves,
  Ship,
  Anchor,
  Compass,
  ArrowUpRight,
} from "lucide-react";

type ServicesSheetProps = {
  open: boolean;
  onClose: () => void;
};

const services = [
  {
    title: "Shinema",
    description: "Photo, cinematic & underwater",
    href: "/shinema",
    icon: Camera,
  },
  {
    title: "Snorkeling",
    description: "Explore the underwater world",
    href: "/activities/snorkeling",
    icon: Waves,
  },
  {
    title: "Jetski",
    description: "Enjoy the ocean adventure",
    href: "/activities/jetski",
    icon: Ship,
  },
  {
    title: "Paddleboard",
    description: "Relax on the sea",
    href: "/activities/paddleboard",
    icon: Compass,
  },
  {
    title: "Kano & Kayak",
    description: "Discover the coastline",
    href: "/activities/kano",
    icon: Anchor,
  },
];

export default function ServicesSheet({
  open,
  onClose,
}: ServicesSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="Tutup menu layanan"
        onClick={onClose}
        className="absolute inset-0 bg-[#07172F]/50 backdrop-blur-[3px]"
      />

      <section className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-white px-5 pb-8 pt-4 shadow-2xl md:rounded-[28px]">
        <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-slate-200 md:hidden" />

        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#1974FF]">
              Discover SHIAP
            </p>
            <h2 className="text-xl font-bold tracking-tight text-[#0A2E63]">
              Explore Our Services
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Temukan pengalaman terbaik bersama SHIAP.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2">
          {services.map((service) => {
            const Icon = service.icon;

            return (
              <Link
                key={service.title}
                href={service.href}
                onClick={onClose}
                className="group flex items-center gap-4 rounded-2xl border border-slate-100 p-4 transition hover:border-blue-100 hover:bg-blue-50/50"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EAF2FF] text-[#1974FF]">
                  <Icon size={22} strokeWidth={1.8} />
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-[#0A2E63]">
                    {service.title}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {service.description}
                  </p>
                </div>

                <ArrowUpRight
                  size={18}
                  className="text-slate-300 transition group-hover:text-[#1974FF]"
                />
              </Link>
            );
          })}
        </div>

        <div className="mt-5 rounded-2xl bg-[#0A2E63] p-5 text-white">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-200">
            Travel · Stay · Experience
          </p>
          <h3 className="mt-2 text-lg font-bold">
            Your next experience starts here.
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-blue-100">
            Jelajahi keindahan Kotabaru bersama SHIAP.
          </p>
          <Link
            href="/explore"
            onClick={onClose}
            className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-white"
          >
            Explore SHIAP <ArrowUpRight size={15} />
          </Link>
        </div>
      </section>
    </div>
  );
}
