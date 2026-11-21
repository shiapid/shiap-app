begin;
\ir payment_integrity_test_helpers.sql
\ir unified_checkout_fixture.sql

\ir unified_checkout_catalog_fixture.sql

do $$
declare
  s_trip uuid; s_exp uuid; t_exp uuid; combined uuid; exp_id uuid; stay_id uuid; proof uuid;
  k uuid:=gen_random_uuid(); expires timestamptz; count_before bigint; evidence_path text;
  second uuid; reversed_pair uuid; rejection uuid; other_item uuid; trip_item uuid; unit_id uuid;
  outsider uuid:=gen_random_uuid(); unrelated_place uuid:=gen_random_uuid();
begin
  s_trip:=pg_temp.unified_book(101,array['stay','trip'],k);
  if s_trip is distinct from pg_temp.unified_book(101,array['stay','trip'],k) then raise exception 'Retry changed parent id'; end if;
  s_exp:=pg_temp.unified_book(102,array['stay','experience']);
  t_exp:=pg_temp.unified_book(103,array['trip','experience']);
  combined:=pg_temp.unified_book(104,array['trip','stay','experience']);
  second:=pg_temp.unified_book(105,array['trip','experience']);
  reversed_pair:=pg_temp.unified_book(106,array['stay','experience']);
  if (select count(*) from shiap_private.unified_order_items where booking_id=combined)<>3
     or (select count(distinct vendor_id) from shiap_private.unified_order_items where booking_id=combined)<>3
     or (select service_fee_total from public.booking_orders where id=combined)<>10500
     or (select count(*) from shiap_private.unified_order_items where booking_id=combined and commission_bps=1500)<>1 then
    raise exception 'Commercial snapshots failed';
  end if;

  select count(*) into count_before from public.booking_orders;
  begin
    perform pg_temp.unified_book(101,array['stay','trip','experience']);
    raise exception 'Oversold full Trip or Stay';
  exception when raise_exception then
    if sqlerrm not like '%tersedia%' and sqlerrm not like '%mencukupi%' then raise; end if;
  end;
  if count_before<>(select count(*) from public.booking_orders) then raise exception 'Failed checkout left parent'; end if;

  perform set_config('request.jwt.claim.sub',(select admin::text from f),true);
  select id into exp_id from public.shiap_experience_booking_records where booking_id=combined;
  select item_id into stay_id from public.stay_partner_fulfillment where order_id=combined;
  perform public.admin_review_experience_request(exp_id,'approve','Synthetic Experience approved first');
  if (select payment_enabled from public.booking_orders where id=combined) then raise exception 'Experience bypassed Stay'; end if;
  begin
    perform public.admin_mark_booking_paid_full_amount(combined,(select total_amount from public.booking_orders where id=combined),'QA-FAKE');
    raise exception 'Manual bypassed Stay';
  exception when raise_exception then if sqlerrm not like '%harus disetujui%' then raise; end if; end;
  begin
    perform pg_temp.verify_test_bank('booking',combined,null,(select total_amount from public.booking_orders where id=combined),'QA-UNIFIED-ONE');
    raise exception 'Finance bypassed Stay';
  exception when raise_exception then if sqlerrm not like '%harus disetujui%' then raise; end if; end;
  begin
    insert into public.booking_payment_records(booking_id,user_id,storage_path,original_file_name,mime_type,file_size)
    values(combined,(select customer from f),'qa-unified/blocked','qa.pdf','application/pdf',100);
    raise exception 'Proof bypassed Stay';
  exception when check_violation then null; end;
  perform public.manage_stay_partner_item(stay_id,'APPROVE','Synthetic Stay approved last');
  if not (select payment_enabled from public.booking_orders where id=combined) then raise exception 'Last approval did not open payment'; end if;

  perform public.manage_stay_partner_item((select item_id from public.stay_partner_fulfillment where order_id=s_exp),'APPROVE','Synthetic Stay approved first');
  if (select payment_enabled from public.booking_orders where id=s_exp) then raise exception 'Stay bypassed Experience'; end if;
  select id into rejection from public.shiap_experience_booking_records where booking_id=s_exp;
  perform public.admin_review_experience_request(rejection,'reject','Synthetic rejection');
  if (select order_status from public.booking_orders where id=s_exp)<>'rejected' or
     (select payment_enabled from public.booking_orders where id=s_exp) then raise exception 'Rejected checkout still payable'; end if;

  select id into exp_id from public.shiap_experience_booking_records where booking_id=t_exp;
  update shiap_private.unified_orders set sealed_at=null where booking_id=t_exp;
  update public.booking_orders set inventory_hold_expires_at=clock_timestamp()-interval '1 second' where id=t_exp;
  update shiap_private.unified_orders set sealed_at=clock_timestamp() where booking_id=t_exp;
  begin
    perform public.admin_review_experience_request(exp_id,'approve','Expired Trip test');
    raise exception 'Expired Trip hold accepted';
  exception when check_violation then null; end;

  update shiap_private.unified_orders set sealed_at=null where booking_id=reversed_pair;
  update public.booking_orders set inventory_hold_expires_at=clock_timestamp()-interval '1 second' where id=reversed_pair;
  update shiap_private.unified_orders set sealed_at=clock_timestamp() where booking_id=reversed_pair;
  begin
    perform public.manage_stay_partner_item((select item_id from public.stay_partner_fulfillment where order_id=reversed_pair),'APPROVE','Expired Stay test');
    raise exception 'Expired Stay hold accepted';
  exception when invalid_parameter_value then null; end;
  perform public.expire_booking_holds();

  select item_id into trip_item from shiap_private.unified_order_items where booking_id=combined and service='trip';
  perform public.admin_review_unified_service(trip_item,true,'Synthetic operations dispute');
  if (select payment_enabled from public.booking_orders where id=combined) then raise exception 'Dispute left payment enabled'; end if;
  perform public.admin_review_unified_service(trip_item,false,'Synthetic dispute satisfactorily resolved');
  if not (select payment_enabled from public.booking_orders where id=combined) then raise exception 'Resolution did not restore eligibility'; end if;

  -- Capacity failure after a successful Stay reservation rolls that Stay back.
  begin
    perform pg_temp.unified_book(105,array['stay','trip']);
    raise exception 'Full Trip added after holding a Stay';
  exception when raise_exception then if sqlerrm not like '%tidak tersedia%' then raise; end if; end;
  if exists(select 1 from public.booking_items where room_type_id=(select room from f) and date_start=current_date+103) then
    raise exception 'Failed Trip left a Stay hold';
  end if;

  -- Timely proof keeps the whole mixed inventory reserved after the deadline.
  perform set_config('request.jwt.claim.sub',(select customer::text from f),true);
  evidence_path:=(select customer::text from f)||'/'||combined||'/qa.pdf';
  insert into storage.objects(bucket_id,name,owner_id,metadata)
    values('booking-payment-proofs',evidence_path,(select customer::text from f),'{"size":100,"mimetype":"application/pdf"}');
  proof:=public.submit_booking_payment_proof(combined,evidence_path,'qa.pdf','application/pdf',100);
  select submitted_at into expires from public.booking_payment_records where id=proof;
  update shiap_private.unified_orders set sealed_at=null where booking_id=combined;
  update public.booking_orders set inventory_hold_expires_at=expires where id=combined;
  update shiap_private.unified_orders set sealed_at=clock_timestamp() where booking_id=combined;
  perform public.expire_booking_holds();
  if (select order_status from public.booking_orders where id=combined)<>'pending_confirmation' then raise exception 'Timely proof lost inventory'; end if;
  perform set_config('request.jwt.claim.sub',(select admin::text from f),true);
  begin
    perform public.admin_update_booking_status(combined,'cancelled','Timely proof must remain reserved');
    raise exception 'Cancellation discarded timely proof';
  exception when check_violation then
    if sqlerrm not like '%pemeriksaan bukti transfer%' then raise; end if;
  end;
  perform pg_temp.verify_test_bank('booking',combined,proof,(select total_amount from public.booking_orders where id=combined),'QA-UNIFIED-ONE');
  perform pg_temp.verify_test_bank('booking',combined,proof,(select total_amount from public.booking_orders where id=combined),'QA-UNIFIED-ONE');
  if (select count(*) from public.finance_transaction_entries where booking_id=combined and entry_type='payment')<>1 then
    raise exception 'Finance receipt duplicated';
  end if;
  select id into exp_id from public.shiap_experience_booking_records where booking_id=second;
  perform public.admin_review_experience_request(exp_id,'approve','Synthetic second parent eligible');
  begin
    perform pg_temp.verify_test_bank('booking',second,null,(select total_amount from public.booking_orders where id=second),'QA-UNIFIED-ONE');
    raise exception 'One bank transfer settled two mixed orders';
  exception when sqlstate 'PT409' then null; end;
  if exists(select 1 from public.finance_transaction_entries where booking_id=second) then
    raise exception 'Rejected cross-order use created receipt';
  end if;
  begin
    perform public.finance_record_transaction(combined,'refund',100,'qa-mixed-refund',null,null);
    raise exception 'Mixed parent refund accepted';
  exception when check_violation then null; end;
  perform public.manage_stay_partner_item(stay_id,'CONFIRM','Synthetic Stay confirmed after payment');
  begin
    perform public.admin_update_booking_status(combined,'completed','Validate protection');
    raise exception 'Legacy parent completion bypassed all items';
  exception when check_violation then null; end;
  select item_id into other_item from shiap_private.unified_order_items where booking_id=combined and service='experience';
  begin
    perform public.admin_complete_unified_service(other_item,'Session not happened yet');
    raise exception 'Early Experience completion accepted';
  exception when check_violation then null; end;
  insert into auth.users(id,email) values(outsider,outsider||'@unified.invalid');
  insert into public.places_properties(id,name,slug,destination_id,whatsapp_phone,accommodation_type,status)
  values(unrelated_place,'QA other vendor',unrelated_place::text,(select destination from f),'6280000000000','villa','draft');
  insert into public.places_property_members(property_id,user_id,role,verified_at,verified_by)
  values(unrelated_place,outsider,'OWNER',now(),(select admin from f));
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  begin
    perform public.manage_stay_partner_item(stay_id,'CHECK_IN','Verified owner but a different property');
    raise exception 'Non-vendor modified Stay fulfillment';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_complete_unified_service(other_item,'Unauthorized completion attempt');
    raise exception 'Non-Admin completed Experience';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',(select admin::text from f),true);

  -- Advance the operational fixtures without issuing another payment.
  set constraints all immediate;
  alter table public.booking_items disable trigger aa_guard_priced_booking_items;
  update public.booking_items set date_start=current_date-2 where id in (other_item,trip_item);
  alter table public.booking_items enable trigger aa_guard_priced_booking_items;
  update public.trip_departures set end_date=departure_date where id=(select departure_id from public.booking_items where id=trip_item);
  update public.stay_partner_fulfillment set check_in_at=clock_timestamp()-interval '2 days',
    check_out_at=clock_timestamp()+interval '1 minute' where item_id=stay_id;
  select id into unit_id from public.stay_partner_units where room_type_id=(select room from f) and enabled limit 1;
  perform public.manage_stay_partner_item(stay_id,'CHECK_IN','Synthetic guest checked in',array[unit_id]);
  perform public.manage_stay_partner_item(stay_id,'CHECK_OUT','Synthetic guest checked out');
  update public.stay_partner_fulfillment set check_out_at=clock_timestamp()-interval '1 second' where item_id=stay_id;
  perform public.manage_stay_partner_item(stay_id,'COMPLETE','Synthetic Stay fulfillment verified');
  if (select order_status from public.booking_orders where id=combined)='completed' then raise exception 'Stay completed parent prematurely'; end if;
  perform public.admin_complete_unified_service(other_item,'Synthetic Experience fulfillment verified');
  if (select order_status from public.booking_orders where id=combined)='completed' then raise exception 'Experience completed unfinished Trip'; end if;
  update public.trip_departures set departure_date=current_date-2,end_date=current_date-2
    where id=(select departure_id from public.booking_items where id=trip_item);
  perform public.admin_complete_unified_service(trip_item,'Synthetic Trip fulfillment verified');
  if (select order_status from public.booking_orders where id=combined)<>'completed' then raise exception 'Last fulfillment did not complete parent'; end if;
end $$;
rollback;
