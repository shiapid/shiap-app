"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DestinationPicker } from "@/components/shared/destination-picker";
import { placesDestinationChoices } from "@/lib/places/destination-choices";
import { Search } from "lucide-react";
import type { PlacesDestination } from "@/lib/places/types";
import { placesSearchHref } from "@/lib/places/search-navigation";

export function PlacesDirectorySearch({ query, destinationSlug, destinations, loadError }: {
  query: string; destinationSlug: string; destinations: PlacesDestination[]; loadError: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(destinationSlug);
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, startTransition] = useTransition();
  function cancel() { if (timer.current) clearTimeout(timer.current); timer.current = null; }
  function navigate(replace: boolean) {
    if (!form.current) return;
    const data = new FormData(form.current);
    const href = placesSearchHref(window.location.search, String(data.get("q") || ""), String(data.get("destination") || ""));
    if (href === window.location.pathname + window.location.search) return;
    startTransition(() => replace ? router.replace(href, { scroll: false }) : router.push(href, { scroll: false }));
  }
  function change() {
    cancel();
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    timer.current = setTimeout(() => { timer.current = null; if (window.matchMedia("(max-width: 767px)").matches) navigate(true); }, 300);
  }
  useEffect(() => {
    // URL changes from pagination, links, or browser history restore the controls.
    // A newer local edit must survive an older server navigation finishing.
    if (timer.current || !form.current) return;
    (form.current.elements.namedItem("q") as HTMLInputElement).value = query;
    (form.current.elements.namedItem("destination") as HTMLInputElement).value = destinationSlug;
    setSelected(destinationSlug);
  }, [query, destinationSlug]);
  useEffect(() => {
    function history() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (!form.current) return;
      const params = new URLSearchParams(window.location.search);
      (form.current.elements.namedItem("q") as HTMLInputElement).value = params.get("q") || "";
      (form.current.elements.namedItem("destination") as HTMLInputElement).value = params.get("destination") || "";
      setSelected(params.get("destination") || "");
    }
    window.addEventListener("popstate", history);
    return () => { if (timer.current) clearTimeout(timer.current); window.removeEventListener("popstate", history); };
  }, []);
  return <form ref={form} action="/places" method="get" aria-label="Cari penginapan" aria-busy={pending} onChange={event => { if (event.target instanceof HTMLInputElement && event.target.name === "q") change(); }} onSubmit={event => { event.preventDefault(); cancel(); navigate(false); }} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,.65fr)_auto]">
    <label className="min-w-0"><span className="sr-only">Cari properti atau lokasi</span><span className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-[#1265D8] focus-within:ring-2 focus-within:ring-blue-100"><Search size={16} aria-hidden="true" className="shrink-0 text-[#1265D8]"/><input type="search" name="q" defaultValue={query} maxLength={80} placeholder="Cari penginapan…" className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-slate-400"/></span></label>
    <input type="hidden" name="destination" defaultValue={destinationSlug}/>
    <DestinationPicker choices={placesDestinationChoices(destinations, loadError)} value={selected} allLabel="Semua lokasi" allCount={loadError ? undefined : destinations.reduce((count, item) => count + item.listing_count, 0)} countLabel="properti" className="h-11 w-full" onChange={value => {
      cancel(); setSelected(value);
      if (form.current) (form.current.elements.namedItem("destination") as HTMLInputElement).value = value;
      navigate(false);
    }}/>

    <button type="submit" className="hidden h-11 items-center justify-center gap-2 rounded-xl bg-[#1265D8] px-4 text-sm font-bold text-white hover:bg-[#0A2E63] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1265D8] md:inline-flex">Cari <Search size={16} aria-hidden="true"/></button>
    <span role="status" className="sr-only">{pending ? "Memperbarui hasil pencarian" : ""}</span>
  </form>;
}
