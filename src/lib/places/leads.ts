import { normalizeIdPhone } from "./utils.ts";
export const PLACES_PRIVACY_VERSION = "places-contact-v1-2026-11-19";
export function validatePlacesLead(value: unknown) {
 if (!value || typeof value !== "object" || Array.isArray(value)) return null;
 const v=value as Record<string, unknown>;
 const name=typeof v.name==="string"?v.name.trim().replace(/\s+/g," "):"";
 const phone=typeof v.phone==="string" && v.phone.length<=40?normalizeIdPhone(v.phone):null;
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if(name.length<2||name.length>100||/[\u0000-\u001f<>]/.test(name)||!phone||typeof v.propertyId!=="string"||!uuid.test(v.propertyId)||typeof v.requestId!=="string"||!uuid.test(v.requestId)||v.privacyVersion!==PLACES_PRIVACY_VERSION||v.website) return null;
 return {name,phone,propertyId:v.propertyId,requestId:v.requestId};
}
