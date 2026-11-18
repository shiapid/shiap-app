"use client";
import { useMemo } from "react";
import { CirclePlus, Trash2 } from "lucide-react";
type Tier={min_pax:number;max_pax:number;price_per_person:number};
function isRecord(value: unknown): value is Record<string, unknown> {
 return typeof value === "object" && value !== null && !Array.isArray(value);
}
export default function PrivateTierEditor({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const tiers=useMemo<Tier[]>(()=>{try{const parsed:unknown=JSON.parse(value||"[]");return Array.isArray(parsed)?parsed.filter(isRecord).map((tier)=>({min_pax:Number(tier.min_pax??2),max_pax:Number(tier.max_pax??4),price_per_person:Number(tier.price_per_person??tier.price_per_pax??0)})):[];}catch{return[];}},[value]);
 function update(index:number,field:keyof Tier,next:number){onChange(JSON.stringify(tiers.map((t,i)=>i===index?{...t,[field]:next}:t),null,2));}
 function add(){const last=tiers[tiers.length-1];const min=last?last.max_pax+1:2;onChange(JSON.stringify([...tiers,{min_pax:min,max_pax:min+2,price_per_person:0}],null,2));}
 function remove(index:number){onChange(JSON.stringify(tiers.filter((_,i)=>i!==index),null,2));}
 return <section className="rounded-xl border border-slate-200 p-3 sm:col-span-2"><div className="flex items-center justify-between gap-2"><div><p className="text-xs font-bold text-[#0A2E63]">Tier harga Private Trip</p><p className="mt-1 text-[10px] text-slate-400">Isi rentang peserta dan tarif per orang. Minimum pembayaran paket tetap menjadi batas bawah total.</p></div><button type="button" onClick={add} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-50 px-3 py-2 text-[10px] font-bold text-[#1974FF]"><CirclePlus size={13}/> Tambah tier</button></div>
 {tiers.length===0?<p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Belum ada tier harga.</p>:<div className="mt-3 space-y-2">{tiers.map((tier,index)=><div key={index} className="grid grid-cols-[1fr_1fr_1.3fr_auto] items-end gap-2 rounded-lg bg-slate-50 p-2"><label className="text-[10px] font-semibold text-slate-500">Min pax<input type="number" min="1" value={tier.min_pax} onChange={e=>update(index,"min_pax",Number(e.target.value))} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-[#0A2E63]"/></label><label className="text-[10px] font-semibold text-slate-500">Max pax<input type="number" min="1" value={tier.max_pax} onChange={e=>update(index,"max_pax",Number(e.target.value))} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-[#0A2E63]"/></label><label className="text-[10px] font-semibold text-slate-500">Harga / orang<input type="number" min="0" value={tier.price_per_person} onChange={e=>update(index,"price_per_person",Number(e.target.value))} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-[#0A2E63]"/></label><button type="button" onClick={()=>remove(index)} aria-label="Hapus tier" className="mb-1 rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={15}/></button></div>)}</div>}
 </section>;
}
