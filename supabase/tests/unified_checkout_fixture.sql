-- Synthetic Partner onboarding fixture for Unified Checkout tests.
create temp table f(
 admin uuid default gen_random_uuid(), owner_id uuid default gen_random_uuid(), customer uuid default gen_random_uuid(),
 place uuid default gen_random_uuid(), stay uuid default gen_random_uuid(), room uuid default gen_random_uuid(),
 app uuid default gen_random_uuid(), contract uuid default gen_random_uuid(), addon uuid default gen_random_uuid(),
 booking uuid, rejected uuid, instant uuid, proof_id uuid, destination uuid
);
grant all on f to authenticated;
insert into f(destination) select id from public.places_destinations where is_active order by slug limit 1;
insert into auth.users(id,email,email_confirmed_at)
select admin,admin::text||'@local.test',now() from f union all
select owner_id,owner_id::text||'@local.test',now() from f union all
select customer,customer::text||'@local.test',now() from f;
insert into public.admin_users(user_id) select admin from f;
insert into public.stay_properties(id,name,slug,location,destination_id,status,partner_booking_required)
select stay,'Synthetic Partner Stay',stay::text,'Local test',destination,'published',true from f;
insert into public.stay_room_types(id,property_id,name,capacity,total_units,weekday_price,weekend_price,extra_guest_price,partner_included_guests)
select room,stay,'Synthetic room',3,1,300000,375000,25000,2 from f;
insert into public.places_properties(id,name,slug,destination_id,whatsapp_phone,accommodation_type,status,contact_verified_at,stay_property_id,stay_mapping_verified_at)
select place,'Synthetic Places Partner',place::text,destination,'6280000000000','villa','published',now(),stay,now() from f;
insert into public.places_property_members(property_id,user_id,role,verified_at,verified_by)
select place,owner_id,'OWNER',now(),admin from f;
insert into public.stay_service_applications(id,property_id,user_id,request_id,model,message,status)
select app,place,owner_id,gen_random_uuid(),'BOOKING_PARTNER','Synthetic reviewed application','CLOSED' from f;
insert into public.stay_service_agreements(id,stay_property_id,places_property_id,model,status,scope,responsibilities,contract_reference,
 starts_at,ends_at,fee_type,fee_bps,billing_basis,payment_route,settlement_party,account_manager_id,last_request_id,last_payload,updated_by)
select contract,stay,place,'BOOKING_PARTNER','ACTIVE','Synthetic operating scope','Synthetic verified responsibilities','STAY-TEST-REF',
 now()-interval '1 day',now()+interval '1 year','COMMISSION',1500,'EMBEDDED_BOOKING_MARGIN','EXISTING_SHIAP_BANK_TRANSFER','SHIAP',
 admin,gen_random_uuid(),'{}',admin from f;
insert into public.stay_agreement_members(agreement_id,user_id,role,status,verified_by)
select contract,owner_id,'OWNER','ACTIVE',admin from f;

create function pg_temp.book_stay(offset_days integer,p_guests integer default 2,p_addon boolean default false,p_mixed boolean default false)
returns uuid language plpgsql as $$
declare t f%rowtype; items jsonb;
begin
 select * into t from f;
 items:=jsonb_build_array(jsonb_build_object('service_type','stay','service_name','Synthetic room','property_id',t.stay,
   'room_type_id',t.room,'date_start',current_date+offset_days,'date_end',current_date+offset_days+1,'quantity',1,'guests',p_guests,
   'selected_addons',case when p_addon then jsonb_build_array(jsonb_build_object('id',t.addon,'price',1)) else '[]'::jsonb end));
 if p_mixed then
   items:=items||jsonb_build_array(jsonb_build_object('service_type','other','service_name','Other', 'date_start',current_date+offset_days,'quantity',1,'guests',1));
 end if;
 return (select id from public.create_booking_order('Synthetic Customer','+620000000000',null,null,items));
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub',(select customer::text from f),true);
do $$ begin
  if public.stay_booking_mode((select stay from f))<>'UNAVAILABLE' then raise exception 'Free property activated booking'; end if;
  begin perform pg_temp.book_stay(91); raise exception 'Missing approval accepted';
  exception when raise_exception then if sqlerrm not like '%Booking Partner belum tersedia%' then raise; end if; end;
end $$;

reset role;
insert into public.places_subscriptions(property_id,origin,status,starts_at,ends_at)
select place,'TRIAL','TRIALING',now()-interval '1 day',now()+interval '13 days' from f;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select customer::text from f),true);
do $$ begin
  begin perform pg_temp.book_stay(91); raise exception 'Premium booking accepted';
  exception when raise_exception then if sqlerrm not like '%Booking Partner belum tersedia%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub',(select admin::text from f),true);
select public.admin_approve_stay_v2_marketing(contract,true,'Synthetic verified contract') from f;
select public.admin_register_stay_partner_booking(stay,app,contract,'Synthetic reviewed onboarding') from f;
select set_config('request.jwt.claim.sub',(select owner_id::text from f),true);
select public.manage_stay_partner_booking_config(stay,'SUBMIT','Synthetic complete partner form') from f;
do $$ begin
  begin perform public.manage_stay_partner_booking_config((select stay from f),'APPROVE','Unauthorized approval');
    raise exception 'Owner approved onboarding'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',(select admin::text from f),true);
do $$ begin
  begin perform public.manage_stay_partner_booking_config((select stay from f),'APPROVE','Cannot approve before bank checks');
    raise exception 'Approval without bank'; exception when invalid_parameter_value then null; end;
end $$;
select public.manage_stay_partner_booking_config(stay,'VERIFY_BANK','Synthetic valid account match','Test Bank','0123') from f;
select public.manage_stay_partner_booking_config(stay,'APPROVE','Checked synthetic eligibility') from f;
select public.manage_stay_partner_booking_config(stay,'ACTIVATE','Activate synthetic request mode') from f;
select public.manage_stay_partner_inventory(stay,room,'SPECIAL_RATE',jsonb_build_object('start',current_date+91,'end',current_date+91,'price',400000)) from f;
select public.manage_stay_partner_inventory(stay,room,'BLOCK',jsonb_build_object('start',current_date+92,'end',current_date+92,'reason','Synthetic maintenance')) from f;
select public.manage_stay_partner_inventory(stay,room,'ADD_UNIT','{"label":"A01"}') from f;
reset role;
insert into public.stay_partner_addons(id,property_id,name,price_idr) select addon,stay,'Synthetic breakfast',50000 from f;
update public.payment_settings set is_active=true where id;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select customer::text from f),true);
do $$ begin
  if public.stay_booking_mode((select stay from f))<>'REQUEST_TO_BOOK' then raise exception 'Request should be the default'; end if;
  if public.read_stay_partner_operations((select stay from f))->'properties'<>'[]'::jsonb then raise exception 'Tenant data leaked'; end if;
  if has_table_privilege('authenticated','public.stay_partner_booking_config','SELECT') then raise exception 'Bank metadata exposed'; end if;
  begin perform pg_temp.book_stay(92); raise exception 'Blocked date accepted'; exception when raise_exception then
    if sqlerrm not like '%Ketersediaan%' then raise; end if; end;
  begin perform pg_temp.book_stay(91,4); raise exception 'Capacity exceeded'; exception when raise_exception then
    if sqlerrm not like '%melebihi kapasitas%' then raise; end if; end;
  begin perform pg_temp.book_stay(91,2,false,true); raise exception 'Mixed order accepted'; exception when raise_exception then
    if sqlerrm not like '%harus dibuat terpisah%' then raise; end if; end;
end $$;
reset role;
