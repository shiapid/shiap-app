"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import ItineraryBuilder from "@/components/admin/itinerary-builder";
import TripDeparturesManager from "@/components/admin/trip-departures-manager";
import PrivateTierEditor from "@/components/admin/private-tier-editor";
import StayFacilityPicker from "@/components/admin/stay-facility-picker";
import {
  Archive, BedDouble, Building2, CalendarDays, CirclePlus,
  ImagePlus, LoaderCircle, Pencil, RefreshCw, Save, Search, Ship, X
} from "lucide-react";

type Mode = "trips" | "stay";
type RowData = Record<string, unknown> & { id: string; title?: string; name?: string; status?: string; location?: string; cover_image_url?: string | null; base_price?: number | string | null; property_type?: string };
type FormValues = Record<string, unknown>;
type PriceTierInput = { min_pax?: number | string; max_pax?: number | string; price_per_person?: number | string; price_per_pax?: number | string };
type RoomData = {
  id: string; property_id: string; name: string; description: string;
  capacity: number; total_units: number; weekday_price: number; weekend_price: number;
  extra_bed_price: number; extra_guest_price: number; facilities: string[]; gallery_urls?: string[]; youtube_tour_url?: string | null; status: string;
};

const emptyTrip = {
  title: "", slug: "", location: "Kotabaru, Kalimantan Selatan", categories: "Open Trip, Snorkeling",
  trip_modes: "open, private", duration: "", short_description: "", description: "",
  pricing_model: "quote", base_price: "", min_pax: "2", max_pax: "20",
  price_tiers: "[]", minimum_package_price: "0", youtube_tour_url: "", status: "draft", featured: false, cover_image_url: "",
  gallery_urls: "", highlights: "", itinerary: '[\n  {"time":"Hari 1","title":"Mulai perjalanan","description":"Deskripsi aktivitas"}\n]',
  included: "", excluded: "", meeting_point: "", preparation: "", notes: ""
};

const emptyStay = {
  name: "", slug: "", property_type: "villa", location: "Kotabaru, Kalimantan Selatan",
  address: "", short_description: "", description: "", cover_image_url: "",
  gallery_urls: "", facilities: "", check_in_time: "14:00", check_out_time: "12:00",
  featured: false, status: "draft", youtube_tour_url: ""
};

const emptyRoom = {
  name: "", description: "", capacity: "2", total_units: "1",
  weekday_price: "0", weekend_price: "0", extra_bed_price: "0",
  extra_guest_price: "0", facilities: "", gallery_urls: "", youtube_tour_url: "", status: "active"
};

function lines(value: string) {
  return value.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
}
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function money(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "Belum ditentukan";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value));
}

export default function CatalogManager({ mode }: { mode: Mode }) {
  const supabase = useMemo(() => createClient(), []);
  const isTrip = mode === "trips";
  const table = isTrip ? "trip_packages" : "stay_properties";
  const [items, setItems] = useState<RowData[]>([]);
  const [selected, setSelected] = useState<RowData | null>(null);
  const [form, setForm] = useState<FormValues>(isTrip ? { ...emptyTrip } : { ...emptyStay });
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [roomForm, setRoomForm] = useState<Record<string, string>>({ ...emptyRoom });
  const [editingRoom, setEditingRoom] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadItems = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error: queryError } = await supabase.from(table)
      .select("*").order("updated_at", { ascending: false });
    if (queryError) setError(queryError.message);
    else setItems((data ?? []) as RowData[]);
    setLoading(false);
  }, [supabase, table]);

  const loadRooms = useCallback(async (propertyId: string) => {
    const { data, error: queryError } = await supabase.from("stay_room_types")
      .select("*").eq("property_id", propertyId).order("created_at", { ascending: false });
    if (queryError) setError(queryError.message);
    else setRooms((data ?? []) as RoomData[]);
  }, [supabase]);

  useEffect(() => {
    // loadItems updates state after its Supabase request completes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadItems();
  }, [loadItems]);
  useEffect(() => {
    if (!isTrip && selected?.id) {
      // loadRooms updates state after its Supabase request completes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadRooms(selected.id);
    }
  }, [isTrip, selected?.id, loadRooms]);

  const filtered = items.filter((item) => {
    const name = String(isTrip ? item.title : item.name);
    return name.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "all" || item.status === filter);
  });

  function startNew() {
    setSelected(null);
    setRooms([]);
    setForm(isTrip ? { ...emptyTrip } : { ...emptyStay });
    setShowForm(true); setNotice(""); setError("");
  }

  function startEdit(item: RowData) {
    setSelected(item);
    setRooms([]);
    if (isTrip) {
      setForm({
        ...item,
        categories: stringList(item.categories).join(", "),
        trip_modes: stringList(item.trip_modes).join(", "),
        price_tiers: JSON.stringify(item.price_tiers ?? [], null, 2),
        minimum_package_price: String(item.minimum_package_price ?? 0),
        gallery_urls: stringList(item.gallery_urls).join("\n"),
        highlights: stringList(item.highlights).join("\n"),
        itinerary: JSON.stringify(item.itinerary ?? [], null, 2),
        included: stringList(item.included).join("\n"),
        excluded: stringList(item.excluded).join("\n"),
        preparation: stringList(item.preparation).join("\n"),
        notes: stringList(item.notes).join("\n"),
        base_price: item.base_price ?? "", min_pax: item.min_pax ?? 1, max_pax: item.max_pax ?? ""
      });
    } else {
      setForm({
        ...item,
        gallery_urls: stringList(item.gallery_urls).join("\n"),
        facilities: stringList(item.facilities).join("\n")
      });
    }
    setShowForm(true); setNotice(""); setError("");
  }

  function setField(key: string, value: string | boolean) {
    setForm((old) => ({ ...old, [key]: value }));
    if ((key === "title" || key === "name") && !selected) {
      setForm((old) => ({ ...old, [key]: value, slug: slugify(String(value)) }));
    }
  }

  async function uploadImage(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Foto harus JPG, PNG, atau WebP."); return;
    }
    if (file.size > 10 * 1024 * 1024) { setError("Ukuran foto maksimal 10 MB."); return; }
    setUploading(true); setError("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sesi admin tidak ditemukan.");
      const folder = isTrip ? "trips" : "stay";
      const path = `${folder}/${auth.user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      const { error: uploadError } = await supabase.storage.from("shiap-catalog-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("shiap-catalog-images").getPublicUrl(path);
      setField("cover_image_url", data.publicUrl);
      setNotice("Foto utama berhasil diunggah.");
    } catch (e) { setError(e instanceof Error ? e.message : "Upload foto gagal."); }
    finally { setUploading(false); }
  }

  async function uploadGalleryImages(files?: FileList | null) {
    // FileList is live: the input handler clears it immediately after invoking
    // this async function, so take an immutable snapshot before the first await.
    const selectedFiles = files ? Array.from(files) : [];
    if (!selectedFiles.length) return;
    setUploading(true); setError("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sesi admin tidak ditemukan.");
      const folder = isTrip ? "trips" : "stay";
      const uploaded: string[] = [];
      const failures: string[] = [];
      for (const file of selectedFiles) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { failures.push(`${file.name}: format tidak didukung`); continue; }
        if (file.size > 10 * 1024 * 1024) { failures.push(`${file.name}: melebihi 10 MB`); continue; }
        const path = `${folder}/${auth.user.id}/gallery-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        const { error: uploadError } = await supabase.storage.from("shiap-catalog-images").upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) { failures.push(`${file.name}: ${uploadError.message}`); continue; }
        uploaded.push(supabase.storage.from("shiap-catalog-images").getPublicUrl(path).data.publicUrl);
      }
      if (uploaded.length) setForm((old) => ({ ...old, gallery_urls: [...lines(String(old.gallery_urls || "")), ...uploaded].join("\n") }));
      if (failures.length) setError(`${uploaded.length} foto berhasil. ${failures.join("; ")}`);
      else setNotice(`${uploaded.length} foto galeri berhasil diunggah.`);
      if (!uploaded.length && !failures.length) setError("Tidak ada foto yang berhasil diproses.");
    } catch (e) { setError(e instanceof Error ? e.message : "Upload galeri gagal."); }
    finally { setUploading(false); }
  }

  async function saveItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      let payload: Record<string, unknown>;
      if (isTrip) {
        let itinerary: unknown;
        let priceTiers: unknown;
        try { itinerary = JSON.parse(String(form.itinerary || "[]")); }
        catch { throw new Error("Format itinerary harus JSON yang valid."); }
        try { priceTiers = JSON.parse(String(form.price_tiers || "[]")); }
        catch { throw new Error("Format price tiers harus JSON yang valid."); }
        if (!Array.isArray(priceTiers)) throw new Error("Price tiers harus berupa daftar/rangkaian tier.");
        if (form.pricing_model === "private_tiered") {
          if (Number(form.minimum_package_price || 0) <= 0) throw new Error("Minimum pembayaran paket Private Trip harus lebih dari 0.");
          if (priceTiers.length === 0) throw new Error("Tambahkan minimal satu tier harga Private Trip.");
          const tiers = (priceTiers as unknown[]).filter(isRecord) as PriceTierInput[];
          const sorted = [...tiers].sort((a, b) => Number(a.min_pax) - Number(b.min_pax));
          for (let i = 0; i < sorted.length; i++) {
            const tier = sorted[i];
            if (Number(tier.min_pax) < 1 || Number(tier.max_pax) < Number(tier.min_pax) || Number(tier.price_per_person ?? tier.price_per_pax) <= 0) throw new Error("Rentang dan harga tier tidak valid. Gunakan min_pax, max_pax, dan price_per_person.");
            if (i > 0 && Number(tier.min_pax) <= Number(sorted[i - 1].max_pax)) throw new Error("Rentang tier harga tidak boleh tumpang tindih.");
          }
        }
        payload = {
          title: String(form.title).trim(), slug: slugify(String(form.slug || form.title)),
          location: String(form.location).trim(), categories: String(form.categories).split(",").map((v) => v.trim()).filter(Boolean),
          trip_modes: String(form.trip_modes).split(",").map((v) => v.trim()).filter(Boolean),
          duration: form.duration, short_description: form.short_description, description: form.description,
          pricing_model: form.pricing_model, base_price: form.base_price === "" ? null : Number(form.base_price),
          min_pax: form.min_pax === "" ? null : Number(form.min_pax), max_pax: form.max_pax === "" ? null : Number(form.max_pax),
          price_tiers: priceTiers, minimum_package_price: Number(form.minimum_package_price || 0), youtube_tour_url: String(form.youtube_tour_url || "").trim() || null, status: form.status, featured: Boolean(form.featured),
          cover_image_url: form.cover_image_url || null, gallery_urls: lines(String(form.gallery_urls)),
          highlights: lines(String(form.highlights)), itinerary, included: lines(String(form.included)),
          excluded: lines(String(form.excluded)), meeting_point: form.meeting_point,
          preparation: lines(String(form.preparation)), notes: lines(String(form.notes))
        };
      } else {
        payload = {
          name: String(form.name).trim(), slug: slugify(String(form.slug || form.name)),
          property_type: form.property_type, location: String(form.location).trim(), address: form.address,
          short_description: form.short_description, description: form.description,
          cover_image_url: form.cover_image_url || null, gallery_urls: lines(String(form.gallery_urls)),
          facilities: lines(String(form.facilities)), check_in_time: form.check_in_time,
          check_out_time: form.check_out_time, youtube_tour_url: String(form.youtube_tour_url || "").trim() || null, featured: Boolean(form.featured), status: form.status
        };
      }
      if (!payload.title && isTrip) throw new Error("Nama paket trip wajib diisi.");
      if (!payload.name && !isTrip) throw new Error("Nama properti wajib diisi.");
      if (!payload.location) throw new Error("Lokasi wajib diisi.");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sesi admin berakhir. Silakan login kembali.");
      if (!selected) payload.created_by = auth.user.id;
      const query = selected
        ? supabase.from(table).update(payload).eq("id", selected.id)
        : supabase.from(table).insert(payload);
      const { error: saveError } = await query;
      if (saveError) throw saveError;
      setNotice(isTrip ? "Paket trip berhasil disimpan." : "Listing properti berhasil disimpan.");
      setShowForm(false); setSelected(null); await loadItems();
    } catch (e) { setError(e instanceof Error ? e.message : "Data gagal disimpan."); }
    finally { setSaving(false); }
  }

  async function archiveItem(item: RowData) {
    const label = isTrip ? item.title : item.name;
    if (!window.confirm(`Arsipkan "${label}"? Data tidak dihapus permanen.`)) return;
    const { error: updateError } = await supabase.from(table)
      .update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", item.id);
    if (updateError) setError(updateError.message);
    else { setNotice("Data berhasil diarsipkan."); if (selected?.id === item.id) setSelected(null); await loadItems(); }
  }

  async function uploadRoomGallery(files?: FileList | null) {
    const selectedFiles = files ? Array.from(files) : [];
    if (!selectedFiles.length || !selected?.id) return;
    setUploading(true); setError("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sesi admin tidak ditemukan.");
      const uploaded: string[] = [];
      const failures: string[] = [];
      for (const file of selectedFiles) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { failures.push(`${file.name}: format tidak didukung`); continue; }
        if (file.size > 10 * 1024 * 1024) { failures.push(`${file.name}: melebihi 10 MB`); continue; }
        const path = `stay/${auth.user.id}/rooms/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        const { error: uploadError } = await supabase.storage.from("shiap-catalog-images").upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) { failures.push(`${file.name}: ${uploadError.message}`); continue; }
        uploaded.push(supabase.storage.from("shiap-catalog-images").getPublicUrl(path).data.publicUrl);
      }
      if (uploaded.length) setRoomForm((old) => ({ ...old, gallery_urls: [...lines(old.gallery_urls || ""), ...uploaded].join("\n") }));
      if (failures.length) setError(`${uploaded.length} foto kamar berhasil. ${failures.join("; ")}`);
      else setNotice(`${uploaded.length} foto kamar berhasil diunggah.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload foto kamar gagal."); }
    finally { setUploading(false); }
  }

  async function saveRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected?.id) { setError("Simpan properti terlebih dahulu sebelum menambah tipe kamar."); return; }
    setSaving(true); setError("");
    const payload = {
      property_id: selected.id, name: roomForm.name.trim(), description: roomForm.description,
      capacity: Number(roomForm.capacity), total_units: Number(roomForm.total_units),
      weekday_price: Number(roomForm.weekday_price), weekend_price: Number(roomForm.weekend_price),
      extra_bed_price: Number(roomForm.extra_bed_price), extra_guest_price: Number(roomForm.extra_guest_price),
      facilities: lines(roomForm.facilities), gallery_urls: lines(roomForm.gallery_urls), youtube_tour_url: roomForm.youtube_tour_url.trim() || null, status: roomForm.status
    };
    const query = editingRoom
      ? supabase.from("stay_room_types").update(payload).eq("id", editingRoom)
      : supabase.from("stay_room_types").insert(payload);
    const { error: roomError } = await query;
    if (roomError) setError(roomError.message);
    else {
      setNotice("Tipe kamar berhasil disimpan.");
      setRoomForm({ ...emptyRoom }); setEditingRoom(null); setShowRoomForm(false);
      await loadRooms(selected.id);
    }
    setSaving(false);
  }

  async function archiveRoom(room: RoomData) {
    if (!window.confirm(`Nonaktifkan tipe kamar "${room.name}"?`)) return;
    const { error: roomError } = await supabase.from("stay_room_types")
      .update({ status: "inactive" }).eq("id", room.id);
    if (roomError) setError(roomError.message);
    else if (selected?.id) await loadRooms(selected.id);
  }

  const title = isTrip ? "Trip Management" : "Stay Management";
  const subtitle = isTrip
    ? "Buat dan kelola paket Open Trip, Private Trip, snorkeling, dan island hopping."
    : "Kelola listing properti, tipe kamar, kapasitas, dan harga menginap.";
  const activeCount = items.filter((v) => v.status === "published").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#1974FF]">SHIAP CATALOG</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#0A2E63]">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">{subtitle}</p>
        </div>
        <button onClick={startNew} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1974FF] px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#0A2E63]">
          <CirclePlus size={17}/> {isTrip ? "Buat Paket Trip" : "Tambah Properti"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total {isTrip ? "paket" : "properti"}</p>
          <p className="mt-1 text-2xl font-extrabold text-[#0A2E63]">{items.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Dipublikasikan</p>
          <p className="mt-1 text-2xl font-extrabold text-green-700">{activeCount}</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-1">
          <p className="text-xs text-slate-500">Draft / Arsip</p>
          <p className="mt-1 text-2xl font-extrabold text-[#FF8518]">{items.length - activeCount}</p>
        </div>
      </div>

      {notice && <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</div>}
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {showForm && (
        <form onSubmit={saveItem} className="space-y-5 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-[#0A2E63]">{selected ? "Edit" : "Buat"} {isTrip ? "Paket Trip" : "Listing Properti"}</h2>
              <p className="mt-1 text-xs text-slate-500">Kolom bertanda * wajib diisi.</p>
            </div>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={isTrip ? "Nama paket *" : "Nama properti *"} value={String(isTrip ? form.title : form.name)} onChange={(v) => setField(isTrip ? "title" : "name", v)} required/>
            <Field label="Slug URL" value={String(form.slug)} onChange={(v) => setField("slug", slugify(v))} placeholder="dibuat-otomatis-dari-nama"/>
            <Field label="Lokasi *" value={String(form.location)} onChange={(v) => setField("location", v)} required/>
            {!isTrip && <Field label="Alamat lengkap" value={String(form.address)} onChange={(v) => setField("address", v)}/>}
            {isTrip ? <>
              <Field label="Durasi" value={String(form.duration)} onChange={(v) => setField("duration", v)} placeholder="3 Hari 2 Malam"/>
              <Field label="Kategori (pisahkan koma)" value={String(form.categories)} onChange={(v) => setField("categories", v)} placeholder="Open Trip, Snorkeling"/>
              <Field label="Mode trip (open, private)" value={String(form.trip_modes)} onChange={(v) => setField("trip_modes", v)}/>
              <SelectField label="Model harga" value={String(form.pricing_model)} onChange={(v) => setField("pricing_model", v)} options={[["quote","By quotation / konsultasi"],["open_per_person","Open Trip per pax"],["private_per_person","Private Trip per pax"],["private_tiered","Private Trip bertingkat"]]}/>
              <Field label="Harga dasar (IDR)" type="number" value={String(form.base_price ?? "")} onChange={(v) => setField("base_price", v)}/>
              <Field label="Minimum pembayaran paket Private (IDR)" type="number" value={String(form.minimum_package_price ?? "0")} onChange={(v) => setField("minimum_package_price", v)}/>
              <Field label="Minimum pax" type="number" value={String(form.min_pax ?? "")} onChange={(v) => setField("min_pax", v)}/>
              <Field label="Maksimum pax" type="number" value={String(form.max_pax ?? "")} onChange={(v) => setField("max_pax", v)}/>
            </> : <>
              <SelectField label="Jenis properti" value={String(form.property_type)} onChange={(v) => setField("property_type", v)} options={[["villa","Villa"],["hotel","Hotel"],["homestay","Homestay"],["guesthouse","Guest House"],["resort","Resort"],["other","Lainnya"]]}/>
              <Field label="Check-in" type="time" value={String(form.check_in_time)} onChange={(v) => setField("check_in_time", v)}/>
              <Field label="Check-out" type="time" value={String(form.check_out_time)} onChange={(v) => setField("check_out_time", v)}/>
            </>}
            <Field label="Deskripsi singkat" value={String(form.short_description)} onChange={(v) => setField("short_description", v)}/>
            <Field label="YouTube Tour URL (opsional)" value={String(form.youtube_tour_url ?? "")} onChange={(v) => setField("youtube_tour_url", v)} placeholder="https://www.youtube.com/watch?v=..."/>
            <SelectField label="Status publikasi" value={String(form.status)} onChange={(v) => setField("status", v)} options={[["draft","Draft"],["published","Published"],["archived","Archived"]]}/>
          </div>

          <TextAreaField label="Deskripsi lengkap" value={String(form.description)} onChange={(v) => setField("description", v)} rows={4}/>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-bold text-slate-600">Foto utama (JPG/PNG/WebP, maks. 10 MB)</label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 p-4 text-sm font-semibold text-[#1974FF]">
                {uploading ? <LoaderCircle className="animate-spin" size={17}/> : <ImagePlus size={17}/>}
                {uploading ? "Mengunggah..." : "Pilih foto utama"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={(e) => { void uploadImage(e.target.files?.[0]); e.currentTarget.value = ""; }}/>
              </label>
              {Boolean(form.cover_image_url) && <div className="mt-2 flex items-center gap-3"><Image src={String(form.cover_image_url)} alt="Foto utama" width={96} height={64} unoptimized className="h-16 w-24 rounded-lg object-cover"/><button type="button" onClick={() => setField("cover_image_url", "")} className="text-xs text-red-600">Hapus foto</button></div>}
              <Field label="Atau URL foto utama" value={String(form.cover_image_url)} onChange={(v) => setField("cover_image_url", v)}/>
            </div>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 p-4 text-sm font-semibold text-[#1974FF]">
                <ImagePlus size={17}/> Upload beberapa foto galeri
                <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={(e) => { void uploadGalleryImages(e.target.files); e.currentTarget.value = ""; }}/>
              </label>
              <p className="text-[11px] text-slate-500">Pilih beberapa foto sekaligus. JPG, PNG, atau WebP hingga 10 MB per foto.</p>
              {lines(String(form.gallery_urls || "")).length > 0 && <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{lines(String(form.gallery_urls || "")).map((url, index) => <div key={`${url}-${index}`} className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-slate-200"><Image src={url} alt={`Foto galeri ${index + 1}`} fill sizes="120px" unoptimized className="object-cover"/><button type="button" aria-label={`Hapus foto galeri ${index + 1}`} onClick={() => setField("gallery_urls", lines(String(form.gallery_urls || "")).filter((_, i) => i !== index).join("\n"))} className="absolute right-1 top-1 rounded-md bg-white/95 px-2 py-1 text-[10px] font-bold text-red-600 shadow">Hapus</button></div>)}</div>}
              <TextAreaField label="Daftar foto galeri (URL otomatis / manual, satu per baris)" value={String(form.gallery_urls)} onChange={(v) => setField("gallery_urls", v)} rows={5}/>
            </div>
          </div>

          {isTrip ? <>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextAreaField label="Highlights (satu per baris)" value={String(form.highlights)} onChange={(v) => setField("highlights", v)} rows={4}/>
              <TextAreaField label="Meeting point" value={String(form.meeting_point)} onChange={(v) => setField("meeting_point", v)} rows={4}/>
              <TextAreaField label="Fasilitas termasuk" value={String(form.included)} onChange={(v) => setField("included", v)} rows={4}/>
              <TextAreaField label="Tidak termasuk" value={String(form.excluded)} onChange={(v) => setField("excluded", v)} rows={4}/>
              <TextAreaField label="Persiapan peserta" value={String(form.preparation)} onChange={(v) => setField("preparation", v)} rows={4}/>
              <TextAreaField label="Catatan paket" value={String(form.notes)} onChange={(v) => setField("notes", v)} rows={4}/>
            </div>
            <ItineraryBuilder value={String(form.itinerary)} onChange={(v) => setField("itinerary", v)}/> 
            <PrivateTierEditor value={String(form.price_tiers)} onChange={(v) => setField("price_tiers", v)}/>
          </> : <>
            <StayFacilityPicker label="Fasilitas Property" value={String(form.facilities || "")} onChange={(v) => setField("facilities", v)}/>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={Boolean(form.featured)} onChange={(e) => setField("featured", e.target.checked)} className="h-4 w-4 accent-[#1974FF]"/> Jadikan properti unggulan
            </label>
          </>}

          {isTrip && <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={Boolean(form.featured)} onChange={(e) => setField("featured", e.target.checked)} className="h-4 w-4 accent-[#1974FF]"/> Jadikan paket unggulan
          </label>}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Batal</button>
            <button disabled={saving || uploading} className="inline-flex items-center gap-2 rounded-xl bg-[#1974FF] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {saving ? <LoaderCircle size={16} className="animate-spin"/> : <Save size={16}/>} Simpan
            </button>
          </div>
        </form>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-bold text-[#0A2E63]">Daftar {isTrip ? "Paket Trip" : "Properti"}</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
              <Search size={15} className="text-slate-400"/>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama..." className="h-10 min-w-0 text-xs outline-none"/>
            </div>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-10 rounded-xl border border-slate-200 px-3 text-xs">
              <option value="all">Semua status</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option>
            </select>
            <button onClick={() => void loadItems()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold"><RefreshCw size={14}/> Refresh</button>
          </div>
        </div>

        {loading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin"/> Memuat data...</div> :
          filtered.length === 0 ? <div className="rounded-xl bg-slate-50 px-4 py-12 text-center"><p className="font-semibold text-slate-600">Belum ada {isTrip ? "paket trip" : "properti"}.</p><p className="mt-1 text-xs text-slate-400">Buat data pertama menggunakan tombol di atas.</p></div> :
          <div className="grid gap-3 lg:grid-cols-2">
            {filtered.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-xl border border-slate-100">
                <div className="flex gap-3 p-3">
                  <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                    {item.cover_image_url ? <Image src={item.cover_image_url} alt="" fill sizes="112px" unoptimized className="object-cover"/> : <div className="flex h-full items-center justify-center text-slate-300">{isTrip ? <Ship size={25}/> : <Building2 size={25}/>}</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-bold text-[#0A2E63]">{isTrip ? item.title : item.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${item.status === "published" ? "bg-green-100 text-green-800" : item.status === "archived" ? "bg-slate-100 text-slate-500" : "bg-orange-100 text-orange-800"}`}>{item.status}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">{item.location}</p>
                    <p className="mt-2 text-xs font-semibold text-[#1974FF]">{isTrip ? money(item.base_price) : item.property_type}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button onClick={() => startEdit(item)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold text-[#0A2E63]"><Pencil size={12}/> Edit</button>
                      {!isTrip && <button onClick={() => { setSelected(item); setShowForm(false); }} className="inline-flex items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[10px] font-bold text-[#1974FF]"><BedDouble size={12}/> Tipe kamar</button>}
                      {isTrip && <button onClick={() => { setSelected(item); setShowForm(false); }} className="inline-flex items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[10px] font-bold text-[#1974FF]"><CalendarDays size={12}/> Jadwal</button>}
                      {item.status !== "archived" && <button onClick={() => void archiveItem(item)} className="inline-flex items-center gap-1 rounded-lg border border-orange-100 px-2.5 py-1.5 text-[10px] font-bold text-orange-700"><Archive size={12}/> Arsipkan</button>}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        }
      </div>

      {isTrip && selected && !showForm && <TripDeparturesManager tripId={selected.id} tripName={String(selected.title ?? "")}/> }

      {!isTrip && selected && !showForm && (
        <section className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-[10px] font-bold uppercase tracking-widest text-[#1974FF]">ROOM MANAGEMENT</p><h2 className="mt-1 text-lg font-bold text-[#0A2E63]">{selected.name}</h2></div>
            <button onClick={() => { setShowRoomForm(true); setEditingRoom(null); setRoomForm({ ...emptyRoom }); }} className="inline-flex items-center gap-2 rounded-xl bg-[#1974FF] px-3 py-2.5 text-xs font-bold text-white"><CirclePlus size={15}/> Tambah tipe kamar</button>
          </div>
          {showRoomForm && <form onSubmit={saveRoom} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
            <Field label="Nama tipe kamar *" value={roomForm.name} onChange={(v) => setRoomForm((s) => ({ ...s, name: v }))} required/>
            <Field label="Kapasitas tamu" type="number" value={roomForm.capacity} onChange={(v) => setRoomForm((s) => ({ ...s, capacity: v }))}/>
            <Field label="Jumlah unit" type="number" value={roomForm.total_units} onChange={(v) => setRoomForm((s) => ({ ...s, total_units: v }))}/>
            <Field label="Harga weekday (IDR)" type="number" value={roomForm.weekday_price} onChange={(v) => setRoomForm((s) => ({ ...s, weekday_price: v }))}/>
            <Field label="Harga weekend (IDR)" type="number" value={roomForm.weekend_price} onChange={(v) => setRoomForm((s) => ({ ...s, weekend_price: v }))}/>
            <Field label="Harga extra bed (IDR)" type="number" value={roomForm.extra_bed_price} onChange={(v) => setRoomForm((s) => ({ ...s, extra_bed_price: v }))}/>
            <Field label="Harga extra guest (IDR)" type="number" value={roomForm.extra_guest_price} onChange={(v) => setRoomForm((s) => ({ ...s, extra_guest_price: v }))}/>
            <TextAreaField label="Deskripsi" value={roomForm.description} onChange={(v) => setRoomForm((s) => ({ ...s, description: v }))} rows={2}/>
            <StayFacilityPicker label="Fasilitas Room" value={roomForm.facilities} onChange={(v) => setRoomForm((s) => ({ ...s, facilities: v }))}/>
            <Field label="YouTube Room Tour URL (opsional)" value={roomForm.youtube_tour_url} onChange={(v) => setRoomForm((s) => ({ ...s, youtube_tour_url: v }))}/>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 p-3 text-xs font-semibold text-[#1974FF] sm:col-span-2"><ImagePlus size={15}/> Upload foto kamar<input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={(e)=>{void uploadRoomGallery(e.target.files);e.currentTarget.value="";}}/></label>
            <TextAreaField label="Daftar foto kamar (URL otomatis / manual)" value={roomForm.gallery_urls} onChange={(v) => setRoomForm((s) => ({ ...s, gallery_urls: v }))} rows={2}/>
            <div className="flex items-center gap-2 sm:col-span-2"><button disabled={saving} className="rounded-xl bg-[#1974FF] px-4 py-2.5 text-xs font-bold text-white">Simpan tipe kamar</button><button type="button" onClick={() => setShowRoomForm(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold">Batal</button></div>
          </form>}
          <div className="mt-4 space-y-2">
            {rooms.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">Belum ada tipe kamar untuk properti ini.</p> : rooms.map((room) => (
              <div key={room.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                <div><p className="text-sm font-bold text-[#0A2E63]">{room.name}</p><p className="mt-1 text-xs text-slate-500">{room.capacity} tamu · {room.total_units} unit · Weekday {money(room.weekday_price)} · Weekend {money(room.weekend_price)}</p><span className="mt-1 inline-block text-[10px] text-slate-400">{room.status}</span></div>
                <div className="flex gap-2"><button onClick={() => { setEditingRoom(room.id); setRoomForm({ name: room.name, description: room.description || "", capacity: String(room.capacity), total_units: String(room.total_units), weekday_price: String(room.weekday_price), weekend_price: String(room.weekend_price), extra_bed_price: String(room.extra_bed_price), extra_guest_price: String(room.extra_guest_price), facilities: (room.facilities||[]).join("\n"), gallery_urls: (room.gallery_urls||[]).join("\n"), youtube_tour_url: room.youtube_tour_url||"", status: room.status }); setShowRoomForm(true); }} className="rounded-lg border border-blue-100 px-3 py-2 text-[10px] font-bold text-[#1974FF]">Edit</button><button onClick={() => void archiveRoom(room)} className="rounded-lg border border-orange-100 px-3 py-2 text-[10px] font-bold text-orange-700">Nonaktifkan</button></div>
              </div>
            ))}
          </div>
        </section>
      )}
      <p className="text-[11px] leading-5 text-slate-400">Foto cover dan galeri dapat diunggah langsung ke Supabase Storage. Video tour menggunakan URL YouTube dan ditampilkan sebagai player pada halaman detail pelanggan.</p>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, required = false }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean;
}) {
  return <label className="block text-xs font-semibold text-slate-600">{label}<input type={type} required={required} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-[#0A2E63] outline-none transition focus:border-[#1974FF]"/></label>;
}
function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string,string][];
}) {
  return <label className="block text-xs font-semibold text-slate-600">{label}<select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-[#0A2E63] outline-none focus:border-[#1974FF]">{options.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
}
function TextAreaField({ label, value, onChange, rows = 3, hint }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string;
}) {
  return <label className="block text-xs font-semibold text-slate-600">{label}{hint && <span className="ml-2 font-normal text-slate-400">{hint}</span>}<textarea value={value} rows={rows} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal text-[#0A2E63] outline-none focus:border-[#1974FF]"/></label>;
}

