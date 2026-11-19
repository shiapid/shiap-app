"use client";
import Link from "next/link";
import {recordPlacesMetric} from "./premium-metrics";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { normalizeIdPhone } from "@/lib/places/utils";
import { PLACES_PRIVACY_VERSION } from "@/lib/places/leads";

export function PlacesWhatsAppLink({href,propertyId,className,label="Hubungi WhatsApp",trackPremium=false}:{href:string;propertyId:string;refCode:string;className?:string;label?:string;trackPremium?:boolean}) {
 const dialog=useRef<HTMLDialogElement>(null);const requestId=useRef("");
 const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [name,setName]=useState("");const [phone,setPhone]=useState("");const [error,setError]=useState("");
 useEffect(()=>{if(open&&!dialog.current?.open)dialog.current?.showModal();},[open]);
 async function submit(event:React.FormEvent){event.preventDefault();if(busy)return;const normalized=normalizeIdPhone(phone);if(name.trim().length<2||!normalized){setError("Isi nama dan nomor WhatsApp Indonesia yang valid.");return;}setBusy(true);setError("");
 try{const response=await fetch("/api/places/leads",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({propertyId,name:name.trim(),phone:normalized,requestId:requestId.current,privacyVersion:PLACES_PRIVACY_VERSION})});const result=await response.json();if(!response.ok||!result.url)throw new Error(result.error||"Kontak belum tersimpan.");const url=new URL(result.url);if(url.origin!=="https://wa.me")throw new Error("Tautan kontak tidak valid.");window.location.assign(url.href);}catch(e){setError(e instanceof Error?e.message:"Kontak belum tersimpan. Silakan coba lagi.");}finally{setBusy(false);}}
 return <><button type="button" className={className} onClick={()=>{if(trackPremium)recordPlacesMetric(propertyId,"PREMIUM_CTA");requestId.current=crypto.randomUUID();setName("");setPhone("");setError("");setOpen(true);}}><MessageCircle size={16} aria-hidden="true"/>{label}</button>
 <dialog ref={dialog} onClose={()=>setOpen(false)} onCancel={()=>setOpen(false)} aria-labelledby={'contact-title-'+propertyId} className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-[#0A2E63] shadow-xl backdrop:bg-[#0A2E63]/50 sm:inset-0 sm:m-auto sm:max-w-md sm:rounded-2xl">
 {open?<><div className="flex items-center justify-between gap-3"><h2 id={'contact-title-'+propertyId} className="text-lg font-extrabold">Hubungi properti</h2><button type="button" aria-label="Tutup formulir kontak" onClick={()=>dialog.current?.close()} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-slate-100"><X size={20}/></button></div>
 <form onSubmit={submit} className="mt-3 space-y-3"><label className="block text-xs font-bold">Nama<input autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={e=>{setName(e.target.value);requestId.current=crypto.randomUUID();}} className="mt-1 h-12 w-full rounded-xl border border-slate-200 px-3 text-base"/></label><label className="block text-xs font-bold">Nomor WhatsApp<input autoComplete="tel" inputMode="tel" type="tel" required maxLength={40} placeholder="08… atau +62…" value={phone} onChange={e=>{setPhone(e.target.value);requestId.current=crypto.randomUUID();}} className="mt-1 h-12 w-full rounded-xl border border-slate-200 px-3 text-base"/></label>
 <p className="text-xs leading-5 text-slate-500">Dengan melanjutkan, nama dan WhatsApp Anda disimpan SHIAP untuk menindaklanjuti minat pada properti ini, bukan untuk promosi otomatis. <Link href="/places/privacy" target="_blank" className="font-bold text-[#1265D8] underline">Kebijakan Privasi</Link>.</p>
 {error?<div role="alert" className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900"><p>{error} Belum ada konfirmasi lead tersimpan.</p><a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center font-bold underline">Hubungi properti langsung</a></div>:null}
 <button disabled={busy} className="min-h-12 w-full rounded-xl bg-[#1265D8] px-4 text-sm font-bold text-white disabled:opacity-50">{busy?"Menyimpan…":"Lanjut ke WhatsApp"}</button></form></>:null}</dialog></>;
}
