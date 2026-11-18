"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { AtSign, Camera, CheckCircle2, KeyRound, LoaderCircle, Mail, Save, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type AdminProfile = { full_name: string; whatsapp: string; avatar_url: string | null };
const EMPTY_PROFILE: AdminProfile = { full_name: "", whatsapp: "", avatar_url: null };
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function AdminProfileSettings() {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<AdminProfile>(EMPTY_PROFILE);
  const [email, setEmail] = useState("");
  const [accountId, setAccountId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [emailChangePending, setEmailChangePending] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !user) {
        setError("Sesi admin tidak ditemukan. Silakan login kembali.");
        setLoading(false);
        return;
      }
      setAccountId(user.id);
      setEmail(user.email ?? "");
      const { data, error: profileError } = await supabase.from("profiles").select("full_name,whatsapp,avatar_url").eq("id", user.id).maybeSingle();
      if (!active) return;
      if (profileError) setError(`Profil gagal dimuat: ${profileError.message}`);
      else setProfile({
        full_name: data?.full_name ?? user.user_metadata?.full_name ?? "",
        whatsapp: data?.whatsapp ?? user.user_metadata?.whatsapp ?? "",
        avatar_url: data?.avatar_url ?? user.user_metadata?.avatar_url ?? null,
      });
      setLoading(false);
    })();
    return () => { active = false; };
  }, [supabase]);

  useEffect(() => () => {
    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const avatar = removeAvatar ? "" : previewUrl || profile.avatar_url || "";

  function update<K extends keyof AdminProfile>(key: K, value: AdminProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setNotice(""); setEmailChangePending("");
    const nextName = profile.full_name.trim();
    const nextEmail = email.trim().toLowerCase();
    if (!nextName) { setError("Nama admin wajib diisi."); return; }
    if (!nextEmail) { setError("Email admin wajib diisi."); return; }
    if (profile.whatsapp.trim() && profile.whatsapp.trim().length < 6) { setError("Nomor WhatsApp terlalu pendek."); return; }

    setSaving(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setError("Sesi admin telah berakhir. Silakan login kembali."); setSaving(false); return;
    }

    let avatarUrl = removeAvatar ? null : profile.avatar_url;
    let uploadedPath: string | null = null;
    if (selectedAvatar) {
      const extension = selectedAvatar.type === "image/jpeg" ? "jpg" : selectedAvatar.type === "image/png" ? "png" : "webp";
      uploadedPath = `admin-avatars/${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("shiap-catalog-images").upload(uploadedPath, selectedAvatar, {
        contentType: selectedAvatar.type,
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadError) { setError(`Foto profil gagal diunggah: ${uploadError.message}`); setSaving(false); return; }
      avatarUrl = supabase.storage.from("shiap-catalog-images").getPublicUrl(uploadedPath).data.publicUrl;
    }

    const oldProfile = profile;
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: user.id,
      full_name: nextName,
      whatsapp: profile.whatsapp.trim() || null,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (profileError) {
      if (uploadedPath) await supabase.storage.from("shiap-catalog-images").remove([uploadedPath]);
      setError(`Profil gagal disimpan: ${profileError.message}`); setSaving(false); return;
    }

    const emailChanged = nextEmail !== (user.email ?? "").toLowerCase();
    const { error: updateAuthError } = await supabase.auth.updateUser({
      ...(emailChanged ? { email: nextEmail } : {}),
      data: { full_name: nextName, whatsapp: profile.whatsapp.trim(), avatar_url: avatarUrl },
    });
    if (updateAuthError) {
      await supabase.from("profiles").upsert({ id: user.id, ...oldProfile, updated_at: new Date().toISOString() }, { onConflict: "id" });
      if (uploadedPath) await supabase.storage.from("shiap-catalog-images").remove([uploadedPath]);
      setError(`Pembaruan akun gagal: ${updateAuthError.message}`); setSaving(false); return;
    }

    setProfile({ full_name: nextName, whatsapp: profile.whatsapp.trim(), avatar_url: avatarUrl });
    setSelectedAvatar(null); setPreviewUrl(""); setRemoveAvatar(false);
    window.dispatchEvent(new Event("shiap-admin-profile-updated"));
    if (emailChanged) setEmailChangePending(nextEmail);
    setNotice(emailChanged ? "Profil tersimpan. Permintaan perubahan email dikirim; ikuti konfirmasi melalui email lama dan email baru." : "Profil admin berhasil diperbarui.");
    setSaving(false);
  }

  async function requestPasswordReset() {
    setError(""); setNotice("");
    if (!email.trim()) { setError("Tambahkan email yang valid sebelum meminta reset password."); return; }
    setSendingReset(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    if (resetError) setError(`Tautan reset password gagal dikirim: ${resetError.message}`);
    else setNotice(`Tautan untuk membuat password baru telah dikirim ke ${email.trim()}. Periksa inbox dan folder spam.`);
    setSendingReset(false);
  }

  if (loading) return <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500"><LoaderCircle size={17} className="animate-spin"/>Memuat profil admin…</div>;

  return <div className="mx-auto max-w-4xl space-y-5">
    <header><p className="text-[9px] font-extrabold tracking-[.2em] text-[#1974FF]">ADMIN / ACCOUNT SECURITY</p><h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[#0A2E63]">Profil Admin</h2><p className="mt-1 text-sm text-slate-500">Kelola identitas, foto, kontak, email masuk, dan keamanan akun.</p></header>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {notice && <p role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800"><CheckCircle2 size={15} className="mt-0.5 shrink-0"/>{notice}</p>}

    <form onSubmit={saveProfile} className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 pb-5">
          {avatar ? <Image src={avatar} alt="Foto profil admin" width={76} height={76} unoptimized className="h-[76px] w-[76px] rounded-2xl border border-slate-200 object-cover"/> : <span className="flex h-[76px] w-[76px] items-center justify-center rounded-2xl bg-blue-50 text-[#1974FF]"><UserRound size={30}/></span>}
          <div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-[#0A2E63]">Foto Profil</h3><p className="mt-1 text-[10px] leading-4 text-slate-500">JPG, PNG, atau WebP · maksimal 5 MB. Foto hanya dapat dikelola pemilik akun ini.</p><div className="mt-3 flex flex-wrap gap-2"><label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#1974FF] px-3 py-2 text-[10px] font-bold text-white hover:bg-[#0A2E63] ${saving?"pointer-events-none opacity-60":""}`}><Camera size={14}/>{avatar?"Ganti foto":"Unggah foto"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={saving} onChange={(event)=>{const file=event.target.files?.[0];event.currentTarget.value="";if(!file)return;setError("");if(!AVATAR_TYPES.includes(file.type)){setError("Pilih foto berformat JPG, PNG, atau WebP.");return;}if(file.size<=0||file.size>MAX_AVATAR_SIZE){setError("Ukuran foto maksimal 5 MB.");return;}setPreviewUrl(URL.createObjectURL(file));setSelectedAvatar(file);setRemoveAvatar(false);}}/></label>{avatar&&<button type="button" disabled={saving} onClick={()=>{setSelectedAvatar(null);setPreviewUrl("");setRemoveAvatar(true);}} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Trash2 size={13}/>Hapus foto</button>}</div></div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">Nama admin<input required autoComplete="name" maxLength={160} value={profile.full_name} onChange={(event)=>update("full_name",event.target.value)} placeholder="Nama lengkap" className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-[#0A2E63] outline-none focus:border-[#1974FF] focus:ring-2 focus:ring-blue-100"/></label>
          <label className="text-xs font-semibold text-slate-600">WhatsApp<input autoComplete="tel" inputMode="tel" maxLength={40} value={profile.whatsapp} onChange={(event)=>update("whatsapp",event.target.value)} placeholder="08xxxxxxxxxx" className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-[#0A2E63] outline-none focus:border-[#1974FF] focus:ring-2 focus:ring-blue-100"/></label>
          <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Email untuk login<input required type="email" autoComplete="email" maxLength={254} value={email} onChange={(event)=>setEmail(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-[#0A2E63] outline-none focus:border-[#1974FF] focus:ring-2 focus:ring-blue-100"/><span className="mt-1.5 flex items-center gap-1.5 text-[10px] font-normal text-slate-400"><AtSign size={12}/>Perubahan email harus dikonfirmasi melalui pesan yang dikirim Supabase.</span>{emailChangePending&&<span className="mt-1 block text-[10px] font-semibold text-amber-700">Menunggu konfirmasi: {emailChangePending}</span>}</label>
        </div>
      </section>
      <button type="submit" disabled={saving||!accountId} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1974FF] px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#0A2E63] disabled:opacity-50">{saving?<LoaderCircle size={15} className="animate-spin"/>:<Save size={15}/>} {saving?"Menyimpan profil…":"Simpan profil admin"}</button>
    </form>

    <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1974FF]"><KeyRound size={19}/></span><div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-[#0A2E63]">Reset password</h3><p className="mt-1 text-xs leading-5 text-slate-500">Kami mengirim tautan aman ke email akun untuk membuat password baru. Tautan hanya dapat digunakan melalui sesi pemulihan Supabase.</p><p className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-slate-500"><Mail size={12}/>{email||"Email belum tersedia"}</p><button type="button" disabled={sendingReset||!email} onClick={()=>void requestPasswordReset()} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-blue-200 px-4 py-2.5 text-[10px] font-bold text-[#1974FF] transition hover:bg-blue-50 disabled:opacity-50">{sendingReset?<LoaderCircle size={14} className="animate-spin"/>:<ShieldCheck size={14}/>} {sendingReset?"Mengirim tautan…":"Kirim tautan reset password"}</button></div></div>
    </section>
    <p className="rounded-xl bg-[#F8FAFD] p-3 text-[10px] leading-5 text-slate-500">Email dan password dikelola oleh Supabase Auth. Foto dan informasi kontak tersimpan pada profil akun admin. Akses admin tetap dibatasi oleh role admin yang terdaftar.</p>
  </div>;
}
