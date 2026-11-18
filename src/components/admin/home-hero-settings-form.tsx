"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ImagePlus, LoaderCircle, RotateCcw, Save, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type HeroSettings = {
  eyebrow: string;
  title_line_one: string;
  title_line_two: string;
  description: string;
  button_label: string;
  button_href: string;
  search_placeholder: string;
  image_path: string | null;
};

const DEFAULTS: HeroSettings = {
  eyebrow: "TRAVEL · EXPLORE · DISCOVER",
  title_line_one: "Explore More.",
  title_line_two: "With SHIAP.",
  description: "Satu pintu untuk trip, stay, aktivitas laut, dokumentasi dan pengalaman wisata di Kotabaru.",
  button_label: "Mulai Jelajah",
  button_href: "/explore",
  search_placeholder: "Cari trip, stay, snorkeling...",
  image_path: null,
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function HomeHeroSettingsForm() {
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState<HeroSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);
    void (async () => {
      try {
        const { data, error: queryError } = await supabase
          .from("home_hero_settings")
          .select("eyebrow,title_line_one,title_line_two,description,button_label,button_href,search_placeholder,image_path")
          .eq("id", true)
          .abortSignal(controller.signal)
          .maybeSingle();
        if (!active) return;
        if (queryError) setLoadError(controller.signal.aborted
          ? "Supabase tidak merespons dalam 10 detik. Periksa koneksi dan status database, lalu coba lagi."
          : `Pengaturan hero tidak dapat dimuat: ${queryError.message}`);
        else if (data) setForm(data as HeroSettings);
        else setLoadError("Data pengaturan banner belum tersedia. Periksa migration dan data awal Supabase.");
      } catch {
        if (active) setLoadError(controller.signal.aborted
          ? "Supabase tidak merespons dalam 10 detik. Periksa koneksi dan status database, lalu coba lagi."
          : "Pengaturan banner gagal dimuat karena koneksi Supabase. Coba lagi.");
      } finally {
        window.clearTimeout(timeoutId);
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; window.clearTimeout(timeoutId); controller.abort(); };
  }, [reloadKey, supabase]);

  function update<K extends keyof HeroSettings>(key: K, value: HeroSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function uploadImage(file?: File) {
    if (!file) return;
    setError(""); setSuccess("");
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Gunakan gambar JPG, PNG, atau WebP.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_SIZE) {
      setError("Ukuran gambar maksimal 5 MB.");
      return;
    }

    setUploading(true);
    const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    const path = `home-hero/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("shiap-catalog-images").upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) {
      setError(`Gambar gagal diunggah: ${uploadError.message}`);
      setUploading(false);
      return;
    }
    const previousPath = form.image_path;
    update("image_path", path);
    const { error: saveError } = await persist({ ...form, image_path: path });
    if (saveError) {
      update("image_path", previousPath);
      await supabase.storage.from("shiap-catalog-images").remove([path]);
      setError(`Gambar terunggah tetapi pengaturan gagal disimpan: ${saveError.message}`);
    } else {
      if (previousPath) await supabase.storage.from("shiap-catalog-images").remove([previousPath]);
      setSuccess("Gambar hero berhasil diperbarui.");
    }
    setUploading(false);
  }

  async function persist(values: HeroSettings) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { error: new Error("Sesi admin tidak ditemukan. Silakan login kembali.") };
    const { error: updateError } = await supabase.from("home_hero_settings").update({
      eyebrow: values.eyebrow.trim(),
      title_line_one: values.title_line_one.trim(),
      title_line_two: values.title_line_two.trim(),
      description: values.description.trim(),
      button_label: values.button_label.trim(),
      button_href: values.button_href.trim(),
      search_placeholder: values.search_placeholder.trim(),
      image_path: values.image_path,
      updated_by: auth.user.id,
      updated_at: new Date().toISOString(),
    }).eq("id", true);
    return { error: updateError };
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess("");
    const href = form.button_href.trim();
    if (!href.startsWith("/") || href.startsWith("//")) {
      setError("Tautan tombol harus berupa path internal, misalnya /explore.");
      return;
    }
    setSaving(true);
    const { error: saveError } = await persist(form);
    if (saveError) setError(`Pengaturan gagal disimpan: ${saveError.message}`);
    else setSuccess("Teks dan pengaturan hero berhasil disimpan.");
    setSaving(false);
  }

  async function resetImage() {
    if (!form.image_path) return;
    setError(""); setSuccess(""); setSaving(true);
    const previousPath = form.image_path;
    const { error: saveError } = await persist({ ...form, image_path: null });
    if (saveError) setError(`Gambar bawaan tidak dapat dipulihkan: ${saveError.message}`);
    else {
      setForm((current) => ({ ...current, image_path: null }));
      const { error: removeError } = await supabase.storage.from("shiap-catalog-images").remove([previousPath]);
      setSuccess(removeError ? "Gambar bawaan dipulihkan; file lama tidak berhasil dibersihkan dari storage." : "Hero kembali menggunakan latar bawaan SHIAP.");
    }
    setSaving(false);
  }

  if (loading) return <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={17}/> Memuat pengaturan hero…</div>;

  const imageUrl = form.image_path
    ? supabase.storage.from("shiap-catalog-images").getPublicUrl(form.image_path).data.publicUrl
    : null;

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-950">
        Atur bagian banner Explore di halaman utama. Gambar yang diunggah akan tampil di belakang teks dengan lapisan navy agar tetap mudah dibaca. Gunakan JPG, PNG, atau WebP maksimal 5 MB.
      </div>
      {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><p className="min-w-0 flex-1">{loadError}</p><button type="button" disabled={loading} onClick={() => { setLoading(true); setLoadError(""); setReloadKey((key) => key + 1); }} className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-2 font-bold text-red-700 hover:bg-red-100 disabled:opacity-50">{loading ? "Memuat…" : "Coba lagi"}</button></div>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      {success && <p role="status" className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-700"><CheckCircle2 size={15}/>{success}</p>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-[#0A2E63]">Pratinjau banner</h2>
        <div className="relative mt-3 min-h-48 overflow-hidden rounded-2xl bg-gradient-to-br from-[#082653] via-[#1052A6] to-[#1974FF] p-5 text-white sm:min-h-56 sm:p-7">
          {imageUrl && <Image src={imageUrl} alt="" fill unoptimized sizes="(max-width: 640px) 100vw, 700px" className="object-cover"/>}
          <div className="absolute inset-0 bg-gradient-to-r from-[#082653]/95 via-[#1052A6]/85 to-[#1974FF]/65"/>
          <div className="relative z-10 max-w-lg">
            <p className="text-[9px] font-bold tracking-[.18em] text-[#B9E5FF]">{form.eyebrow || DEFAULTS.eyebrow}</p>
            <p className="mt-2 text-2xl font-extrabold leading-tight">{form.title_line_one || DEFAULTS.title_line_one}<br/>{form.title_line_two || DEFAULTS.title_line_two}</p>
            <p className="mt-2 max-w-sm text-xs leading-5 text-blue-50">{form.description || DEFAULTS.description}</p>
            <span className="mt-3 inline-flex rounded-xl bg-white px-4 py-2 text-[10px] font-bold text-[#0A2E63]">{form.button_label || DEFAULTS.button_label}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#1974FF] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#0A2E63] ${(uploading || saving) ? "pointer-events-none opacity-60" : ""}`}>
            {uploading ? <LoaderCircle className="animate-spin" size={14}/> : imageUrl ? <Upload size={14}/> : <ImagePlus size={14}/>}
            {imageUrl ? "Ganti gambar" : "Unggah gambar"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading || saving} onChange={(event) => { void uploadImage(event.target.files?.[0]); event.currentTarget.value = ""; }}/>
          </label>
          {imageUrl && <button type="button" disabled={saving || uploading} onClick={() => void resetImage()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RotateCcw size={13}/>Gunakan latar bawaan</button>}
        </div>
      </section>

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Teks kecil di atas judul
          <input required maxLength={100} value={form.eyebrow} onChange={(event) => update("eyebrow", event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#1974FF]"/>
        </label>
        <label className="text-xs font-semibold text-slate-600">Baris judul pertama
          <input required maxLength={80} value={form.title_line_one} onChange={(event) => update("title_line_one", event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#1974FF]"/>
        </label>
        <label className="text-xs font-semibold text-slate-600">Baris judul kedua
          <input required maxLength={80} value={form.title_line_two} onChange={(event) => update("title_line_two", event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#1974FF]"/>
        </label>
        <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Deskripsi
          <textarea required rows={3} maxLength={300} value={form.description} onChange={(event) => update("description", event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm leading-6 outline-none focus:border-[#1974FF]"/>
        </label>
        <label className="text-xs font-semibold text-slate-600">Teks tombol
          <input required maxLength={60} value={form.button_label} onChange={(event) => update("button_label", event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#1974FF]"/>
        </label>
        <label className="text-xs font-semibold text-slate-600">Tujuan tombol
          <input required maxLength={160} value={form.button_href} onChange={(event) => update("button_href", event.target.value)} placeholder="/explore" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#1974FF]"/>
        </label>
        <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Placeholder pencarian
          <input required maxLength={120} value={form.search_placeholder} onChange={(event) => update("search_placeholder", event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-[#1974FF]"/>
        </label>
      </section>

      <button disabled={saving || uploading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1974FF] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#0A2E63] disabled:opacity-50"><Save size={16}/>{saving ? "Menyimpan…" : "Simpan pengaturan banner"}</button>
    </form>
  );
}
