import Link from "next/link";
import {requireAdmin} from "@/lib/admin/guard";
import {createClient} from "@/lib/supabase/server";
import {AdminPremiumManager,type PremiumDraftRow} from "@/components/places/premium-editor";
export const dynamic="force-dynamic";
export default async function Page(){await requireAdmin();const c=await createClient();const [p,d]=await Promise.all([c.from("places_properties").select("id,name").neq("status","archived").order("name"),c.from("places_property_profiles").select("*")]);return <div className="space-y-5 text-[#0A2E63]"><Link href="/admin/places" className="text-xs font-bold text-[#1265D8]">← Admin Places</Link><header><h1 className="text-2xl font-extrabold">Places Premium · Konten digital</h1><p className="mt-2 text-sm text-slate-500">Website &amp; marketing properti. Ini bukan PMS dan tidak mengubah booking Stay.</p></header>{p.error||d.error?<p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm">Fondasi Premium belum tersedia. Free Places tetap dapat digunakan.</p>:<AdminPremiumManager properties={p.data||[]} profiles={(d.data||[]) as PremiumDraftRow[]}/>}</div>;}
