import "server-only";
import {bookingAdmin} from "@/lib/supabase/booking-admin";
import {normalizeIdPhone} from "./utils";
export async function placesBusinessContact(){try{const {data,error}=await bookingAdmin().from("shiap_business_contact_settings").select("contact_name,whatsapp,email,website").eq("id",true).maybeSingle();if(error||!data)return null;const phone=normalizeIdPhone(data.whatsapp||"");const email=typeof data.email==="string"&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)?data.email:null;return {name:data.contact_name||"SHIAP",phone,email,website:data.website};}catch{return null;}}
