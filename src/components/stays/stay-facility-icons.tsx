"use client";
import {
  Wifi, CarFront, Waves, Utensils, Coffee, Wind, Tv, Bath, Shirt,
  BedDouble, Refrigerator, ShowerHead, DoorOpen, Lock, ShieldCheck,
  Camera, Dumbbell, Trees, Flame, ConciergeBell, Sparkles, CircleParking,
  type LucideIcon
} from "lucide-react";

const ICONS: Array<{ names: string[]; icon: LucideIcon }> = [
  { names: ["wi-fi", "wifi", "internet"], icon: Wifi },
  { names: ["parkir", "parking"], icon: CarFront },
  { names: ["kolam renang", "akses pantai", "pantai", "laut"], icon: Waves },
  { names: ["restoran", "makan", "sarapan"], icon: Utensils },
  { names: ["coffee maker", "kopi"], icon: Coffee },
  { names: ["ac", "air conditioner"], icon: Wind },
  { names: ["smart tv", "tv"], icon: Tv },
  { names: ["bathtub"], icon: Bath },
  { names: ["shower", "water heater", "kamar mandi"], icon: ShowerHead },
  { names: ["laundry"], icon: Shirt },
  { names: ["king bed", "twin bed", "bed", "kasur", "ranjang"], icon: BedDouble },
  { names: ["kulkas", "refrigerator"], icon: Refrigerator },
  { names: ["balkon"], icon: DoorOpen },
  { names: ["safe deposit", "lock"], icon: Lock },
  { names: ["cctv", "security", "keamanan"], icon: ShieldCheck },
  { names: ["kamera", "dokumentasi"], icon: Camera },
  { names: ["gym"], icon: Dumbbell },
  { names: ["taman", "gazebo"], icon: Trees },
  { names: ["bbq"], icon: Flame },
  { names: ["resepsionis"], icon: ConciergeBell },
  { names: ["parkir gratis"], icon: CircleParking }
];
export function facilityIconFor(name: string): LucideIcon {
  const value = name.trim().toLowerCase();
  return ICONS.find((entry) => entry.names.some((n) => value === n || value.includes(n)))?.icon ?? Sparkles;
}
export function FacilityChips({ facilities, compact = false }: { facilities?: string[] | null; compact?: boolean }) {
  if (!facilities?.length) return null;
  return <div className="flex flex-wrap gap-2">{facilities.map((name) => {
    const Icon = facilityIconFor(name);
    return <span key={name} className={`inline-flex items-center gap-2 rounded-full border border-slate-100 bg-slate-50 text-slate-700 ${compact ? "px-2.5 py-1.5 text-[10px]" : "px-3 py-2 text-xs"}`}><Icon size={compact ? 13 : 15} className="shrink-0 text-[#FF8518]"/><span>{name}</span></span>;
  })}</div>;
}
