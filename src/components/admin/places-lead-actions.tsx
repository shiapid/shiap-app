"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
export function PlacesLeadActions({id,status}:{id:string;status:string}){
 const router=useRouter();const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 async function update(remove:boolean,status?:string){if(remove&&!window.confirm("Hapus nama dan nomor WhatsApp lead ini? Referensi operasional tetap disimpan tanpa data kontak."))return;setBusy(true);setError("");try{const r=await fetch('/api/admin/places/leads/'+id,{method:remove?'DELETE':'PATCH',headers:{'Content-Type':'application/json'},body:remove?undefined:JSON.stringify({status})});if(!r.ok)throw new Error('Perubahan belum tersimpan.');router.refresh();}catch(e){setError(e instanceof Error?e.message:'Gagal.');}finally{setBusy(false);}}
 return <div className="flex flex-wrap items-center gap-2"><select aria-label="Status tindak lanjut" disabled={busy} value={status} onChange={e=>void update(false,e.target.value)} className="min-h-11 rounded-lg border border-slate-200 px-2 text-xs"><option value="NEW">Baru</option><option value="CONTACTED">Dihubungi</option><option value="CLOSED">Selesai</option></select><button disabled={busy} onClick={()=>void update(true)} className="min-h-11 px-2 text-xs font-bold text-red-700">Hapus data pribadi</button>{error?<p role="alert" className="text-xs text-red-700">{error}</p>:null}</div>;
}
