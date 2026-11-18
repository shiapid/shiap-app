"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, UserRound } from "lucide-react";
import { SiteIcon } from "@/components/site/site-icon-provider";

type HomepageProfile = { name: string; avatarUrl: string | null; isLoggedIn: boolean } | null;

export function HomePageHeader({ profile }: { profile: HomepageProfile }) {
  const firstName = profile?.name.trim().split(/\s+/)[0];
  const greeting = firstName ? `Halo, ${firstName} 👋` : "Halo, penjelajah 👋";
  const destinationText = profile?.isLoggedIn
    ? "Siap ke destinasi impian berikutnya?"
    : "Masuk untuk melihat perjalananmu bersama SHIAP.";

  return (
    <header className="flex items-center justify-between gap-3 px-4 pb-5 pt-4 text-white sm:px-6 sm:pt-6 md:px-8 md:pt-8">
      <Link href="/" className="flex min-w-0 items-center gap-3 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" aria-label="SHIAP, beranda">
        {profile?.avatarUrl ? (
          <Image src={profile.avatarUrl} alt="" width={48} height={48} unoptimized className="h-12 w-12 shrink-0 rounded-full border-2 border-white/90 object-cover shadow-md" />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/60 bg-white text-[#1974FF] shadow-md">
            <UserRound size={24} aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-extrabold leading-tight sm:text-lg">{greeting}</span>
          <span className="mt-1 block max-w-[240px] truncate text-[11px] leading-snug text-white/85 sm:max-w-none sm:text-sm">{destinationText}</span>
        </span>
      </Link>

      <div className="flex shrink-0 items-center gap-2">
        <Link href={profile ? "/my-booking" : "/login"} aria-label={profile ? "Lihat booking dan notifikasi" : "Login untuk melihat notifikasi"} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/15 text-white shadow-sm backdrop-blur-md transition hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          <SiteIcon iconKey="notifications" fallback={Bell} size={21} strokeWidth={1.8} />
        </Link>
      </div>
    </header>
  );
}
