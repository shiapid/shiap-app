"use client";

import { useMemo, useState } from "react";
import { facilityIconFor } from "@/components/stays/stay-facility-icons";
import {
  Wifi, CarFront, Waves, Utensils, Coffee, Wind, Tv, Bath, Shirt,
  BedDouble, Refrigerator, ShowerHead, DoorOpen, Lock,
  ShieldCheck, Camera, Dumbbell, Trees, Flame, ConciergeBell, Sparkles,
  CircleParking, type LucideIcon
} from "lucide-react";

type Facility = { name: string; category: string; icon: LucideIcon };
const CATALOG: Facility[] = [
  { name: "Wi-Fi", category: "Umum", icon: Wifi },
  { name: "Parkir", category: "Umum", icon: CarFront },
  { name: "Resepsionis", category: "Layanan", icon: ConciergeBell },
  { name: "Kolam Renang", category: "Outdoor", icon: Waves },
  { name: "Restoran", category: "Makanan & Minuman", icon: Utensils },
  { name: "Sarapan", category: "Makanan & Minuman", icon: Coffee },
  { name: "Coffee Maker", category: "Makanan & Minuman", icon: Coffee },
  { name: "AC", category: "Kamar", icon: Wind },
  { name: "Smart TV", category: "Kamar", icon: Tv },
  { name: "TV", category: "Kamar", icon: Tv },
  { name: "Kulkas", category: "Kamar", icon: Refrigerator },
  { name: "King Bed", category: "Kamar", icon: BedDouble },
  { name: "Twin Bed", category: "Kamar", icon: BedDouble },
  { name: "Shower", category: "Kamar mandi", icon: ShowerHead },
  { name: "Bathtub", category: "Kamar mandi", icon: Bath },
  { name: "Water Heater", category: "Kamar mandi", icon: Waves },
  { name: "Balkon", category: "Outdoor", icon: DoorOpen },
  { name: "Laundry", category: "Layanan", icon: Shirt },
  { name: "Housekeeping", category: "Layanan", icon: Sparkles },
  { name: "CCTV", category: "Keamanan", icon: Camera },
  { name: "Security 24 Jam", category: "Keamanan", icon: ShieldCheck },
  { name: "Safe Deposit Box", category: "Keamanan", icon: Lock },
  { name: "Gym", category: "Hiburan", icon: Dumbbell },
  { name: "Taman", category: "Outdoor", icon: Trees },
  { name: "Area BBQ", category: "Outdoor", icon: Flame },
  { name: "Area Bebas Rokok", category: "Umum", icon: Wind },
  { name: "Akses Pantai", category: "Outdoor", icon: Waves },
  { name: "Gazebo", category: "Outdoor", icon: Trees },
  { name: "Area Lounge", category: "Umum", icon: Sparkles },
  { name: "Charging Station", category: "Umum", icon: Sparkles },
  { name: "Parkir Gratis", category: "Umum", icon: CircleParking }
];

export default function StayFacilityPicker({ value, onChange, label }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const selected = useMemo(() => value.split(/\r?\n/).map((v) => v.trim()).filter(Boolean), [value]);
  const [custom, setCustom] = useState("");
  const categories = [...new Set(CATALOG.map((item) => item.category))];
  function toggle(name: string) {
    const next = selected.some((v) => v.toLowerCase() === name.toLowerCase())
      ? selected.filter((v) => v.toLowerCase() !== name.toLowerCase())
      : [...selected, name];
    onChange(next.join("\n"));
  }
  function addCustom() {
    const name = custom.trim();
    if (!name || selected.some((v) => v.toLowerCase() === name.toLowerCase())) return;
    onChange([...selected, name].join("\n"));
    setCustom("");
  }
  return (
    <section className="rounded-xl border border-slate-200 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div><h3 className="text-xs font-bold text-[#0A2E63]">{label}</h3><p className="mt-1 text-[11px] text-slate-500">Pilih fasilitas yang tersedia. Ikon akan ditampilkan otomatis.</p></div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-[#1974FF]">{selected.length} dipilih</span>
      </div>
      {selected.length > 0 && <div className="mb-3 flex flex-wrap gap-2">
        {selected.map((name) => { const Icon = facilityIconFor(name); return <button key={name} type="button" onClick={() => toggle(name)} className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-[#0A2E63]"><Icon size={13} className="text-[#FF8518]"/>{name}<span className="ml-1 text-slate-400">×</span></button>; })}
      </div>}
      <div className="space-y-3">
        {categories.map((category) => <div key={category}>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{category}</p>
          <div className="flex flex-wrap gap-2">
            {CATALOG.filter((item) => item.category === category).map(({ name, icon: Icon }) => {
              const active = selected.some((v) => v.toLowerCase() === name.toLowerCase());
              return <button key={name} type="button" aria-pressed={active} onClick={() => toggle(name)} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-medium transition ${active ? "border-[#1974FF] bg-blue-50 text-[#0A2E63]" : "border-slate-200 bg-white text-slate-600 hover:border-blue-200"}`}><Icon size={14} className="text-[#FF8518]"/>{name}{active ? <span className="text-[#1974FF]">✓</span> : null}</button>;
            })}
          </div>
        </div>)}
      </div>
      <div className="mt-4 flex gap-2">
        <input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} placeholder="Tambah fasilitas khusus..." className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-[#1974FF]"/>
        <button type="button" onClick={addCustom} className="rounded-lg bg-[#0A2E63] px-3 text-xs font-bold text-white">Tambah</button>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">Fasilitas khusus tetap disimpan; ikon umum akan dipilih otomatis bila tersedia.</p>
    </section>
  );
}
