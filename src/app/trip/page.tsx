import {createClient} from '@/lib/supabase/server';
import {mapTripPackage,type TripPackageRow} from '@/lib/catalog-mappers';
import TripCatalogClient from '@/components/trips/trip-catalog-client';
import {publicDestinations} from '@/lib/destinations/public';
import {PublicDestinationFilter} from '@/components/destinations/public-destination-filter';
export const dynamic='force-dynamic';
export default async function TripPage({searchParams}:{searchParams:Promise<{destination?:string}>}){
 const params=await searchParams;const selected=typeof params.destination==='string'?params.destination:'';const destinations=await publicDestinations();const destination=destinations.find(d=>d.slug===selected||d.id===selected);const supabase=await createClient();
 let query=supabase.from('trip_packages').select('*').eq('status','published').order('featured',{ascending:false}).order('updated_at',{ascending:false});
 if(selected){if(!destination)query=query.eq('id','00000000-0000-0000-0000-000000000000');else{const linked=await supabase.from('trip_destination_links').select('trip_id').eq('destination_id',destination.id);const ids=(linked.data||[]).map(d=>d.trip_id);query=ids.length?query.or('destination_id.eq.'+destination.id+',id.in.('+ids.join(',')+')'):query.eq('destination_id',destination.id);}}
 const {data,error}=await query;const trips=(data||[]).map(row=>mapTripPackage({...row,location:destinations.find(d=>d.id===row.destination_id)?.name||row.location} as TripPackageRow));
 return <TripCatalogClient trips={trips} loadError={error?'Katalog Trip belum dapat dimuat.':null} destinationFilter={<PublicDestinationFilter destinations={destinations} value={destination?.slug||selected} action="/trip"/>}/>;
}
