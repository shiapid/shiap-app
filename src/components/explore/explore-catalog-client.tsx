"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, ChevronDown, ImageIcon, MapPin, Search, X } from "lucide-react";
import { catalogDestinations, matchesSearch } from "@/lib/explore-destinations";
import ServiceCategoryIcon from "@/components/booking/service-category-icon";
import { formatRupiah } from "@/lib/booking-engine";

const categories = { all: "Semua", trip: "Trip", stay: "Stay", experience: "Experience", rental: "Rental", shinema: "Shinema" };
type Category = keyof typeof categories;

export type ExploreItem = {
  id: string;
  category: Exclude<Category, "all">;
  title: string;
  location: string;
  description?: string | null;
  image?: string | null;
  href: string;
  price: number | null;
  priceUnit?: string;
  isPreview?: boolean;
  keywords?: string;
};

export default function ExploreCatalogClient({ initialQuery, items, loadError }: { initialQuery: string; items: ExploreItem[]; loadError: boolean }) {
  const [query, setQuery] = useState(initialQuery);
  const [destination, setDestination] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [destinationQuery, setDestinationQuery] = useState("");
  const picker = useRef<HTMLDialogElement>(null);

  const catalog = useMemo(() => {
    const resolve = catalogDestinations(items.map((item) => item.location));
    return items.map((item) => {
      const place = resolve(item.location);
      const terms = [item.title, item.location, place?.label, item.description, categories[item.category], item.keywords].filter(Boolean).join(" ");
      return { ...item, place, terms };
    });
  }, [items]);

  const searchResults = catalog.filter((item) => matchesSearch(item.terms, query));
  const destinationResults = searchResults.filter((item) => !destination || item.place?.id === destination);
  const visible = destinationResults.filter((item) => category === "all" || item.category === category);
  const places = new Map<string, { id: string; label: string; terms: string[]; count: number }>();
  for (const item of catalog) {
    const place = item.place;
    if (!place) continue;
    const record = places.get(place.id) ?? { ...place, terms: [], count: 0 };
    record.terms.push(item.terms);
    if ((category === "all" || item.category === category) && matchesSearch(item.terms, query)) record.count += 1;
    places.set(place.id, record);
  }
  const choices = [...places.values()].filter((place) => matchesSearch(place.label, destinationQuery) || place.terms.some((terms) => matchesSearch(terms, destinationQuery)))
    .sort((a, b) => a.label.localeCompare(b.label, "id"));
  const selectDestination = (id: string) => {
    setDestination(id);
    picker.current?.close();
  };

  return <main className="min-w-0 bg-[#F7F9FC] pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8">
    <div className="mx-auto max-w-6xl space-y-2.5 px-3 pt-3 sm:px-6 sm:pt-5">
      <h1 className="text-xl font-bold tracking-tight text-[#0A2E63] sm:text-2xl">Jelajah</h1>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)]">
        <label className="flex min-h-12 min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-[#1265D8]">
          <Search aria-hidden size={18} className="shrink-0 text-[#1265D8]" />
          <input type="search" aria-label="Cari katalog" placeholder="Cari destinasi atau layanan" value={query} onChange={(event) => setQuery(event.target.value)} className="w-full min-w-0 bg-transparent py-2 text-base text-[#0A2E63] outline-none placeholder:text-slate-500 sm:text-sm" />
        </label>
        <button type="button" aria-haspopup="dialog" onClick={() => { setDestinationQuery(""); picker.current?.showModal(); }} className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-semibold text-[#0A2E63] focus-visible:outline-[#1265D8]">
          <MapPin aria-hidden size={17} className="shrink-0 text-[#1265D8]" />
          <span className="min-w-0 flex-1 truncate">{places.get(destination)?.label ?? "Semua destinasi"}</span><ChevronDown aria-hidden size={16} className="shrink-0" />
        </button>
      </div>
      <div role="group" aria-label="Kategori layanan" className="flex flex-wrap gap-1.5">
        {(Object.keys(categories) as Category[]).map((key) => {
          const count = key === "all" ? destinationResults.length : destinationResults.filter((item) => item.category === key).length;
          const selected = category === key;
          return <button type="button" key={key} aria-pressed={selected} aria-label={categories[key] + (loadError ? "" : ", " + count + " produk")} onClick={() => setCategory(key)} className={`inline-flex min-h-11 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold focus-visible:outline-[#1265D8] ${selected ? "border-[#1265D8] bg-[#1265D8] text-white" : "border-slate-200 bg-white text-[#0A2E63]"}`}>
            <ServiceCategoryIcon category={key} size={14} />{categories[key]}{!loadError && <span aria-hidden className={selected ? "text-blue-100" : "text-slate-500"}>{count}</span>}
          </button>;
        })}
      </div>

      {loadError && <p role="alert" className="rounded-xl bg-orange-50 px-3 py-2 text-sm text-orange-900">Sebagian katalog belum dapat dimuat.</p>}
      <p role="status" className="sr-only">{visible.length} produk ditampilkan</p>
      {visible.length ? <ul aria-label="Hasil katalog" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {visible.map((item) => <li key={item.id} className="min-w-0">
          <Link href={item.href} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1265D8]">
            <div className="relative grid aspect-[4/3] place-items-center bg-blue-50 text-[#1265D8]">
              {item.image ? <Image src={item.image} alt="" fill unoptimized sizes="(min-width:1024px) 25vw, (min-width:640px) 33vw, 50vw" className="object-cover" /> : <ImageIcon aria-hidden size={24} />}
              {item.isPreview && <span className="absolute left-2 top-2 rounded-full bg-[#FF8518] px-2 py-1 text-[10px] font-bold text-[#0A2E63]">Pratinjau</span>}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-2.5 sm:p-3">
              <p className="flex items-center gap-1 text-xs font-semibold text-[#1265D8]"><ServiceCategoryIcon category={item.category} size={13} />{categories[item.category]}</p>
              <h2 className="line-clamp-2 break-words text-sm font-bold leading-snug text-[#0A2E63] group-hover:underline">{item.isPreview ? item.title.replace(/^DEMO\s*[—–-]\s*/i, "") : item.title}</h2>
              {item.place && <p className="flex items-start gap-1 text-xs text-slate-600"><MapPin aria-hidden size={12} className="mt-0.5 shrink-0" /><span className="line-clamp-2 break-words">{item.place.label}</span></p>}
              {item.price !== null && <p className="mt-auto pt-1 text-xs font-bold text-[#0A2E63]">Mulai {formatRupiah(item.price)}{item.priceUnit && <span className="font-normal text-slate-600"> / {item.priceUnit}</span>}</p>}
            </div>
          </Link>
        </li>)}
      </ul> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center">
        <p className="text-sm font-semibold text-[#0A2E63]">{query || destination || category !== "all" ? "Tidak ada produk yang cocok." : "Katalog belum tersedia."}</p>
        {(query || destination || category !== "all") && <button type="button" onClick={() => { setQuery(""); setDestination(""); setCategory("all"); }} className="mt-1 min-h-11 text-sm font-semibold text-[#1265D8]">Atur ulang filter</button>}
      </div>}

      <dialog ref={picker} aria-labelledby="destination-title" className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto w-full max-w-lg rounded-t-2xl bg-white p-0 text-[#0A2E63] shadow-xl backdrop:bg-[#0A2E63]/45 sm:inset-0 sm:m-auto sm:w-[calc(100%-2rem)] sm:rounded-2xl" onClick={(event) => { if (event.target === event.currentTarget) picker.current?.close(); }}>
        <div className="flex max-h-[min(70dvh,32rem)] flex-col p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] sm:p-4">
          <div className="flex items-center justify-between">
            <h2 id="destination-title" className="font-bold">Pilih destinasi</h2>
            <button type="button" aria-label="Tutup pemilih destinasi" onClick={() => picker.current?.close()} className="grid size-11 place-items-center rounded-full hover:bg-slate-100"><X aria-hidden size={18} /></button>
          </div>
          <label className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-[#1265D8]">
            <Search aria-hidden size={16} className="shrink-0 text-[#1265D8]" />
            <input type="search" aria-label="Cari destinasi" value={destinationQuery} onChange={(event) => setDestinationQuery(event.target.value)} placeholder="Cari tempat, kota, atau produk" className="w-full min-w-0 text-base outline-none sm:text-sm" />
          </label>
          <div className="mt-2 min-h-0 overflow-y-auto overscroll-contain">
            <DestinationChoice label="Semua destinasi" selected={!destination} count={loadError ? undefined : searchResults.filter((item) => category === "all" || item.category === category).length} onClick={() => selectDestination("")} />
            {choices.map((place) => <DestinationChoice key={place.id} label={place.label} count={loadError ? undefined : place.count} selected={destination === place.id} onClick={() => selectDestination(place.id)} />)}
            {!choices.length && <p className="px-2 py-3 text-sm text-slate-600">Destinasi tidak ditemukan.</p>}
          </div>
        </div>
      </dialog>
    </div>
  </main>;
}

function DestinationChoice({ label, count, selected, onClick }: { label: string; count?: number; selected: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={selected} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-blue-50 focus-visible:outline-[#1265D8]">
    <span className="min-w-0 flex-1 break-words">{label}</span>
    {count !== undefined && <span className="shrink-0 text-xs text-slate-500">{count} produk</span>}
    {selected ? <Check aria-hidden size={16} className="shrink-0 text-[#1265D8]" /> : <span aria-hidden className="w-4 shrink-0" />}
  </button>;
}
