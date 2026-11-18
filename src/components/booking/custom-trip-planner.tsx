"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BedDouble, Camera, Check, Clock3, MapPin, MessageCircle, Users, Waves } from "lucide-react";

export type CustomTripSettings = {
  is_active: boolean;
  whatsapp_number: string;
  destinations: string[];
  durations_days: number[];
  activities: string[];
  stays: string[];
  min_participants: number;
  max_participants: number;
  documentation_services: string[];
  documentation_deliverables: string[];
};
type Props = { settings: CustomTripSettings | null; loadError: string | null };

function waLink(settings: CustomTripSettings, destinations: string[], days: number, participants: number, activities: string[], stay: string, documentation: string[], deliverables: string[]) {
  const phone = settings.whatsapp_number.replace(/\D/g, "");
  const message = [
    "Halo admin SHIAP, saya ingin meminta estimasi Custom Trip.",
    "",
    "Destinasi: " + (destinations.length ? destinations.join(", ") : "-"),
    "Durasi: " + days + " hari",
    "Jumlah peserta: " + participants + " orang",
    "Wahana: " + (activities.length ? activities.join(", ") : "Belum memilih"),
    "Menginap: " + (stay || "Belum ditentukan"),
    "Dokumentasi: " + (documentation.length ? documentation.join(", ") : "Tidak memilih"),
    "Hasil dokumentasi: " + (deliverables.length ? deliverables.join(", ") : "Belum memilih"),
    "",
    "Mohon bantu hitungkan estimasi biaya, waktu perjalanan, dan itinerary.",
  ].join("\n");
  return phone ? "https://wa.me/" + phone + "?text=" + encodeURIComponent(message) : "";
}

export default function CustomTripPlanner({ settings, loadError }: Props) {
  const [destinations, setDestinations] = useState<string[]>([]);
  const [activities, setActivities] = useState<string[]>([]);
  const [days, setDays] = useState<number>(settings?.durations_days[0] ?? 1);
  const [participants, setParticipants] = useState<number>(settings?.min_participants ?? 1);
  const [stay, setStay] = useState("");
  const [documentation, setDocumentation] = useState<string[]>([]);
  const [deliverables, setDeliverables] = useState<string[]>([]);
  const waUrl = useMemo(() => settings ? waLink(settings, destinations, days, participants, activities, stay, documentation, deliverables) : "", [settings, destinations, days, participants, activities, stay, documentation, deliverables]);
  const isConfigured = Boolean(settings?.is_active && settings.destinations.length && settings.durations_days.length);
  const canRequest = isConfigured && destinations.length > 0 && Boolean(waUrl);

  function toggle(value: string, selected: string[], update: (next: string[]) => void) {
    update(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  }

  if (loadError) {
    return <main className="min-h-screen bg-[#F5F7FA] px-4 py-16"><div role="alert" className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-6 text-center text-sm text-red-700">Pengaturan Custom Trip belum dapat dimuat. Silakan coba kembali atau hubungi SHIAP.</div></main>;
  }
  if (!settings || !settings.is_active) {
    return <main className="min-h-screen bg-[#F5F7FA] px-4 py-16"><div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center"><h1 className="text-xl font-extrabold text-[#0A2E63]">Custom Trip sedang tidak tersedia</h1><p className="mt-2 text-sm text-slate-500">Silakan hubungi tim SHIAP untuk bantuan menyusun perjalanan.</p><Link href="/trip" className="mt-5 inline-flex rounded-xl bg-[#1974FF] px-4 py-3 text-xs font-bold text-white">Jelajahi Trip</Link></div></main>;
  }

  return <main className="min-h-screen bg-[#F5F7FA] pb-20">
    <section className="bg-[#0A2E63] text-white"><div className="mx-auto max-w-5xl px-4 py-10 sm:px-8 sm:py-14"><Link href="/trip" className="text-xs font-semibold text-blue-200 hover:text-white">← Kembali ke Trip</Link><p className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-100">CUSTOM TRIP · KOTABARU</p><h1 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-5xl">Rancang perjalananmu</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">Pilih tempat, durasi, jumlah peserta, wahana, penginapan, dan kebutuhan dokumentasi. Admin SHIAP akan membantu menghitung estimasinya.</p></div></section>
    <div className="mx-auto grid max-w-5xl gap-5 px-4 py-6 sm:px-8 lg:grid-cols-[1fr_0.8fr]">
      <section className="space-y-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Heading icon={<MapPin size={18}/>} title="Destinasi yang ingin dikunjungi" subtitle="Kamu dapat memilih lebih dari satu tempat."/><div className="grid gap-2 sm:grid-cols-2">{settings.destinations.map((item) => { const checked = destinations.includes(item); return <button type="button" key={item} onClick={() => toggle(item, destinations, setDestinations)} aria-pressed={checked} className={"flex items-center gap-3 rounded-xl border p-3 text-left text-sm font-semibold transition " + (checked ? "border-[#1974FF] bg-blue-50 text-[#0A2E63]" : "border-slate-200 text-slate-600 hover:border-blue-200")}><span className={"flex h-5 w-5 items-center justify-center rounded-md border " + (checked ? "border-[#1974FF] bg-[#1974FF] text-white" : "border-slate-300")}>{checked && <Check size={13}/>}</span>{item}</button>; })}</div>{!settings.destinations.length && <p className="text-xs text-slate-500">Admin belum mengatur daftar destinasi.</p>}</article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Heading icon={<Clock3 size={18}/>} title="Durasi perjalanan" subtitle="Pilih lama perjalanan yang kamu inginkan."/><div className="flex flex-wrap gap-2">{settings.durations_days.map((value) => <button type="button" key={value} onClick={() => setDays(value)} aria-pressed={days === value} className={"rounded-xl border px-4 py-3 text-sm font-bold " + (days === value ? "border-[#1974FF] bg-blue-50 text-[#0A2E63]" : "border-slate-200 text-slate-600")}>{value} hari</button>)}</div></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Heading icon={<Users size={18}/>} title="Jumlah peserta" subtitle="Berapa orang yang akan ikut perjalanan?"/><div className="flex items-center gap-3"><button type="button" aria-label="Kurangi peserta" disabled={participants <= settings.min_participants} onClick={() => setParticipants((value) => Math.max(settings.min_participants, value - 1))} className="h-11 w-11 rounded-xl border border-slate-200 text-lg font-bold text-[#0A2E63] disabled:opacity-40">−</button><input type="number" min={settings.min_participants} max={settings.max_participants} value={participants} onChange={(event) => setParticipants(Math.max(settings.min_participants, Math.min(settings.max_participants, Number(event.target.value) || settings.min_participants)))} className="h-11 w-24 rounded-xl border border-slate-200 text-center text-sm font-bold text-[#0A2E63]"/><button type="button" aria-label="Tambah peserta" disabled={participants >= settings.max_participants} onClick={() => setParticipants((value) => Math.min(settings.max_participants, value + 1))} className="h-11 w-11 rounded-xl border border-slate-200 text-lg font-bold text-[#0A2E63] disabled:opacity-40">+</button><span className="text-xs text-slate-500">orang · batas {settings.min_participants}–{settings.max_participants}</span></div></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Heading icon={<Waves size={18}/>} title="Wahana yang diinginkan" subtitle="Pilih wahana yang ingin dimasukkan ke rencana."/><div className="grid gap-2 sm:grid-cols-2">{settings.activities.map((item) => { const checked = activities.includes(item); return <button type="button" key={item} onClick={() => toggle(item, activities, setActivities)} aria-pressed={checked} className={"flex items-center gap-3 rounded-xl border p-3 text-left text-sm font-semibold transition " + (checked ? "border-cyan-600 bg-cyan-50 text-cyan-950" : "border-slate-200 text-slate-600 hover:border-cyan-200")}><span className={"flex h-5 w-5 items-center justify-center rounded-md border " + (checked ? "border-cyan-700 bg-cyan-700 text-white" : "border-slate-300")}>{checked && <Check size={13}/>}</span>{item}</button>; })}</div>{!settings.activities.length && <p className="text-xs text-slate-500">Admin belum mengatur daftar wahana.</p>}</article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Heading icon={<BedDouble size={18}/>} title="Tempat menginap" subtitle="Pilih penginapan atau tandai belum ditentukan."/><div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => setStay("")} aria-pressed={!stay} className={"rounded-xl border p-3 text-left text-sm font-semibold " + (!stay ? "border-[#1974FF] bg-blue-50 text-[#0A2E63]" : "border-slate-200 text-slate-600")}>Belum ditentukan</button>{settings.stays.map((item) => <button type="button" key={item} onClick={() => setStay(item)} aria-pressed={stay === item} className={"rounded-xl border p-3 text-left text-sm font-semibold " + (stay === item ? "border-[#1974FF] bg-blue-50 text-[#0A2E63]" : "border-slate-200 text-slate-600")}>{item}</button>)}</div>{!settings.stays.length && <p className="mt-2 text-xs text-slate-500">Admin belum mengatur daftar penginapan.</p>}</article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Heading icon={<Camera size={18}/>} title="Dokumentasi" subtitle="Pilih layanan dokumentasi dan hasil yang diinginkan."/><p className="mb-2 text-[11px] font-bold text-slate-500">Layanan</p><div className="grid gap-2 sm:grid-cols-3">{settings.documentation_services.map((item) => { const checked = documentation.includes(item); return <button type="button" key={item} onClick={() => toggle(item, documentation, setDocumentation)} aria-pressed={checked} className={"flex items-center gap-2 rounded-xl border p-3 text-left text-xs font-semibold " + (checked ? "border-violet-500 bg-violet-50 text-violet-950" : "border-slate-200 text-slate-600")}><span className={"flex h-5 w-5 items-center justify-center rounded-md border " + (checked ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300")}>{checked && <Check size={13}/>}</span>{item}</button>; })}</div><p className="mb-2 mt-4 text-[11px] font-bold text-slate-500">Hasil yang dibutuhkan</p><div className="flex flex-wrap gap-2">{settings.documentation_deliverables.map((item) => { const checked = deliverables.includes(item); return <button type="button" key={item} onClick={() => toggle(item, deliverables, setDeliverables)} aria-pressed={checked} className={"rounded-full border px-3 py-2 text-xs font-semibold " + (checked ? "border-violet-500 bg-violet-50 text-violet-950" : "border-slate-200 text-slate-600")}>{item}</button>; })}</div></article>
      </section>
      <aside className="h-fit space-y-4 lg:sticky lg:top-20">
        <section className="overflow-hidden rounded-2xl border border-[#0A2E63] bg-white shadow-lg"><header className="bg-gradient-to-r from-[#0A2E63] to-[#1974FF] p-5 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-100">RINGKASAN PERMINTAAN</p><h2 className="mt-1 text-xl font-extrabold">Estimasi Custom Trip</h2><p className="mt-1 text-xs text-blue-100">Pilihanmu akan dikirim ke WhatsApp admin SHIAP.</p></header><div className="space-y-4 p-5"><Summary label="Destinasi" value={destinations.length ? destinations.join(", ") : "Belum dipilih"}/><Summary label="Durasi" value={days + " hari"}/><Summary label="Peserta" value={participants + " orang"}/><Summary label="Wahana" value={activities.length ? activities.join(", ") : "Belum memilih"}/><Summary label="Menginap" value={stay || "Belum ditentukan"}/><Summary label="Dokumentasi" value={documentation.length ? documentation.join(", ") : "Tidak memilih"}/><Summary label="Hasil dokumentasi" value={deliverables.length ? deliverables.join(", ") : "Belum memilih"}/><div className="rounded-xl bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-950">Admin akan mengirim estimasi biaya, waktu perjalanan, dan itinerary melalui percakapan WhatsApp.</div>{canRequest ? <a href={waUrl} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] px-4 py-3.5 text-sm font-extrabold text-white hover:bg-orange-600"><MessageCircle size={17}/> Hitung estimasi via WhatsApp <ArrowRight size={16}/></a> : <button type="button" disabled className="w-full rounded-xl bg-slate-200 px-4 py-3.5 text-sm font-bold text-slate-500">{destinations.length === 0 ? "Pilih minimal satu destinasi" : settings.whatsapp_number ? "Pilihan belum tersedia" : "Admin belum mengatur WhatsApp"}</button>}</div></section>
        <p className="px-1 text-[10px] leading-relaxed text-slate-400">Permintaan ini belum menjadi booking. Admin akan mengonfirmasi harga, waktu, itinerary, dan ketersediaan terlebih dahulu.</p>
      </aside>
    </div>
  </main>;
}

function Heading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return <div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-2.5 text-[#1974FF]">{icon}</span><div><h2 className="font-extrabold text-[#0A2E63]">{title}</h2><p className="text-[11px] text-slate-500">{subtitle}</p></div></div>;
}
function Summary({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"><span className="shrink-0 text-xs text-slate-500">{label}</span><strong className="text-right text-xs text-[#0A2E63]">{value}</strong></div>;
}

