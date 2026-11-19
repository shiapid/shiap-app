export const DESTINATION_TYPES = {city:"Kota",tourism_area:"Kawasan wisata",beach:"Pantai",island:"Pulau",archipelago:"Kepulauan",mountain:"Gunung",lake:"Danau",waterfall:"Air terjun",other_attraction:"Atraksi lainnya"} as const;
export type DestinationOption={id:string;slug:string;name:string;canonical_name:string;destination_type:string;parent_id:string|null;parent_name?:string|null;country_code:string;province:string|null;city:string|null;aliases:string[];sort_order:number;is_active:boolean;archived_at:string|null};
export type MasterDestination=DestinationOption & {description:string|null;cover_image_url:string|null;latitude:number|null;longitude:number|null;version:number};
export type DestinationConnection={destination_id:string;domain:string;service_id:string;service_name:string;status:string};
export const eligibleDestination=(d:DestinationOption)=>d.is_active&&!d.archived_at;
export function destinationLabel(d:DestinationOption){return [d.name,[d.parent_name,d.city,d.province,d.country_code].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', ')].filter(Boolean).join(' · ');}
export function filterDestinations(options:DestinationOption[],query:string,selected:string[]=[]){const q=query.toLocaleLowerCase('id').trim();return options.filter(d=>(eligibleDestination(d)||selected.includes(d.id))&&(!q||selected.includes(d.id)||[destinationLabel(d),...(d.aliases||[])].join(' ').toLocaleLowerCase('id').includes(q)));}
export function validateDestinationInput(input:unknown){
 if(!input||typeof input!=="object"||Array.isArray(input))return null;const v=input as Record<string,unknown>;
 const name=typeof v.name==='string'?v.name.trim():'';const city=typeof v.city==='string'?v.city.trim():'';const province=typeof v.province==='string'?v.province.trim():'';const country=typeof v.country_code==='string'?v.country_code.trim().toUpperCase():'ID';
 const type=typeof v.destination_type==='string'?v.destination_type:'other_attraction';const aliases=Array.isArray(v.aliases)?v.aliases:[];const parent=typeof v.parent_id==='string'?v.parent_id:'';
 const coordinate=(x:unknown)=>x===''||x==null?null:typeof x==='string'||typeof x==='number'?Number(x):NaN;const latitude=coordinate(v.latitude),longitude=coordinate(v.longitude);const order=Number(v.sort_order||0);
 const description=typeof v.description==='string'?v.description.trim():'';const cover=typeof v.cover_image_url==='string'?v.cover_image_url.trim():'';
 if(name.length<2||name.length>120||city.length>120||province.length>120||!/^[A-Z]{2}$/.test(country)||!Object.hasOwn(DESTINATION_TYPES,type)||aliases.length>20||aliases.some(a=>typeof a!=='string'||a.length>120)||description.length>2000||!Number.isInteger(order)||Math.abs(order)>100000||(parent&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parent))||(latitude===null)!==(longitude===null)||latitude!==null&&(!Number.isFinite(latitude)||Math.abs(latitude)>90)||longitude!==null&&(!Number.isFinite(longitude)||Math.abs(longitude)>180))return null;
 if(cover){try{const u=new URL(cover);if(u.protocol!=='https:'||u.username||u.password||cover.length>2048)return null;}catch{return null;}}
 return {name,city,province,country_code:country,destination_type:type,parent_id:parent,aliases:aliases as string[],description,cover_image_url:cover,latitude,longitude,sort_order:order};
}
