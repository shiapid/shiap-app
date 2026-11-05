
"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, UserRound } from "lucide-react";

type AppHeaderProps = {
  onMenuClick: () => void;
};

export default function AppHeader({ onMenuClick }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-100 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:h-[76px]">
        <Link
          href="/"
          aria-label="SHIAP Home"
          className="flex items-center"
        >
          <Image
            src="/logo/shiap-logo.png"
            alt="SHIAP"
            width={150}
            height={54}
            priority
            className="h-auto w-[112px] object-contain sm:w-[126px]"
          />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <Link href="/" className="text-sm font-semibold text-[#0A2E63]">
            Home
          </Link>
          <Link
            href="/trip"
            className="text-sm font-medium text-slate-600 transition hover:text-[#1974FF]"
          >
            Trip
          </Link>
          <Link
            href="/stay"
            className="text-sm font-medium text-slate-600 transition hover:text-[#1974FF]"
          >
            Stay
          </Link>
          <Link
            href="/explore"
            className="text-sm font-medium text-slate-600 transition hover:text-[#1974FF]"
          >
            Explore
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/profile"
            aria-label="Profil"
            className="hidden h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-[#0A2E63] transition hover:border-[#1974FF] hover:bg-blue-50 sm:flex"
          >
            <UserRound size={19} strokeWidth={1.8} />
          </Link>

          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Buka menu layanan"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F7FA] text-[#0A2E63] transition hover:bg-blue-50 md:hidden"
          >
            <Menu size={21} strokeWidth={1.9} />
          </button>
        </div>
      </div>
    </header>
  );
}
