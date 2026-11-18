-- Local-only booking/inventory/pricing smoke test. Every fixture is rolled back.
begin;
-- Test-only payment enablement for legacy payment lifecycle checks. The whole
-- smoke test rolls back, so the Demo payment setting remains disabled locally.
update public.payment_settings set is_active=true where id=true;
do $$
declare
  test_user uuid := gen_random_uuid();
  trip uuid := gen_random_uuid();
  departure uuid := gen_random_uuid();
  departure2 uuid := gen_random_uuid();
  property uuid := gen_random_uuid();
  room uuid := gen_random_uuid();
  activity_service uuid := gen_random_uuid();
  admin_user uuid := gen_random_uuid();
  booking uuid;
  payment_record uuid;
  hold_booking uuid;
  addon_booking uuid;
  proof_path text;
  item_price numeric;
  amount numeric;
  night_total numeric;
  reserved integer;
  state text;
  cancel_result text;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(test_user,'authenticated','authenticated',test_user::text||'@local.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
  insert into public.trip_packages(id,title,slug,location,status,pricing_model,base_price,min_pax,max_pax)
  values(trip,'Smoke Trip',trip::text,'Local test','published','open_per_person',12000,1,2);
  insert into public.trip_departures(id,trip_id,departure_date,price_per_person,min_participants,max_participants,status)
  values(departure,trip,current_date+90,12000,1,2,'open');
  insert into public.trip_departures(id,trip_id,departure_date,price_per_person,min_participants,max_participants,status)
  values(departure2,trip,current_date+91,12000,1,2,'open');
  insert into public.stay_properties(id,name,slug,location,status)
  values(property,'Smoke Stay',property::text,'Local test','published');
  insert into public.stay_room_types(id,property_id,name,capacity,total_units,weekday_price,weekend_price,status)
  values(room,property,'Smoke Room',2,1,100,200,'active');
  insert into public.shiap_experiences(id,experience_type,title,slug,base_price,price_basis,status,addons)
  values(activity_service,'activity','Smoke Activity',activity_service::text,50000,'per_unit','published',
    '[{"id":"smoke-addon","name":"Smoke Add-on","price":10000}]'::jsonb);
  perform set_config('request.jwt.claim.sub',test_user::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);

  select r.id into booking from public.create_booking_order(
    'Local Smoke','+620000000000','smoke@local.test',null,
    jsonb_build_array(jsonb_build_object('service_type','trip','service_name','Smoke Trip','variant','Open Trip',
      'date_start',(current_date+90)::text,'quantity',1,'guests',2,'trip_id',trip,'departure_id',departure))
  ) r;
  select i.unit_price into item_price from public.booking_items i where i.booking_id=booking;
  select b.total_amount into amount from public.booking_orders b where b.id=booking;
  select d.booked_seats,d.status into reserved,state from public.trip_departures d where d.id=departure;
  if item_price<>12000 or amount<>24000 or reserved<>2 or state<>'full' then
    raise exception 'Trip hold/pricing failed: price %, total %, seats %, status %',item_price,amount,reserved,state;
  end if;
  select r.id into addon_booking from public.create_booking_order(
    'Local Smoke','+620000000000','smoke@local.test',null,
    jsonb_build_array(jsonb_build_object('service_type','activity','service_catalog_id',activity_service,
      'service_name','Smoke Activity','date_start',(current_date+90)::text,'quantity',1,'guests',1,
      'selected_addons',jsonb_build_array(jsonb_build_object('id','smoke-addon'))))
  ) r;
  select i.unit_price into item_price from public.booking_items i where i.booking_id=addon_booking;
  select b.total_amount into amount from public.booking_orders b where b.id=addon_booking;
  if item_price<>60000 or amount<>60000 or jsonb_array_length((select i.selected_addons from public.booking_items i where i.booking_id=addon_booking))<>1 then
    raise exception 'Activity add-on was not included in server-priced full total: item %, total %',item_price,amount;
  end if;
  select b.total_amount into amount from public.booking_orders b where b.id=booking;
  proof_path:=test_user::text||'/'||booking::text||'/smoke-proof.pdf';
  insert into storage.objects(bucket_id,name,owner,owner_id,metadata)
  values('booking-payment-proofs',proof_path,test_user,test_user::text,jsonb_build_object('mimetype','application/pdf','size',12));
  payment_record:=public.submit_booking_payment_proof(booking,proof_path,'smoke-proof.pdf','application/pdf',12);
  if (select payment_status from public.booking_orders where id=booking)<>'pending' then raise exception 'Proof submission did not set payment status to pending.'; end if;
  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(admin_user,'authenticated','authenticated',admin_user::text||'@local.test','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
  insert into public.admin_users(user_id) values(admin_user);
  perform set_config('request.jwt.claim.sub',admin_user::text,true);
  begin
    perform public.finance_record_transaction(booking,'payment',amount,'smoke-pending-proof-guard','Must wait for proof review','SMOKE-PENDING-REF');
    raise exception 'Finance accepted payment while a proof was awaiting review.';
  exception when others then
    if sqlerrm not like '%menunggu verifikasi%' then raise; end if;
  end;
  begin
    perform public.admin_review_booking_payment_full_amount(payment_record,'approved',amount-1,'SMOKE-UNDERPAY',null);
    raise exception 'Underpayment was approved.';
  exception when others then
    if sqlerrm not like '%tepat 100%% total booking%' then raise; end if;
  end;
  if (select payment_status from public.booking_orders where id=booking)<>'pending' then raise exception 'Underpayment attempt changed payment state.'; end if;
  perform public.admin_review_booking_payment_full_amount(payment_record,'approved',amount,'SMOKE-FULL-PAY',null);
  perform public.admin_update_booking_status(booking,'confirmed',null);
  if (select payment_status from public.booking_orders where id=booking)<>'paid'
     or (select order_status from public.booking_orders where id=booking)<>'confirmed' then
    raise exception 'Admin full-payment review/booking confirmation failed.';
  end if;
  perform set_config('request.jwt.claim.sub',test_user::text,true);
  begin
    perform * from public.create_booking_order(
      'Local Smoke','+620000000000','smoke@local.test',null,
      jsonb_build_array(jsonb_build_object('service_type','trip','service_name','Smoke Trip',
        'date_start',(current_date+90)::text,'quantity',1,'guests',1,'trip_id',trip,'departure_id',departure))
    );
    raise exception 'Expected full-departure request to fail';
  exception when others then
    if sqlerrm not like '%Jadwal trip tidak tersedia%' and sqlerrm not like '%Kapasitas jadwal tidak mencukupi%' then raise; end if;
  end;

  -- Expiry frees held seats; cancellation releases them immediately.
  select r.id into hold_booking from public.create_booking_order(
    'Local Smoke','+620000000000','smoke@local.test',null,
    jsonb_build_array(jsonb_build_object('service_type','trip','service_name','Smoke Trip','variant','Open Trip',
      'date_start',(current_date+91)::text,'quantity',1,'guests',2,'trip_id',trip,'departure_id',departure2))
  ) r;
  if (select inventory_hold_expires_at<=clock_timestamp() from public.booking_orders where id=hold_booking) then
    raise exception 'New inventory hold must expire in the future.';
  end if;
  update public.booking_orders set inventory_hold_expires_at=clock_timestamp()-interval '1 second' where id=hold_booking;
  if public.expire_booking_holds()<1 then raise exception 'Expired hold was not swept.'; end if;
  select d.booked_seats,d.status into reserved,state from public.trip_departures d where d.id=departure2;
  if (select order_status from public.booking_orders where id=hold_booking)<>'expired' or reserved<>0 or state<>'open' then
    raise exception 'Expiry did not release inventory: status %, seats %, departure %',
      (select order_status from public.booking_orders where id=hold_booking),reserved,state;
  end if;

  select r.id into hold_booking from public.create_booking_order(
    'Local Smoke','+620000000000','smoke@local.test',null,
    jsonb_build_array(jsonb_build_object('service_type','trip','service_name','Smoke Trip','variant','Open Trip',
      'date_start',(current_date+91)::text,'quantity',1,'guests',1,'trip_id',trip,'departure_id',departure2))
  ) r;
  proof_path:=test_user::text||'/'||hold_booking::text||'/review-proof.pdf';
  insert into storage.objects(bucket_id,name,owner,owner_id,metadata)
  values('booking-payment-proofs',proof_path,test_user,test_user::text,jsonb_build_object('mimetype','application/pdf','size',12));
  payment_record:=public.submit_booking_payment_proof(hold_booking,proof_path,'review-proof.pdf','application/pdf',12);
  update public.booking_orders set inventory_hold_expires_at=clock_timestamp()-interval '1 second' where id=hold_booking;
  if public.expire_booking_holds()<>0 or (select order_status from public.booking_orders where id=hold_booking)<>'pending_confirmation' then
    raise exception 'A pending payment proof must protect the booking hold.';
  end if;
  perform set_config('request.jwt.claim.sub',admin_user::text,true);
  perform public.admin_review_booking_payment_full_amount(payment_record,'rejected',null,null,'Bukti tidak sesuai');
  if (select order_status from public.booking_orders where id=hold_booking)<>'expired' then
    raise exception 'Rejected late proof must allow the hold to expire.';
  end if;
  begin
    perform public.admin_review_booking_payment_full_amount(payment_record,'approved',12000,'SMOKE-RETRY',null);
    raise exception 'Reviewed proof should not be approvable twice.';
  exception when others then
    if sqlerrm not like '%sudah ditinjau%' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub',test_user::text,true);
  select r.id into hold_booking from public.create_booking_order(
    'Local Smoke','+620000000000','smoke@local.test',null,
    jsonb_build_array(jsonb_build_object('service_type','trip','service_name','Smoke Trip','variant','Open Trip',
      'date_start',(current_date+91)::text,'quantity',1,'guests',1,'trip_id',trip,'departure_id',departure2))
  ) r;
  cancel_result:=public.customer_cancel_booking(hold_booking);
  if cancel_result<>'cancelled' then
    raise exception 'Customer cancellation returned unexpected status: %',cancel_result;
  end if;
  if (select booked_seats from public.trip_departures where id=departure2)<>0 then
    raise exception 'Customer cancellation did not release capacity: status %, seats %, departure status %',
      (select order_status from public.booking_orders where id=hold_booking),
      (select booked_seats from public.trip_departures where id=departure2),
      (select status from public.trip_departures where id=departure2);
  end if;

  select r.id into hold_booking from public.create_booking_order(
    'Local Smoke','+620000000000','smoke@local.test',null,
    jsonb_build_array(jsonb_build_object('service_type','trip','service_name','Smoke Trip','variant','Open Trip',
      'date_start',(current_date+91)::text,'quantity',1,'guests',1,'trip_id',trip,'departure_id',departure2))
  ) r;
  proof_path:=test_user::text||'/'||hold_booking::text||'/cancelled-proof.pdf';
  insert into storage.objects(bucket_id,name,owner,owner_id,metadata)
  values('booking-payment-proofs',proof_path,test_user,test_user::text,jsonb_build_object('mimetype','application/pdf','size',12));
  payment_record:=public.submit_booking_payment_proof(hold_booking,proof_path,'cancelled-proof.pdf','application/pdf',12);
  perform set_config('request.jwt.claim.sub',admin_user::text,true);
  perform public.admin_update_booking_status(hold_booking,'cancelled','Booking dibatalkan admin untuk uji keamanan');
  begin
    perform public.admin_review_booking_payment_full_amount(payment_record,'approved',12000,'SMOKE-CANCELLED',null);
    raise exception 'Payment for a cancelled booking must not be approved';
  exception when others then
    if sqlerrm not like '%tidak dapat menerima pembayaran%' then raise; end if;
  end;
  if (select payment_status from public.booking_orders where id=hold_booking)<>'pending' then
    raise exception 'Rejected approval attempt changed payment status for a cancelled booking.';
  end if;

  select r.id into booking from public.create_booking_order(
    'Local Smoke','+620000000000','smoke@local.test',null,
    jsonb_build_array(jsonb_build_object('service_type','stay','service_name','Smoke Stay','variant','Smoke Room',
      'date_start',(current_date+100)::text,'date_end',(current_date+102)::text,'quantity',1,'guests',2,'property_id',property,'room_type_id',room))
  ) r;
  select sum(case when extract(isodow from d)::integer in(6,7) then 200 else 100 end) into night_total
  from generate_series(current_date+100,current_date+101,interval '1 day') d;
  select i.unit_price into item_price from public.booking_items i where i.booking_id=booking;
  select b.total_amount into amount from public.booking_orders b where b.id=booking;
  if item_price<>ceil(night_total/2) or amount<>night_total then
    raise exception 'Stay pricing failed: nightly %, unit %, total %',night_total,item_price,amount;
  end if;
  begin
    perform * from public.create_booking_order(
      'Local Smoke','+620000000000','smoke@local.test',null,
      jsonb_build_array(jsonb_build_object('service_type','stay','service_name','Smoke Stay','variant','Smoke Room',
        'date_start',(current_date+100)::text,'date_end',(current_date+102)::text,'quantity',1,'guests',2,'property_id',property,'room_type_id',room))
    );
    raise exception 'Expected overlapping stay request to fail';
  exception when others then
    if sqlerrm not like '%Ketersediaan kamar tidak mencukupi%' then raise; end if;
  end;
  raise notice 'Local booking/inventory smoke test passed: pricing, capacity, hold expiry, payment-review protection, cancellation, and stay overlap.';
end $$;
rollback;
