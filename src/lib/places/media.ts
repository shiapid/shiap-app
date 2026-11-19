export const PLACES_MEDIA_BUCKET="places-premium-media";
export const MAX_PLACES_MEDIA_BYTES=5*1024*1024;
export const placesMediaUrl=(id:string)=>"https://app.shiap.id/api/places/media/"+id;
export function profileUsesMedia(profile:unknown,id:string){if(!profile||typeof profile!=="object")return false;const p=profile as Record<string,unknown>;return [p.cover_image_url,...(Array.isArray(p.gallery_urls)?p.gallery_urls:[])].some(v=>{try{const u=new URL(String(v));return u.origin==="https://app.shiap.id"&&u.pathname==="/api/places/media/"+id;}catch{return false;}});}
