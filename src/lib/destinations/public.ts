import "server-only";
import {createClient} from '@/lib/supabase/server';
import type {DestinationOption} from './types';
export async function publicDestinations(){try{const client=await createClient();const rows:DestinationOption[]=[];for(let start=0;;start+=500){const {data,error}=await client.from('destinations_public_v').select('id,slug,name,canonical_name,destination_type,parent_id,parent_name,country_code,province,city,aliases,sort_order,is_active,archived_at').order('sort_order').order('name').order('id').range(start,start+499);if(error)return [];rows.push(...data);if(data.length<500)break;}return rows;}catch{return [];}}
