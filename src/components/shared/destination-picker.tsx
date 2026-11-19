"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, MapPin, Search, X } from "lucide-react";
import { matchesSearch } from "@/lib/explore-destinations";

export type DestinationChoice = { id: string; label: string; region?: string; terms?: string[]; count?: number };

/** Shared Explore/Places presentation; callers supply their own authoritative metric. */
export function DestinationPicker({ choices, value, onChange, allLabel = "Semua destinasi", allCount, countLabel = "produk", placeholder = "Cari destinasi...", className = "" }: {
 choices: DestinationChoice[]; value: string; onChange: (value: string) => void; allLabel?: string; allCount?: number; countLabel?: string; placeholder?: string; className?: string;
}) {
 const id = useId(); const dialog = useRef<HTMLDialogElement>(null); const search = useRef<HTMLInputElement>(null);
 const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
 const [open, setOpen] = useState(false); const [closing, setClosing] = useState(false); const [query, setQuery] = useState("");
 const [viewport, setViewport] = useState<{ height: number; bottom: number } | null>(null);
 const selected = choices.find(choice => choice.id === value);
 const visible = choices.filter(choice => matchesSearch([choice.label, choice.region, ...(choice.terms ?? [])].filter(Boolean).join(" "), query));
 useEffect(() => {
  if (!open) return;
  const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
  const vv = window.visualViewport;
  const resize = () => setViewport(vv ? { height: Math.round(vv.height * .85), bottom: window.matchMedia("(max-width: 767px)").matches ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0 } : null);
  resize(); vv?.addEventListener("resize", resize); vv?.addEventListener("scroll", resize);
  return () => { document.body.style.overflow = previous; vv?.removeEventListener("resize", resize); vv?.removeEventListener("scroll", resize); };
 }, [open]);
 useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
 function close() {
  if (closing) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { dialog.current?.close(); return; }
  setClosing(true); closeTimer.current = setTimeout(() => { dialog.current?.close(); closeTimer.current = null; }, 130);
 }
 function show() {
  if (dialog.current?.open) return;
  setQuery(""); setClosing(false); dialog.current?.showModal(); setOpen(true);
  // Mobile keeps the keyboard closed until the visitor explicitly taps search.
  if (window.matchMedia("(min-width: 768px)").matches) search.current?.focus();
 }
 function choice(option: DestinationChoice, selected: boolean) {
  return <button key={option.id} type="button" aria-pressed={selected} onClick={() => { onChange(option.id); close(); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-blue-50 focus-visible:outline-[#1265D8]">
   <span className="min-w-0 flex-1 break-words"><span className="block">{option.label}</span>{option.region && <span className="block text-xs text-slate-500">{option.region}</span>}</span>
   {option.count !== undefined && <span className="shrink-0 text-xs text-slate-500">{option.count} {countLabel}</span>}
   {selected ? <Check aria-hidden size={16} className="shrink-0 text-[#1265D8]"/> : <span aria-hidden className="w-4 shrink-0"/>}
  </button>;
 }
 return <>
  <button type="button" aria-label={"Destinasi wisata: " + (selected?.label ?? (value ? "Destinasi dipilih" : allLabel))} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={show} className={"flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-semibold text-[#0A2E63] focus-visible:outline-[#1265D8] " + className}>
   <MapPin aria-hidden size={17} className="shrink-0 text-[#1265D8]"/><span className="min-w-0 flex-1 truncate">{selected?.label ?? (value ? "Destinasi dipilih" : allLabel)}</span><ChevronDown aria-hidden size={16} className="shrink-0"/>
  </button>
  <dialog id={id} ref={dialog} aria-labelledby={id + "-title"} onCancel={event => { event.preventDefault(); close(); }} onClose={() => { setOpen(false); setClosing(false); }} onClick={event => { if (event.target === event.currentTarget) close(); }} style={{ bottom: viewport?.bottom || undefined }} className={"fixed inset-x-0 bottom-0 top-auto m-0 mx-auto w-full max-w-lg rounded-t-2xl bg-white p-0 text-[#0A2E63] shadow-xl backdrop:bg-[#0A2E63]/45 md:inset-0 md:m-auto md:w-[calc(100%-2rem)] md:rounded-2xl motion-safe:transition-[opacity,translate] motion-safe:duration-150 " + (closing ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100 motion-safe:animate-[destination-sheet-in_150ms_ease-out]")}>
   <div style={{ maxHeight: viewport ? Math.min(viewport.height, 512) : undefined }} className="flex max-h-[min(85dvh,32rem)] flex-col p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] sm:p-4">
    <div className="flex shrink-0 items-center justify-between"><h2 id={id + "-title"} className="font-bold">Pilih destinasi</h2><button type="button" aria-label="Tutup pemilih destinasi" onClick={close} className="grid size-11 place-items-center rounded-full hover:bg-slate-100"><X aria-hidden size={18}/></button></div>
    <label className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-[#1265D8]"><Search aria-hidden size={16} className="shrink-0 text-[#1265D8]"/><input ref={search} type="search" onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} aria-label="Cari destinasi" placeholder={placeholder} value={query} onChange={event => setQuery(event.target.value)} className="w-full min-w-0 text-base outline-none sm:text-sm"/></label>
    <div className="mt-2 min-h-0 overflow-y-auto overscroll-contain" aria-label="Daftar destinasi">
     {choice({ id: "", label: allLabel, count: allCount }, !value)}
     {visible.map(option => choice(option, option.id === value))}
     {!visible.length && <p role="status" className="px-2 py-3 text-sm text-slate-600">Destinasi tidak ditemukan.</p>}
    </div>
   </div>
  </dialog>
 </>;
}
