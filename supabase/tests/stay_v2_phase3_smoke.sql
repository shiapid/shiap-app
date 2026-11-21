-- Synthetic Phase 3 test. All state, including locally verified funds, is rolled back.
begin;
\ir payment_integrity_test_helpers.sql
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
update f set booking=pg_temp.book_stay(91,3,true),rejected=pg_temp.book_stay(95);
do $$ begin
  if exists(select 1 from public.booking_orders where id=(select booking from f) and (payment_enabled or package_subtotal<>475000)) then
    raise exception 'Request payment open or server subtotal incorrect'; end if;
  begin perform pg_temp.book_stay(91); raise exception 'A held unit was sold twice'; exception when raise_exception then
    if sqlerrm not like '%Ketersediaan%' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub',(select admin::text from f),true);
do $$ begin
  begin perform public.admin_mark_booking_paid_full_amount((select booking from f),475000,'LOCAL-BANK-TEST');
    raise exception 'Payment bypassed Partner approval'; exception when raise_exception then
    if sqlerrm not like '%harus disetujui%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub',(select owner_id::text from f),true);
select public.manage_stay_partner_item((select (o->>'item_id')::uuid from jsonb_array_elements(public.read_stay_partner_operations(f.stay)->'bookings') o
 where o->>'status'='REQUESTED' and left(o->>'check_in_at',10)=(current_date+95)::text),'REJECT','Reject synthetic request') from f;
select public.manage_stay_partner_item((select (o->>'item_id')::uuid from jsonb_array_elements(public.read_stay_partner_operations(f.stay)->'bookings') o
 where o->>'status'='REQUESTED'),'APPROVE','Accept synthetic request') from f;
select * from public.read_stay_partner_calendar((select room from f),current_date+91,current_date+93);

reset role;
insert into storage.objects(bucket_id,name,owner,owner_id,metadata)
  select 'booking-payment-proofs',customer::text||'/'||booking::text||'/synthetic-qa.pdf',
    customer,customer::text,jsonb_build_object('mimetype','application/pdf','size',12) from f;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select customer::text from f),true);
update f set proof_id=public.submit_booking_payment_proof(booking,customer::text||'/'||booking::text||'/synthetic-qa.pdf','synthetic-qa.pdf','application/pdf',12);
reset role;
-- Move only the rollback-only QA deadline to exercise the real gate.
set constraints all immediate;
alter table public.booking_orders disable trigger aa_unified_order_gate;
update public.booking_orders set inventory_hold_expires_at=clock_timestamp()-interval '1 minute' where id=(select booking from f);
alter table public.booking_orders enable trigger aa_unified_order_gate;
update public.booking_payment_records set submitted_at=clock_timestamp()-interval '2 minutes' where id=(select proof_id from f);
select public.expire_booking_holds();
set local role authenticated;
select set_config('request.jwt.claim.sub',(select admin::text from f),true);
select pg_temp.verify_test_bank('booking',b.id,f.proof_id,b.total_amount,'LOCAL-BANK-TEST')
  from f join public.booking_orders b on b.id=f.booking;
select public.manage_stay_partner_booking_config(stay,'APPROVE_INSTANT','Verified synthetic inventory') from f;
select set_config('request.jwt.claim.sub',(select customer::text from f),true);
update f set instant=pg_temp.book_stay(96);
do $$ begin
  if not exists(select 1 from public.booking_orders where id=(select instant from f) and payment_enabled and payment_status='unpaid') then
    raise exception 'Instant booking did not reserve and open payment'; end if;
end $$;
reset role;
-- Move only the rollback-only QA deadline to exercise the real gate.
set constraints all immediate;
alter table public.booking_orders disable trigger aa_unified_order_gate;
update public.booking_orders set inventory_hold_expires_at=clock_timestamp()-interval '1 minute' where id=(select instant from f);
alter table public.booking_orders enable trigger aa_unified_order_gate;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select admin::text from f),true);
do $$ begin
  begin perform pg_temp.verify_test_bank('booking',b.id,null,b.total_amount,'LATE-LOCAL-BANK')
    from public.booking_orders b where b.id=(select instant from f);
    raise exception 'Expired Partner order accepted late recorded funds';
  exception when check_violation then
    if sqlerrm not like '%Hold Stay Partner kedaluwarsa%' and sqlerrm not like '%Hold pesanan gabungan kedaluwarsa%' then raise; end if;
  end;
end $$;
reset role;
select public.expire_booking_holds();
do $$ begin
  if not exists(select 1 from public.booking_orders where id=(select instant from f) and order_status='expired') then raise exception 'Hold did not expire'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select admin::text from f),true);
reset role;
do $$
declare
  token_hash text:=encode(extensions.gen_random_bytes(32),'hex');
  guest uuid;
  order_key uuid:=gen_random_uuid();
  order_id uuid;
  retry uuid;
  payload jsonb;
begin
  insert into public.booking_guest_sessions(secret_hash) values(token_hash) returning id into guest;
  select jsonb_build_object('p_customer_name','Guest Partner QA','p_customer_whatsapp','620000000000',
    'p_items',jsonb_build_array(jsonb_build_object('service_type','stay','property_id',f.stay,
      'room_type_id',f.room,'date_start',current_date+98,'date_end',current_date+99,'guests',2,'quantity',1)))
    into payload from f;
  set local role service_role;
  select x.id into strict order_id from public.checkout_booking(null,token_hash,order_key,payload,'booking') x;
  select x.id into strict retry from public.checkout_booking(null,token_hash,order_key,payload,'booking') x;
  reset role;
  if order_id<>retry or not exists(select 1 from public.booking_orders b
    join shiap_private.unified_order_items s on s.booking_id=b.id
    where b.id=order_id and b.guest_session_id=guest and b.user_id is null and b.payment_enabled
      and s.service='stay' and s.commission_bps=1500) then
    raise exception 'Single-service Partner checkout lost guest ownership or canonical snapshot';
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select admin::text from f),true);
select public.manage_stay_partner_booking_config(stay,'SUSPEND','Synthetic suspension review') from f;
select set_config('request.jwt.claim.sub',(select customer::text from f),true);
do $$ begin
  begin perform pg_temp.book_stay(97); raise exception 'A suspended Partner can take new bookings'; exception when raise_exception then
    if sqlerrm not like '%Booking Partner belum tersedia%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub',(select owner_id::text from f),true);
select public.manage_stay_partner_item((select (o->>'item_id')::uuid from jsonb_array_elements(public.read_stay_partner_operations(f.stay)->'bookings') o
 where o->>'status'='AWAITING_PAYMENT' and o->>'payment_status'='paid'),'CONFIRM','Verify synthetic reservation') from f;

reset role;
-- Move the synthetic operational clock only. Booking dates and price snapshots stay untouched.
update public.stay_partner_fulfillment set check_in_at=now()-interval '1 hour',check_out_at=now()+interval '1 hour'
 where order_id=(select booking from f);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select admin::text from f),true);
do $$ begin
  begin perform public.admin_update_booking_status((select booking from f),'completed','Unsafe legacy completion');
    raise exception 'Legacy completion bypassed Partner fulfillment'; exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub',(select owner_id::text from f),true);
select public.manage_stay_partner_item((o->>'item_id')::uuid,'CHECK_IN','Synthetic check-in',
  array(select (u->>'id')::uuid from jsonb_array_elements(public.read_stay_partner_operations(f.stay)->'units') u))
from f cross join lateral jsonb_array_elements(public.read_stay_partner_operations(f.stay)->'bookings') o where o->>'status'='CONFIRMED';
select public.manage_stay_partner_item((o->>'item_id')::uuid,'CHECK_OUT','Synthetic check-out')
from f cross join lateral jsonb_array_elements(public.read_stay_partner_operations(f.stay)->'bookings') o where o->>'status'='CHECKED_IN';
do $$ begin
  begin perform public.manage_stay_partner_item((o->>'item_id')::uuid,'COMPLETE','Too early')
    from f cross join lateral jsonb_array_elements(public.read_stay_partner_operations(f.stay)->'bookings') o where o->>'status'='CHECKED_OUT';
    raise exception 'Early completion accepted'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
update public.stay_partner_fulfillment set check_in_at=now()-interval '2 hours',check_out_at=now()-interval '1 hour'
 where order_id=(select booking from f);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select owner_id::text from f),true);
select public.manage_stay_partner_item((o->>'item_id')::uuid,'COMPLETE','Validated synthetic completion')
from f cross join lateral jsonb_array_elements(public.read_stay_partner_operations(f.stay)->'bookings') o where o->>'status'='CHECKED_OUT';
reset role;
do $$ begin
  if not exists(select 1 from public.booking_orders b join public.stay_partner_fulfillment i on i.order_id=b.id
    where b.id=(select booking from f) and b.order_status='completed' and i.status='COMPLETED' and b.package_subtotal=475000)
    or (select count(*) from public.finance_transaction_entries where booking_id=(select booking from f) and entry_type='payment')<>1
    then raise exception 'Partner fulfillment failed or legacy Finance recorded duplicate payment'; end if;
end $$;
do $$
declare
  item uuid;
  order_id uuid:=(select booking from f);
  refund uuid;
begin
  select s.item_id into strict item from shiap_private.unified_order_items s where s.booking_id=order_id;
  if (select -sum(l.delta_idr) from shiap_private.stay_finance_lines l
    where l.item_id=item and l.account='COMMISSION_REVENUE') is distinct from 71250::numeric
    or (select sum(l.delta_idr) from shiap_private.stay_finance_lines l
      where l.item_id=item and l.account='COMMISSION_DEFERRED') is distinct from 0::numeric then
    raise exception 'Validated singleton completion did not recognize the 15 percent commission';
  end if;

  perform set_config('request.jwt.claim.sub',(select admin::text from f),true);
  refund:=public.admin_manage_unified_refund(gen_random_uuid(),'request',item,null,
    jsonb_build_object('amount',10000,'reason','Synthetic post-completion refund'));
  perform public.admin_manage_unified_refund(gen_random_uuid(),'review',item,refund,
    jsonb_build_object('reason','Synthetic post-completion refund'));
  perform public.admin_manage_unified_refund(gen_random_uuid(),'approve',item,refund,
    jsonb_build_object('amount',10000,'reason','Synthetic post-completion refund'));
  if (select -sum(l.delta_idr) from shiap_private.stay_finance_lines l
    where l.item_id=item and l.account='COMMISSION_REVENUE') is distinct from 69750::numeric then
    raise exception 'Post-completion refund failed to adjust recognized commission';
  end if;
end $$;
select 'STAY_V2_PHASE3_RLS_AND_LIFECYCLE_PASS';
rollback;
