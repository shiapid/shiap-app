"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, LoaderCircle, ShieldCheck } from "lucide-react";
type Mode = "login" | "register" | "forgot" | "reset";
const copy = {
 login:{title:"Selamat datang kembali",subtitle:"Masuk ke akun SHIAP Anda.",button:"Masuk"},
 register:{title:"Buat akun SHIAP",subtitle:"Simpan profil dan kelola perjalanan Anda.",button:"Buat Akun"},
 forgot:{title:"Lupa password?",subtitle:"Kami akan mengirim tautan pemulihan ke email Anda.",button:"Kirim Tautan"},
 reset:{title:"Buat password baru",subtitle:"Gunakan password baru untuk akun SHIAP Anda.",button:"Simpan Password"},
};
export default function AuthForm({mode}:{mode:Mode}) {
 const router=useRouter(); const supabase=createClient();
 const [name,setName]=useState(""); const [whatsapp,setWhatsapp]=useState(""); const [email,setEmail]=useState("");
 const [password,setPassword]=useState(""); const [confirm,setConfirm]=useState("");
 const [busy,setBusy]=useState(false); const [message,setMessage]=useState(""); const [error,setError]=useState("");
 async function submit(event:FormEvent<HTMLFormElement>) {
  event.preventDefault(); setBusy(true); setError(""); setMessage("");
  try {
   if(mode==="register") {
    if(password.length<8) throw new Error("Password minimal 8 karakter.");
    const {data,error}=await supabase.auth.signUp({email:email.trim(),password,options:{data:{full_name:name.trim(),whatsapp:whatsapp.trim()},emailRedirectTo:`${window.location.origin}/auth/callback?next=/profile`}});
    if(error) throw error;
    if(data.session){router.replace("/profile");router.refresh();} else setMessage("Pendaftaran berhasil. Periksa email untuk verifikasi sebelum login.");
   } else if(mode==="login") {
    const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password}); if(error) throw error; router.replace("/profile");router.refresh();
   } else if(mode==="forgot") {
    const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:`${window.location.origin}/auth/callback?next=/reset-password`}); if(error) throw error; setMessage("Jika email terdaftar, tautan pemulihan akan dikirim. Periksa inbox dan spam.");
   } else {
    if(password.length<8) throw new Error("Password minimal 8 karakter.");
    if(password!==confirm) throw new Error("Konfirmasi password tidak sama.");
    const {error}=await supabase.auth.updateUser({password}); if(error) throw error; setMessage("Password berhasil diperbarui."); setTimeout(()=>router.replace("/profile"),1000);
   }
  } catch(err) {setError(err instanceof Error?err.message:"Terjadi kesalahan. Silakan coba kembali.");}
  finally {setBusy(false);}
 }
 const c=copy[mode];
 return <main className="flex min-h-dvh items-center justify-center bg-[#F5F7FA] px-4 py-10"><div className="w-full max-w-md">
  <Link href="/" className="mb-6 inline-flex items-center gap-2 text-xs font-semibold text-[#1974FF]"><ArrowLeft size={15}/> Kembali ke SHIAP</Link>
  <section className="rounded-[26px] border border-slate-100 bg-white p-6 shadow-[0_12px_40px_rgba(10,46,99,0.07)] sm:p-8">
   <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#1974FF]"><ShieldCheck size={23}/></div>
   <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#1974FF]">SHIAP CUSTOMER ACCOUNT</p><h1 className="mt-2 text-2xl font-bold text-[#0A2E63]">{c.title}</h1><p className="mt-2 text-sm text-slate-500">{c.subtitle}</p>
   <form onSubmit={submit} className="mt-6 space-y-4">
    {mode==="register"&&<><label className="block text-xs font-semibold text-slate-600">Nama lengkap<input required autoComplete="name" value={name} onChange={e=>setName(e.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#1974FF]" placeholder="Nama sesuai identitas"/></label><label className="block text-xs font-semibold text-slate-600">Nomor WhatsApp<input required autoComplete="tel" inputMode="tel" value={whatsapp} onChange={e=>setWhatsapp(e.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#1974FF]" placeholder="08xxxxxxxxxx"/></label></>}
    <label className="block text-xs font-semibold text-slate-600">Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#1974FF]" placeholder="nama@email.com"/></label>
    {(mode==="login"||mode==="register"||mode==="reset")&&<label className="block text-xs font-semibold text-slate-600">Password<input required minLength={8} type="password" autoComplete={mode==="login"?"current-password":"new-password"} value={password} onChange={e=>setPassword(e.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#1974FF]" placeholder="Minimal 8 karakter"/></label>}
    {mode==="reset"&&<label className="block text-xs font-semibold text-slate-600">Konfirmasi password baru<input required minLength={8} type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#1974FF]"/></label>}
    {error&&<p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs text-red-700">{error}</p>}
    {message&&<p role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">{message}</p>}
    <button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1974FF] px-4 text-sm font-bold text-white disabled:opacity-60">{busy&&<LoaderCircle size={16} className="animate-spin"/>}{busy?"Memproses...":c.button}</button>
   </form>
   <div className="mt-5 flex flex-wrap justify-between gap-3 text-xs">
    {mode==="login"&&<><Link href="/register" className="font-semibold text-[#1974FF]">Buat akun baru</Link><Link href="/forgot-password" className="text-slate-500">Lupa password?</Link></>}
    {mode==="register"&&<Link href="/login" className="font-semibold text-[#1974FF]">Sudah punya akun? Masuk</Link>}
    {(mode==="forgot"||mode==="reset")&&<Link href="/login" className="font-semibold text-[#1974FF]">Kembali ke Login</Link>}
   </div><p className="mt-7 text-center text-[10px] font-medium tracking-wide text-slate-300">TRAVEL Â· STAY Â· EXPERIENCE</p>
  </section></div></main>;
}