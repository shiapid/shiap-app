"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { AVATAR_CHANGED, AVATAR_ENDPOINT } from "@/lib/profile-avatar";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { SiteIcon } from "@/components/site/site-icon-provider";

export default function AppHeader() {
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let controller: AbortController | undefined;
    function refresh() {
      controller?.abort();
      const next = new AbortController();
      controller = next;
      fetch(AVATAR_ENDPOINT, { signal: next.signal })
        .then(async (response) => {
          const url = response.ok ? (await response.json()).url : null;
          if (!next.signal.aborted) setAvatar(url);
        })
        .catch(() => {});
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      clearTimeout(timer);
      if (event === "SIGNED_OUT") {
        controller?.abort();
        setAvatar(null);
      } else {
        timer = setTimeout(refresh, 0);
      }
    });
    window.addEventListener(AVATAR_CHANGED, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      controller?.abort();
      subscription.unsubscribe();
      window.removeEventListener(AVATAR_CHANGED, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

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
            {avatar ? <Image src={avatar} alt="" width={40} height={40} unoptimized className="size-full rounded-full object-cover" /> : <SiteIcon iconKey="profile" fallback={UserRound} size={19} strokeWidth={1.8} />}
          </Link>
        </div>
      </div>
    </header>
  );
}
