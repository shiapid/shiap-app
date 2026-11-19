import 'server-only';
import {partnerIdentity,requirePlacesMember} from '@/lib/places/partner';
import {BookingError,uuidPattern} from '@/lib/customer-bookings';
export async function requireBillingOwner(propertyId:string){const identity=await requirePlacesMember(propertyId);if(identity.role!=='OWNER')throw new BookingError('Kewenangan owner diperlukan.',403);return identity;}
export async function requireBillingInvoice(id:string){if(!uuidPattern.test(id))throw new BookingError('Invoice tidak tersedia.',404);const identity=await partnerIdentity();const result=await identity.client.from('places_billing_invoices').select('*').eq('id',id).maybeSingle();if(result.error||!result.data)throw new BookingError('Invoice tidak tersedia.',404);return {...identity,invoice:result.data};}
