"use client";
import { useEffect, useId, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { whatsappUrl } from "@/lib/notifications/messages";

export default function BookingWhatsApp({bookingId}: {bookingId:string}) {
  const [open,setOpen] = useState(false);
  const [templates,setTemplates] = useState<{id:string;label:string}[]>([]);
  const [template,setTemplate] = useState("booking_created");
  const [prepared,setPrepared] = useState<{id:string;phone:string;message:string}|null>(null);
  const [message,setMessage] = useState("");
  const [notice,setNotice] = useState("");
  const [busy,setBusy] = useState(false);
  const [state,setState] = useState("selected");
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const endpoint = "/api/admin/bookings/" + bookingId + "/whatsapp";
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    let active = true;
    void fetch(endpoint,{cache:"no-store"}).then(async(response) => {
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (active) setTemplates(body.templates);
    }).catch(() => { if(active) setNotice("Template belum dapat dimuat. Coba lagi."); });
    return () => { active=false; };
  },[open,endpoint]);
  async function action(action:string) {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,template,id:prepared?.id})});
      const body=await response.json();
      if(!response.ok) throw new Error(body.error || "Aktivitas gagal dicatat.");
      if(action==="prepare") { setPrepared(body);setMessage(body.message);setState("selected"); }
      else { setState(action);setNotice(action==="opened" ? "WhatsApp dibuka. Belum dikonfirmasi terkirim." : "Dikonfirmasi terkirim secara manual oleh operator. Status delivered tidak diketahui."); }
    } catch(error) {setNotice(error instanceof Error ? error.message : "Coba lagi.");}
    finally {setBusy(false);}
  }
  const url=prepared ? whatsappUrl(prepared.phone,message) : null;
  return <>
    <button type="button" aria-label="WhatsApp pelanggan" onClick={()=>setOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-white px-3 text-xs font-bold text-emerald-800"><MessageCircle size={16}/><span>WhatsApp</span></button>
    {open && <dialog ref={dialog} onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)} aria-labelledby={title} className="m-auto w-[calc(100%_-_24px)] max-h-[90dvh] overflow-y-auto max-w-lg rounded-2xl border border-slate-200 p-4 text-[#0A2E63] backdrop:bg-[#0A2E63]/40">
      <div className="flex items-center justify-between gap-2"><h2 id={title} className="font-bold">WhatsApp pelanggan</h2><button type="button" aria-label="Tutup WhatsApp" onClick={()=>{dialog.current?.close();setOpen(false);}} className="grid size-11 place-items-center"><X size={20}/></button></div>
      <p className="text-xs text-slate-600">Tinjau penerima dan pesan. Anda tetap harus menekan Send di WhatsApp.</p>
      <label className="mt-3 block text-xs">Template<select value={template} onChange={(event)=>{setTemplate(event.target.value);setPrepared(null);setMessage("");}} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-2">{templates.map((item)=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <button type="button" disabled={busy || !templates.length} onClick={()=>void action("prepare")} className="mt-2 min-h-11 rounded-xl bg-[#1265D8] px-3 text-sm font-bold text-white disabled:opacity-50">Buat preview</button>
      {prepared && <div className="mt-3 space-y-2"><p className="break-all text-sm">Penerima: <strong>+{prepared.phone}</strong></p><label className="block text-xs">Pesan<textarea maxLength={6000} rows={8} value={message} onChange={(event)=>setMessage(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-sm"/></label><div className="flex flex-wrap gap-2">
        {url && <a href={url} target="_blank" rel="noopener noreferrer" onClick={()=>{if(state==="selected") void action("opened");}} className="inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-3 text-sm font-bold text-white">Buka WhatsApp</a>}
        <button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(message);setNotice("Pesan disalin. Pengiriman belum dikonfirmasi.");}catch{setNotice("Pilih dan salin teks secara manual.");}}} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm">Salin pesan</button>
        {state==="opened" && <button type="button" disabled={busy} onClick={()=>void action("manual_sent")} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm">Saya sudah menekan Send</button>}
      </div></div>}
      {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
    </dialog>}
  </>;
}
