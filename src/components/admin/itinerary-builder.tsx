"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronUp, Eye, EyeOff, Plus, Trash2 } from "lucide-react";

type Activity = { time: string; title: string; description: string };
type ItineraryDay = { day: string; title: string; activities: Activity[] };

type Props = { value: string; onChange: (value: string) => void };

const blankActivity = (): Activity => ({ time: "08:00", title: "", description: "" });
const blankDay = (index: number): ItineraryDay => ({ day: `Hari ${index + 1}`, title: "", activities: [blankActivity()] });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalize(value: string): ItineraryDay[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [blankDay(0)];
    if (parsed.length === 0) return [blankDay(0)];
    const entries = parsed.filter(isRecord);
    if (!entries.length) return [blankDay(0)];

    // Accept the earlier flat itinerary format and convert it into day groups.
    if (entries.some((entry) => ("time" in entry || "title" in entry) && !Array.isArray(entry.activities) && !Array.isArray(entry.items))) {
      const groups = new Map<string, Activity[]>();
      entries.forEach((entry) => {
        const day = String(entry?.day || "Hari 1");
        const list = groups.get(day) || [];
        list.push({ time: String(entry?.time || "08:00"), title: String(entry?.title || ""), description: String(entry?.description || "") });
        groups.set(day, list);
      });
      return Array.from(groups.entries()).map(([day, activities]) => ({ day, title: "", activities: activities.length ? activities : [blankActivity()] }));
    }

    return entries.map((entry, index) => ({
      day: String(entry?.day || `Hari ${index + 1}`),
      title: String(entry?.title || ""),
      activities: (() => {
        const source = Array.isArray(entry.activities) ? entry.activities : Array.isArray(entry.items) ? entry.items : [];
        const activities = source.filter(isRecord).map((activity) => ({
          time: String(activity.time || "08:00"),
          title: String(activity.title || ""),
          description: String(activity.description || ""),
        }));
        return activities.length ? activities : [blankActivity()];
      })(),
    }));
  } catch {
    return [blankDay(0)];
  }
}

export default function ItineraryBuilder({ value, onChange }: Props) {
  const [preview, setPreview] = useState(false);
  const days = useMemo(() => normalize(value), [value]);

  function commit(next: ItineraryDay[]) {
    onChange(JSON.stringify(next.map((day, index) => ({
      // Keep editor values byte-for-byte while typing; trimming here removes the
      // trailing space needed to enter the next word in a controlled input.
      day: day.day || `Hari ${index + 1}`,
      title: day.title,
      // Keep empty activities in editor state. The previous filter removed the
      // blank row immediately after clicking "Tambah aktivitas".
      activities: day.activities.map((activity) => ({
        time: activity.time || "08:00",
        title: activity.title,
        description: activity.description,
      })),
    })), null, 2));
  }

  function updateDay(index: number, patch: Partial<ItineraryDay>) {
    commit(days.map((day, i) => i === index ? { ...day, ...patch } : day));
  }
  function updateActivity(dayIndex: number, activityIndex: number, patch: Partial<Activity>) {
    commit(days.map((day, i) => i === dayIndex ? { ...day, activities: day.activities.map((activity, j) => j === activityIndex ? { ...activity, ...patch } : activity) } : day));
  }
  function moveDay(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= days.length) return;
    const next = [...days];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  }
  function moveActivity(dayIndex: number, activityIndex: number, direction: -1 | 1) {
    const target = activityIndex + direction;
    const list = [...days[dayIndex].activities];
    if (target < 0 || target >= list.length) return;
    [list[activityIndex], list[target]] = [list[target], list[activityIndex]];
    updateDay(dayIndex, { activities: list });
  }

  return (
    <section className="space-y-4 rounded-2xl border border-blue-100 bg-[#F8FAFF] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-extrabold text-[#0A2E63]"><CalendarDays size={17} className="text-[#1974FF]"/> Itinerary perjalanan</div>
          <p className="mt-1 text-xs text-slate-500">Susun hari dan aktivitas perjalanan. Tidak perlu menulis JSON.</p>
        </div>
        <button type="button" onClick={() => setPreview((v) => !v)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-[#0A2E63]">
          {preview ? <EyeOff size={15}/> : <Eye size={15}/>} {preview ? "Tutup preview" : "Preview"}
        </button>
      </div>

      {!preview ? <div className="space-y-3">
        {days.map((day, dayIndex) => (
          <div key={`day-${dayIndex}`} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-blue-50 px-2.5 py-2 text-xs font-extrabold text-[#1974FF]">{day.day || `Hari ${dayIndex + 1}`}</span>
              <input aria-label={`Nama hari ${dayIndex + 1}`} value={day.day} onChange={(e) => updateDay(dayIndex, { day: e.target.value })} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-[#0A2E63] outline-none focus:border-[#1974FF]" placeholder={`Hari ${dayIndex + 1}`}/>
              <div className="flex items-center gap-1">
                <button type="button" title="Naikkan hari" disabled={dayIndex === 0} onClick={() => moveDay(dayIndex, -1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ChevronUp size={16}/></button>
                <button type="button" title="Turunkan hari" disabled={dayIndex === days.length - 1} onClick={() => moveDay(dayIndex, 1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ChevronDown size={16}/></button>
                <button type="button" title="Hapus hari" disabled={days.length === 1} onClick={() => commit(days.filter((_, i) => i !== dayIndex))} className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-30"><Trash2 size={16}/></button>
              </div>
            </div>
            <input value={day.title} onChange={(e) => updateDay(dayIndex, { title: e.target.value })} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#1974FF]" placeholder="Judul hari (opsional), contoh: Island Hopping & Snorkeling"/>

            <div className="mt-3 space-y-3">
              {day.activities.map((activity, activityIndex) => (
                <div key={`activity-${dayIndex}-${activityIndex}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Aktivitas {activityIndex + 1}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" title="Naikkan aktivitas" disabled={activityIndex === 0} onClick={() => moveActivity(dayIndex, activityIndex, -1)} className="rounded p-1.5 text-slate-500 hover:bg-white disabled:opacity-30"><ChevronUp size={15}/></button>
                      <button type="button" title="Turunkan aktivitas" disabled={activityIndex === day.activities.length - 1} onClick={() => moveActivity(dayIndex, activityIndex, 1)} className="rounded p-1.5 text-slate-500 hover:bg-white disabled:opacity-30"><ChevronDown size={15}/></button>
                      <button type="button" title="Hapus aktivitas" disabled={day.activities.length === 1} onClick={() => updateDay(dayIndex, { activities: day.activities.filter((_, i) => i !== activityIndex) })} className="rounded p-1.5 text-red-500 hover:bg-white disabled:opacity-30"><Trash2 size={15}/></button>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[112px_1fr]">
                    <label className="text-[11px] font-semibold text-slate-500">Waktu<input type="time" value={activity.time} onChange={(e) => updateActivity(dayIndex, activityIndex, { time: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-[#1974FF]"/></label>
                    <label className="text-[11px] font-semibold text-slate-500">Nama aktivitas<input value={activity.title} onChange={(e) => updateActivity(dayIndex, activityIndex, { title: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#1974FF]" placeholder="Contoh: Berangkat menuju dermaga"/></label>
                  </div>
                  <label className="mt-2 block text-[11px] font-semibold text-slate-500">Deskripsi<textarea value={activity.description} onChange={(e) => updateActivity(dayIndex, activityIndex, { description: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:border-[#1974FF]" placeholder="Jelaskan aktivitas secara singkat..."/></label>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => updateDay(dayIndex, { activities: [...day.activities, blankActivity()] })} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-blue-300 px-3 py-2 text-xs font-bold text-[#1974FF] hover:bg-blue-50"><Plus size={14}/> Tambah aktivitas</button>
          </div>
        ))}
        <button type="button" onClick={() => commit([...days, blankDay(days.length)])} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#1974FF] bg-white px-4 py-3 text-sm font-bold text-[#1974FF] hover:bg-blue-50"><Plus size={17}/> Tambah hari perjalanan</button>
      </div> : <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        {days.map((day, index) => <div key={`preview-${index}`}>
          <h3 className="font-extrabold text-[#0A2E63]">{day.day}{day.title ? ` — ${day.title}` : ""}</h3>
          <div className="mt-3 space-y-3 border-l-2 border-blue-100 pl-4">
            {day.activities.filter((activity) => activity.title || activity.description).map((activity, activityIndex) => <div key={activityIndex} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-[#1974FF] ring-4 ring-blue-50"/>
              <p className="text-[10px] font-bold text-[#1974FF]">{activity.time}</p>
              <p className="text-sm font-bold text-[#0A2E63]">{activity.title || "Aktivitas"}</p>
              {activity.description && <p className="mt-1 text-xs leading-relaxed text-slate-500">{activity.description}</p>}
            </div>)}
          </div>
        </div>)}
        {!days.some((day) => day.activities.some((activity) => activity.title || activity.description)) && <p className="text-sm text-slate-400">Belum ada aktivitas untuk ditampilkan.</p>}
      </div>}
    </section>
  );
}
