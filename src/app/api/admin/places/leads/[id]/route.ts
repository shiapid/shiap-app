import { requireApiAdmin } from "@/lib/admin/api-guard";
import { BookingError, boundedBody, privateHeaders, routeError, sameOrigin, uuidPattern } from "@/lib/customer-bookings";
import { bookingAdmin } from "@/lib/supabase/booking-admin";

async function mutate(request:Request, context:{params:Promise<{id:string}>}, remove:boolean) {
  try {
    sameOrigin(request); const user=await requireApiAdmin(); const {id}=await context.params;
    if(!uuidPattern.test(id)) throw new BookingError("Lead tidak valid.");
    let update:Record<string,unknown>;
    if(remove) update={customer_name:"Dihapus",customer_whatsapp:null,deleted_at:new Date().toISOString()};
    else {
      let body;try{body=JSON.parse((await boundedBody(request,256)).toString("utf8"));}catch{throw new BookingError("Status tidak valid.");}
      if(!["NEW","CONTACTED","CLOSED"].includes(body?.status)) throw new BookingError("Status tidak valid.");
      update={followup_status:body.status};
    }
    const {data,error}=await bookingAdmin().from("places_contact_leads").update({...update,updated_at:new Date().toISOString(),updated_by:user.id}).eq("id",id).is("deleted_at",null).select("id").maybeSingle();
    if(error)throw new BookingError("Lead belum dapat diperbarui.",503);
    if(!data)throw new BookingError("Lead tidak ditemukan.",404);
    return Response.json({ok:true},{headers:privateHeaders});
  }catch(error){return routeError(error);}
}
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){return mutate(request,context,false);}
export async function DELETE(request:Request,context:{params:Promise<{id:string}>}){return mutate(request,context,true);}
