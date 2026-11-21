create temp table unified_fixture (
  trip uuid default gen_random_uuid(), category uuid default gen_random_uuid(), product uuid default gen_random_uuid(),
  catalog uuid default gen_random_uuid(), package uuid default gen_random_uuid(), stay_trip uuid, stay_exp uuid,
  trip_exp uuid, all_three uuid, reject_order uuid, exp_stay uuid
);
insert into unified_fixture default values;
insert into public.trip_packages(id,title,slug,location,status,pricing_model,base_price,min_pax,max_pax)
select trip,'QA Trip',trip::text,'QA only','published','open_per_person',120000,1,2 from unified_fixture;
insert into public.trip_departures(trip_id,departure_date,end_date,departure_time,price_per_person,min_participants,max_participants,status)
select trip,current_date+n,current_date+n,time '08:00',120000,1,2,'open'
from unified_fixture cross join unnest(array[101,102,103,104,105,106]) n;
insert into public.shiap_experience_categories(id,slug,name) select category,category::text,'QA experience category' from unified_fixture;
insert into public.shiap_experience_products(id,category_id,slug,title,status)
select product,category,product::text,'QA experience','published' from unified_fixture;
insert into public.shiap_experiences(id,experience_type,title,slug,base_price,price_basis,status,catalog_category)
select catalog,'activity','QA experience catalog',catalog::text,150000,'per_person','published','activity' from unified_fixture;
insert into public.shiap_experience_packages(id,product_id,catalog_service_id,slug,title,price,pricing_basis,booking_mode,min_guests,max_guests,status,requires_manual_approval)
select package,product,catalog,package::text,'QA experience package',150000,'per_person','request_to_book',1,2,'published',true from unified_fixture;
insert into public.internal_vendor_contacts(trip_id,name,whatsapp) select trip,'QA vendor Trip','6280000000000' from unified_fixture;
insert into public.internal_vendor_contacts(experience_id,name,whatsapp) select product,'QA vendor Experience','6280000000001' from unified_fixture;
select set_config('request.jwt.claim.sub',(select admin::text from f),true);
update public.service_fee_settings set enabled=true,mode='fixed',fixed_amount=3500 where category in ('trip','stay','activity');
update public.payment_settings set bank_name='Synthetic QA',account_number='1234567890',is_active=true where id;

create function pg_temp.unified_book(day_offset integer, services text[], request_id uuid default gen_random_uuid())
returns uuid language plpgsql as $$
declare items jsonb:='[]'; data jsonb;
begin
  if 'stay'=any(services) then
    items:=items||jsonb_build_array((select jsonb_build_object('service_type','stay','property_id',stay,'room_type_id',room,
      'date_start',current_date+day_offset,'date_end',current_date+day_offset+1,'quantity',1,'guests',2) from f));
  end if;
  if 'trip'=any(services) then
    items:=items||jsonb_build_array((select jsonb_build_object('service_type','trip','trip_id',u.trip,'departure_id',d.id,
      'date_start',d.departure_date,'guests',2) from unified_fixture u join public.trip_departures d on d.trip_id=u.trip
        where d.departure_date=current_date+day_offset));
  end if;
  data:=jsonb_build_object('p_customer_name','QA Customer','p_customer_whatsapp','620000000000','p_items',items);
  if 'experience'=any(services) then
    data:=data||jsonb_build_object('experience',(select jsonb_build_object('p_package_id',package,'p_date',current_date+day_offset,
      'p_guests',1,'p_participants','[{"full_name":"QA Guest","health_screening_confirmed":true,"safety_rules_accepted":true}]'::jsonb,
      'p_safety_consent',true,'p_session_id',(select v.id from public.shiap_experience_sessions v where v.package_id=package and (v.starts_at at time zone 'Asia/Makassar')::date=current_date+day_offset limit 1)) from unified_fixture));
  end if;
  return (select b.id from public.checkout_booking((select customer from f),null,request_id,data,'unified') b);
end $$;
