"use client";

import { useRouter } from "next/navigation";
import { stayHref, type StayContext, type StaySection } from "@/lib/admin/stay-navigation";

type Option = { id: string; name: string };

export function StayScopePicker({ properties, rooms, section, context }: {
  properties: Option[]; rooms: Option[]; section: StaySection; context: StayContext;
}) {
  const router = useRouter();
  const input = "mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#0A2E63]";
  return <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
    <label className="min-w-0 text-xs font-semibold">Properti
      <select className={input} value={context.property ?? ""} onChange={event =>
        router.push(stayHref(section, { ...context, property: event.target.value, room: undefined }), { scroll: false })}>
        <option value="" disabled>Pilih properti</option>
        {properties.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    {section !== "rooms" && <label className="min-w-0 text-xs font-semibold">Tipe kamar
      <select className={input} value={context.room ?? ""} onChange={event =>
        router.push(stayHref(section, { ...context, room: event.target.value }), { scroll: false })}>
        {section === "blocks" && <option value="">Seluruh properti</option>}
        {section === "calendar" && !rooms.length && <option value="">Belum ada tipe kamar</option>}
        {rooms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>}
  </div>;
}
