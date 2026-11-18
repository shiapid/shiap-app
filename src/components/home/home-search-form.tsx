"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import HomepageUiIcon from "@/components/home/homepage-ui-icon";

export default function HomeSearchForm({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    router.push(value ? `/explore?q=${encodeURIComponent(value)}` : "/explore");
  }

  return (
    <form onSubmit={submit} role="search" className="absolute inset-x-4 bottom-5 z-10 mx-auto flex min-h-[58px] max-w-5xl items-center gap-2 rounded-full border border-white/90 bg-white px-4 shadow-[0_12px_34px_rgba(0,25,54,0.2)] sm:inset-x-8 sm:bottom-7 sm:min-h-[66px] sm:px-6">
      <label htmlFor="homepage-search" className="sr-only">Cari destinasi, trip, villa, aktivitas, atau layanan</label>
      <HomepageUiIcon iconKey="search" size={21} className="shrink-0 text-[#1974FF]" />
      <input id="homepage-search" name="q" type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-[12px] text-[#0A2E63] outline-none placeholder:text-slate-400 sm:text-sm" />
      <button type="submit" aria-label="Cari" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1974FF] text-white transition hover:bg-[#0A2E63] sm:h-auto sm:w-auto sm:gap-2 sm:px-5 sm:py-2.5 sm:text-xs sm:font-bold">
        <span className="hidden sm:inline">Cari</span><ArrowRight aria-hidden="true" size={16} />
      </button>
    </form>
  );
}
