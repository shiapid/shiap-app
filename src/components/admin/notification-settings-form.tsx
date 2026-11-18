"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { notificationLabels } from "@/lib/notifications/messages";
type Settings={email_enabled:boolean;sender_name:string;admin_email:string;email_events:string[];payment_reminders:boolean;reminder_minutes:number;travel_reminders:boolean};
type Template={id:string;label:string;body:string;enabled:boolean};
export default function NotificationSettingsForm(){
  const client=useMemo(()=>createClient(),[]);
  const [settings,setSettings]=useState<Settings|null>(null);
  const [templates,setTemplates]=useState<Template[]>([]);
  const [provider,setProvider]=useState(false);
  const [testConfirmed,setTestConfirmed]=useState(false);
  const [testId,setTestId]=useState("");
  const [code,setCode]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch("/api/admin/notifications/settings",{cache:"no-store",signal:controller.signal}).then(async(response)=>{if(!response.ok)throw new Error();return response.json();}).then((body)=>{setSettings(body.settings);setTemplates(body.templates);setProvider(body.providerConfigured);setTestConfirmed(body.testConfirmed);}).catch(()=>{if(!controller.signal.aborted)setNotice("Pengaturan notifikasi belum tersedia. Muat ulang atau periksa migration.");});
    return()=>controller.abort();
  },[]);
  async function save(event:React.FormEvent){
    event.preventDefault();setBusy(true);setNotice("");
    try{const response=await fetch("/api/admin/notifications/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(settings)});const body=await response.json();if(!response.ok)throw new Error(body.error);setNotice("Pengaturan notifikasi tersimpan.");}catch(error){setNotice(error instanceof Error?error.message:"Gagal menyimpan. Coba lagi.");}finally{setBusy(false);}
  }
  async function saveTemplate(template:Template){
    setBusy(true);setNotice("");
    try{const result=await client.from("notification_whatsapp_templates").update({body:template.body,enabled:template.enabled}).eq("id",template.id).select("id").maybeSingle();if(result.error || !result.data)throw new Error();setNotice("Template WhatsApp tersimpan.");}catch{setNotice("Template gagal disimpan. Periksa sesi Admin dan panjang pesan (1–4000 karakter).");}finally{setBusy(false);}
  }
  const input="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm";
  async function testEmail(action:"send"|"confirm"){
    setBusy(true);setNotice("");
    try{const response=await fetch("/api/admin/notifications/test-email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,id:testId,code})});const body=await response.json();if(!response.ok)throw new Error(body.error || "Email uji gagal.");if(body.id)setTestId(body.id);if(body.confirmed){setTestConfirmed(true);setTestId("");setCode("");}setNotice(body.message);}catch(error){setNotice(error instanceof Error?error.message:"Email uji gagal. Coba lagi.");}finally{setBusy(false);}
  }
  return <div className="space-y-3">
    <p className="text-sm text-slate-600">Notifikasi Admin dan WhatsApp manual aktif. Email eksternal nonaktif sampai SMTP TLS terverifikasi dan email uji diterima. Tidak ada pesan pemasaran.</p>
    {!provider && <p className="rounded-xl bg-orange-50 p-3 text-sm text-orange-900">SMTP belum siap untuk pengiriman live. Password SMTP dan kredensial cron hanya di server.</p>}
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3"><h3 className="font-bold text-[#0A2E63]">Uji email SMTP cPanel</h3><p className="text-xs text-slate-600">SSL/TLS port 465. Hanya satu email uji ke email internal server atau email akun Admin terverifikasi. Maksimal 3 uji per jam per Admin.</p><p className="text-sm">{testConfirmed?"Email uji sudah dikonfirmasi diterima.":"Penerimaan email uji belum dikonfirmasi."}</p><button type="button" disabled={busy || !provider} onClick={()=>void testEmail("send")} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold text-[#1265D8] disabled:opacity-50">Kirim email uji</button>{testId && <div className="space-y-2"><label className="block text-xs">Kode 6 digit dari inbox Admin<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event)=>setCode(event.target.value)} className={input}/></label><button type="button" disabled={busy || !/^\d{6}$/.test(code)} onClick={()=>void testEmail("confirm")} className="min-h-11 rounded-xl bg-[#1265D8] px-3 text-sm font-bold text-white disabled:opacity-50">Konfirmasi penerimaan email uji</button></div>}</section>
    {settings && <form onSubmit={save} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={!provider || !testConfirmed || busy} checked={settings.email_enabled} onChange={(event)=>setSettings({...settings,email_enabled:event.target.checked})}/>Aktifkan email transaksional</label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="min-w-0 text-xs">Nama pengirim<input required maxLength={80} value={settings.sender_name} onChange={(event)=>setSettings({...settings,sender_name:event.target.value})} className={input}/></label><label className="min-w-0 text-xs">Email internal Admin (opsional)<input type="email" value={settings.admin_email} onChange={(event)=>setSettings({...settings,admin_email:event.target.value})} className={input}/></label></div>
      <fieldset><legend className="text-sm font-bold text-[#0A2E63]">Email pelanggan per event</legend><div className="grid gap-1 sm:grid-cols-2">{Object.entries(notificationLabels).filter(([key])=>!["activity_today","delivery_failed","approval_required"].includes(key)).map(([key,label])=><label key={key} className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={settings.email_events.includes(key)} onChange={(event)=>setSettings({...settings,email_events:event.target.checked?[...settings.email_events,key]:settings.email_events.filter((value)=>value!==key)})}/>{label}</label>)}</div></fieldset>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={settings.payment_reminders} onChange={(event)=>setSettings({...settings,payment_reminders:event.target.checked})}/>Pengingat pembayaran</label>
      <label className="block text-xs">Menit sebelum batas pembayaran (1–10)<input type="number" min="1" max="10" step="1" required value={settings.reminder_minutes} onChange={(event)=>setSettings({...settings,reminder_minutes:Number(event.target.value)})} className={input}/></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={settings.travel_reminders} onChange={(event)=>setSettings({...settings,travel_reminders:event.target.checked})}/>Pengingat perjalanan / check-in</label>
      <button disabled={busy} className="min-h-11 rounded-xl bg-[#1265D8] px-4 text-sm font-bold text-white disabled:opacity-50">Simpan pengaturan notifikasi</button>
    </form>}
    {notice && <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-[#0A2E63]">{notice}</p>}
    <Link href="/admin/notifications" className="inline-flex min-h-11 items-center text-sm font-bold text-[#1265D8]">Lihat notifikasi dan kegagalan email</Link>
    <details className="rounded-xl border border-slate-200 bg-white p-3"><summary className="min-h-11 cursor-pointer font-bold text-[#0A2E63]">Kelola template WhatsApp</summary><p className="mb-3 text-xs text-slate-600">Variabel: {"{{customer_name}}, {{booking_code}}, {{services}}, {{total}}, {{deadline}}, {{bank}}, {{schedule}}, {{location}}, {{booking_url}}, {{access_instructions}}"}. Tidak ada pengiriman otomatis.</p>
      <div className="space-y-3">{templates.map((template)=><div key={template.id} className="space-y-2 border-t border-slate-100 pt-3"><label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input type="checkbox" checked={template.enabled} onChange={(event)=>setTemplates((rows)=>rows.map((row)=>row.id===template.id?{...row,enabled:event.target.checked}:row))}/>{template.label}</label><textarea aria-label={template.label} rows={5} maxLength={4000} value={template.body} onChange={(event)=>setTemplates((rows)=>rows.map((row)=>row.id===template.id?{...row,body:event.target.value}:row))} className="w-full rounded-xl border border-slate-200 p-2 text-sm"/><button type="button" disabled={busy || !template.body.trim()} onClick={()=>void saveTemplate(template)} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm text-[#1265D8]">Simpan template</button></div>)}</div>
    </details>
  </div>;
}
