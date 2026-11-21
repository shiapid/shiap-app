import "server-only";
import {createClient} from "@/lib/supabase/server";
import {BookingError,uuidPattern} from "@/lib/customer-bookings";
import type { StayV2Access } from "@/lib/stay-v2/plans";
import {bookingAdmin} from "@/lib/supabase/booking-admin";
export async function partnerIdentity(){const client=await createClient();const {data:{user},error}=await client.auth.getUser();if(error||!user)throw new BookingError("Login akun SHIAP diperlukan.",401);if(!user.email_confirmed_at)throw new BookingError("Verifikasi email akun sebelum mengajukan akses partner.",403);return {client,user};}
export async function requirePlacesMember(propertyId:string,write=false){if(!uuidPattern.test(propertyId))throw new BookingError("Properti tidak tersedia.",404);const {client,user}=await partnerIdentity();const {data:admin}=await client.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();if(admin)return {client,user,role:"ADMIN"};const {data,error}=await client.from("places_property_members").select("property_id,role,status,verified_at").eq("property_id",propertyId).eq("user_id",user.id).eq("status","ACTIVE").maybeSingle();if(error||!data||!data.verified_at||write&&!['OWNER','MANAGER'].includes(data.role))throw new BookingError("Akses properti tidak tersedia.",404);return {client,user,role:String(data.role)};}
export async function memberProperty(propertyId:string,write=false){const identity=await requirePlacesMember(propertyId,write);const {data,error}=await bookingAdmin().from("places_properties").select("id,slug,name,destination_id,accommodation_type,stay_property_id,whatsapp_phone,status,contact_verified_at,places_destinations(name,city,province)").eq("id",propertyId).maybeSingle();if(error||!data)throw new BookingError("Properti tidak tersedia.",404);return {...identity,property:data};}

type PartnerIdentity = Awaited<ReturnType<typeof partnerIdentity>>;

export async function stayV2PropertyAccess(client: PartnerIdentity["client"], propertyId: string) {
  const { data } = await client.rpc("stay_v2_property_access", { p_property_ids: [propertyId] });
  return (data as StayV2Access[] | null)?.[0] ?? null;
}
export async function stayV2Memberships({ client, user }: PartnerIdentity) {
  const { data: memberships } = await client.from("places_property_members")
    .select("property_id,role").eq("user_id", user.id).eq("status", "ACTIVE").not("verified_at", "is", null);
  const ids = (memberships ?? []).map(row => row.property_id);
  const { data } = ids.length
    ? await client.rpc("stay_v2_property_access", { p_property_ids: ids })
    : { data: [] };
  return { access: (data as StayV2Access[] | null) ?? [], isOwner: memberships?.some(row => row.role === "OWNER") ?? false };
}

export async function requirePlacesMarketing(propertyId: string, write = false) {
  const identity = await requirePlacesMember(propertyId, write);
  if (identity.role !== "ADMIN" && !(await stayV2PropertyAccess(identity.client, propertyId))?.premium_content) {
    throw new BookingError("Paket pemasaran aktif diperlukan.", 403);
  }
  return identity;
}
