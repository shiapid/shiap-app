"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { notificationLabels } from "@/lib/notifications/messages";

type Event = {id:string;booking_id:string|null;event_type:string;priority:string;created_at:string;booking_orders:{order_number:string}|null;notification_reads:{admin_id:string}[]};
type Failure = {id:string;state:string;attempts:number;last_error:string;notification_events:{booking_id:string;event_type:string}|null};
function useNotifications(type="") {
  const [data,setData] = useState<{events:Event[];unread:number;failures:Failure[]}|null>(null);
  const [error,setError] = useState("");
  const load = useCallback(async(signal?:AbortSignal)=>{
    try {
      const response=await fetch("/api/admin/notifications"+(type?"?type="+encodeURIComponent(type):""),{cache:"no-store",signal});
      if(!response.ok) throw new Error();
      const body=await response.json();
      if(!signal?.aborted){setData(body);setError("");}
    } catch {if(!signal?.aborted)setError("Notifikasi belum dapat dimuat. Periksa sesi atau coba lagi.");}
  },[type]);
  useEffect(()=>{
    const controller=new AbortController();
    const initial=setTimeout(()=>void load(controller.signal),0);
    const timer=setInterval(()=>{if(document.visibilityState==="visible")void load(controller.signal);},30000);
    const refresh=()=>void load(controller.signal);
    window.addEventListener("shiap-notifications-read",refresh);
    return()=>{controller.abort();clearTimeout(initial);clearInterval(timer);window.removeEventListener("shiap-notifications-read",refresh);};
  },[load]);
  return {data,error,load};
}
export function NotificationBell() {
  const {data,error}=useNotifications();
  return <Link href="/admin/notifications" aria-label={error ? "Notifikasi belum tersedia" : `Notifikasi, ${data?.unread ?? 0} belum dibaca`} className="relative grid size-11 shrink-0 place-items-center rounded-xl text-[#0A2E63] hover:bg-blue-50"><Bell size={20}/>{data && data.unread>0 && <span className="absolute right-0 top-0 rounded-full bg-[#FF8518] px-1.5 text-[10px] font-bold text-white">{data.unread>99?"99+":data.unread}</span>}{error && <span className="absolute right-1 top-1 text-xs text-orange-700">!</span>}</Link>;
}
export default function NotificationCenter() {
  const [type,setType]=useState("");
  const {data,error,load}=useNotifications(type);
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  async function read(id:string|null) {
    setBusy(true);setNotice("");
    try{
      const response=await fetch("/api/admin/notifications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});
      if(!response.ok)throw new Error();
      window.dispatchEvent(new Event("shiap-notifications-read"));
      await load();
    }catch{setNotice("Status baca belum tersimpan. Coba lagi.");}finally{setBusy(false);}
  }
  return <div className="mx-auto max-w-3xl space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-xl font-bold text-[#0A2E63]">Notifikasi</h1><button type="button" disabled={busy || !data?.unread} onClick={()=>void read(null)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#1265D8] disabled:opacity-50">Tandai semua dibaca</button></div>
    <label className="block text-xs text-slate-600">Jenis notifikasi<select aria-label="Filter notifikasi" value={type} onChange={(event)=>setType(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Semua jenis</option>{Object.entries(notificationLabels).filter(([key])=>!["payment_reminder","travel_reminder"].includes(key)).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    {(error || notice) && <p role="alert" className="rounded-xl bg-orange-50 p-3 text-sm text-orange-900">{error || notice} <button onClick={()=>void load()} className="min-h-11 font-bold">Coba lagi</button></p>}
    {!data && !error && <p role="status">Memuat notifikasi…</p>}
    {data && !data.events.length && <p className="rounded-xl bg-white p-4 text-sm text-slate-600">Belum ada notifikasi untuk filter ini.</p>}
    <ul className="space-y-2">{data?.events.map((event)=><li key={event.id} data-notification-id={event.id} className={"rounded-xl border p-3 "+(event.notification_reads.length?"border-slate-200 bg-white":"border-blue-200 bg-blue-50")}>
      <div className="flex flex-wrap items-start justify-between gap-1"><p className="min-w-0 break-words text-sm font-bold text-[#0A2E63]">{notificationLabels[event.event_type]}{!event.notification_reads.length && <span className="ml-2 text-xs text-[#1265D8]">Baru</span>}</p>{event.priority==="high" && <span className="rounded-full bg-orange-100 px-2 py-1 text-xs text-orange-900">Prioritas</span>}</div>
      <p className="mt-1 text-xs text-slate-600">{new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short"}).format(new Date(event.created_at))}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-4">{event.booking_id && <Link href={"/admin/bookings/"+event.booking_id} className="inline-flex min-h-11 items-center break-all text-sm font-bold text-[#1265D8]">{event.booking_orders?.order_number || "Buka booking"}</Link>}{!event.notification_reads.length && <button disabled={busy} onClick={()=>void read(event.id)} className="min-h-11 text-xs font-semibold text-slate-600">Tandai dibaca</button>}</div>
    </li>)}</ul>
    {data && data.failures.length>0 && <section className="space-y-2 rounded-xl border border-orange-200 bg-white p-3"><h2 className="font-bold text-[#0A2E63]">Pengiriman email perlu perhatian</h2>{data.failures.map((failure)=><article key={failure.id} className="break-words border-t border-slate-100 py-2 text-xs text-slate-600"><p>{notificationLabels[failure.notification_events?.event_type || ""]} · {failure.state==="retry"?"Menunggu percobaan ulang":"Gagal permanen / perlu pemeriksaan"} · {failure.attempts} percobaan</p><p>{failure.last_error}</p>{failure.notification_events?.booking_id && <Link href={"/admin/bookings/"+failure.notification_events.booking_id} className="inline-flex min-h-11 items-center font-bold text-[#1265D8]">Buka booking</Link>}</article>)}</section>}
  </div>;
}
