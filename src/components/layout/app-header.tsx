"use client";

import Image from "next/image";
import Link from "next/link";
import { UserRound } from "lucide-react";

export default function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="SHIAP Home">
          <Image
            src="/logo/shiap-logo.png"
            alt="SHIAP"
            width={150}
            height={54}
            priority
            className="h-auto w-[112px] object-contain sm:w-[126px]"
          />
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs font-semibold tracking-wide text-slate-400 sm:block">
            TRAVEL · STAY · EXPERIENCE
          </span>
          <Link
            href="/profile"
            aria-label="Profile"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-[#0A2E63] transition hover:border-[#1974FF] hover:bg-blue-50"
          >
            <UserRound size={19} strokeWidth={1.8} />
          </Link>
        </div>
      </div>
    </header>
  );
}
