"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Activity, BedDouble, Bike, Camera, CalendarCheck, Compass, Flame, Heart, Home, LayoutGrid, Leaf, LoaderCircle, MapPin, Menu, RotateCcw, Search, ShieldCheck, Ship, TicketCheck, Upload, UserRound, UsersRound, Waves, Zap, Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SITE_ICON_LABELS, SITE_ICON_SLOTS, type SiteIconKey } from "@/lib/site-icons";
import { useSiteIcons } from "@/components/site/site-icon-provider";

type IconRow = { icon_key: SiteIconKey; image_path: string; alt_text: string };
const DEFAULT_ICONS = {
  home: Home,
  explore: Compass,
  booking: TicketCheck,
  profile: UserRound,
  trip: Ship,
  stay: BedDouble,
  activities: Activity,
  rental: Bike,
  shinema: Camera,
  my_booking: CalendarCheck,
  custom_trip: Compass,
  services: LayoutGrid,
  menu: Menu,
  search: Search,
  notifications: Bell,
  favorites: Heart,
  trust_destinations: ShieldCheck,
  trust_booking: Zap,
  trust_partners: UsersRound,
  trust_sustainability: Leaf,
  featured_trips: Flame,
  popular_destinations: MapPin,
  more_experiences: Waves,
  private_trip: UsersRound,
} satisfies Record<SiteIconKey, typeof Home>;
const MAX_FILE_SIZE = 2 * 1024 * 1024;

export default function SiteIconSettings() {
  const supabase = useMemo(() => createClient(), []);
  const { setIconUrl } = useSiteIcons();
  const [rows, setRows] = useState<Partial<Record<SiteIconKey, IconRow>>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<SiteIconKey | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);
    void (async () => {
      try {
        const { data, error: queryError } = await supabase
          .from("site_icon_settings")
          .select("icon_key,image_path,alt_text")
          .eq("is_active", true)
          .abortSignal(controller.signal);
        if (!active) return;
        if (queryError) setError(controller.signal.aborted
          ? "Supabase tidak merespons dalam 10 detik. Periksa koneksi dan status database, lalu coba lagi."
          : `Ikon belum dapat dimuat: ${queryError.message}`);
        else setRows(Object.fromEntries((data ?? []).map((row) => [row.icon_key, row as IconRow])));
      } catch {
        if (active) {
          setError(controller.signal.aborted
            ? "Supabase tidak merespons dalam 10 detik. Periksa koneksi dan status database, lalu coba lagi."
            : "Ikon belum dapat dimuat. Periksa koneksi Supabase, lalu coba lagi.");
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; window.clearTimeout(timeoutId); controller.abort(); };
  }, [reloadKey, supabase]);

  async function uploadIcon(key: SiteIconKey, file?: File) {
    if (!file) return;
    setError("");
    setSuccess("");
    if (file.type !== "image/png") {
      setError("Pilih file berformat PNG.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      setError("Ukuran file ikon maksimal 2 MB.");
      return;
    }

    setBusyKey(key);
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setError("Sesi admin berakhir. Silakan login kembali.");
      setBusyKey(null);
      return;
    }

    const path = `site-icons/${key}/${crypto.randomUUID()}.png`;
    const { error: uploadError } = await supabase.storage.from("shiap-catalog-images").upload(path, file, {
      contentType: "image/png",
      cacheControl: "31536000",
      upsert: false,
    });
    if (uploadError) {
      setError(`Upload ikon gagal: ${uploadError.message}`);
      setBusyKey(null);
      return;
    }

    const label = SITE_ICON_LABELS[key];
    const { error: saveError } = await supabase.from("site_icon_settings").upsert({
      icon_key: key,
      label,
      image_path: path,
      alt_text: `Ikon ${label}`,
      is_active: true,
      updated_by: authData.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "icon_key" });

    if (saveError) {
      await supabase.storage.from("shiap-catalog-images").remove([path]);
      setError(saveError.message.includes("site_icon_settings_icon_key_check")
        ? "Slot ikon ini belum diizinkan oleh schema database. Terapkan migration expand_editable_site_icon_slots pada Supabase lokal, lalu coba lagi."
        : `Ikon terunggah tetapi pengaturannya gagal disimpan: ${saveError.message}`);
      setBusyKey(null);
      return;
    }

    const next = { icon_key: key, image_path: path, alt_text: `Ikon ${label}` } satisfies IconRow;
    setRows((current) => ({ ...current, [key]: next }));
    setIconUrl(key, supabase.storage.from("shiap-catalog-images").getPublicUrl(path).data.publicUrl);
    setSuccess(`Ikon ${label} berhasil diperbarui.`);
    setBusyKey(null);
  }

  async function resetIcon(key: SiteIconKey) {
    const row = rows[key];
    if (!row) return;
    setError("");
    setSuccess("");
    setBusyKey(key);
    const { error: deleteError } = await supabase.from("site_icon_settings").delete().eq("icon_key", key);
    if (deleteError) {
      setError(`Ikon tidak dapat dikembalikan ke default: ${deleteError.message}`);
      setBusyKey(null);
      return;
    }
    setRows((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setIconUrl(key);
    const { error: storageError } = await supabase.storage.from("shiap-catalog-images").remove([row.image_path]);
    setSuccess(storageError ? "Ikon bawaan dipulihkan; file lama tidak berhasil dibersihkan dari storage." : `Ikon ${SITE_ICON_LABELS[key]} kembali ke bawaan.`);
    setBusyKey(null);
  }

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Memuat pengaturan ikon…</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-950">
        Gunakan PNG transparan berbentuk persegi agar ikon tetap jelas di menu. Batas ukuran file 2 MB. Perubahan tampil langsung pada website pelanggan.
      </div>
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><p className="min-w-0 flex-1">{error}</p><button type="button" onClick={() => { setLoading(true); setError(""); setReloadKey((key) => key + 1); }} className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-2 font-bold text-red-700 hover:bg-red-100">Coba lagi</button></div>}
      {success && <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-700">{success}</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SITE_ICON_SLOTS.map((slot) => {
          const row = rows[slot.key];
          const Icon = DEFAULT_ICONS[slot.key];
          const previewUrl = row ? supabase.storage.from("shiap-catalog-images").getPublicUrl(row.image_path).data.publicUrl : null;
          const isBusy = busyKey === slot.key;
          return (
            <article key={slot.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-[#EEF6FF] text-[#1974FF]">
                  {previewUrl ? <Image src={previewUrl} alt={row?.alt_text ?? `Ikon ${slot.label}`} width={34} height={34} unoptimized className="h-[34px] w-[34px] object-contain"/> : <Icon size={25}/>}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold text-[#0A2E63]">{slot.label}</h2>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">{slot.description}</p>
                  <p className="mt-1 text-[10px] font-semibold text-slate-400">{row ? "Ikon kustom aktif" : "Menggunakan ikon bawaan"}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#1974FF] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#0A2E63] ${isBusy ? "pointer-events-none opacity-60" : ""}`}>
                  {isBusy ? <LoaderCircle className="animate-spin" size={14}/> : <Upload size={14}/>}
                  {row ? "Ganti PNG" : "Unggah PNG"}
                  <input type="file" accept="image/png,.png" className="sr-only" disabled={isBusy} onChange={(event) => { void uploadIcon(slot.key, event.target.files?.[0]); event.currentTarget.value = ""; }}/>
                </label>
                {row && <button type="button" disabled={isBusy} onClick={() => void resetIcon(slot.key)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RotateCcw size={13}/>Gunakan bawaan</button>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
