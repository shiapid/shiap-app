import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StayDetailClient, { type StayDetailData } from "@/components/stays/stay-detail-client";
export const revalidate=60;
export default async function StayDetailPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const supabase=await createClient();const {data,error}=await supabase.from("stay_properties").select("*,stay_room_types(*)").eq("slug",slug).eq("status","published").maybeSingle();if(error||!data)notFound();const {data: mode}=await supabase.rpc("stay_booking_mode",{p_property:data.id});return <StayDetailClient property={data as StayDetailData} bookingMode={typeof mode==="string"?mode:"UNAVAILABLE"}/>;}
