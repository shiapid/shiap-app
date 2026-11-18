import { createClient } from "@/lib/supabase/server";
import StayCatalogClient, { type StayCatalogItem } from "@/components/stays/stay-catalog-client";
export const revalidate=60;
export default async function StayPage(){const supabase=await createClient();const {data}=await supabase.from("stay_properties").select("id,slug,name,location,short_description,cover_image_url,facilities,featured,stay_room_types(id,name,capacity,weekday_price,weekend_price,status)").eq("status","published").order("featured",{ascending:false});return <StayCatalogClient properties={(data||[]) as StayCatalogItem[]}/>;}
