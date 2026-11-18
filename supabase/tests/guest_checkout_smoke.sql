-- Local regression only. All fixtures, orders, holds, proofs and ledger rows roll back.
begin;
do $$
declare u uuid:=gen_random_uuid(); service uuid:=gen_random_uuid(); guest uuid; hash text:=encode(extensions.gen_random_bytes(32),'hex');
begin
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(u,'authenticated','authenticated',u::text||'@guest-smoke.invalid',now(),'{}','{}',now(),now());
  insert into public.shiap_experiences(id,experience_type,title,slug,base_price,price_basis,status)
  values(service,'activity','Guest checkout regression',service::text,120000,'per_unit','published');
  insert into public.booking_guest_sessions(secret_hash) values(hash) returning id into guest;
  update public.payment_settings set is_active=true where id=true;
  perform set_config('shiap.test_hash',hash,true);
  perform set_config('shiap.test_guest',guest::text,true);
  perform set_config('shiap.test_user',u::text,true);
  perform set_config('shiap.test_service',service::text,true);
end $$;
set local role service_role;
do $$
declare payload jsonb; hash text:=current_setting('shiap.test_hash'); guest uuid:=current_setting('shiap.test_guest')::uuid;
  u uuid:=current_setting('shiap.test_user')::uuid; request_id uuid:=gen_random_uuid(); booking uuid; retry uuid;
  proof text; proof_id text; before_count integer;
begin
  payload:=jsonb_build_object('p_customer_name','Guest test','p_customer_whatsapp','0000000000','p_items',jsonb_build_array(
    jsonb_build_object('service_type','activity','service_catalog_id',current_setting('shiap.test_service'),
      'service_name','Guest checkout regression','date_start',current_date+90,'guests',2,'quantity',1)));
  select x.id into booking from public.checkout_booking(null,hash,request_id,payload,'booking') x;
  select x.id into retry from public.checkout_booking(null,hash,request_id,payload,'booking') x;
  if retry<>booking then raise exception 'Retry created a duplicate booking'; end if;
  if not exists(select 1 from public.booking_orders where id=booking and user_id is null and guest_session_id=guest and total_amount=120000
    and inventory_hold_expires_at between now()+interval '14 minutes' and now()+interval '16 minutes') then
    raise exception 'Guest ownership, authoritative price or hold mismatch'; end if;
  if not exists(select 1 from public.finance_booking_cost_snapshots where booking_id=booking) then
    raise exception 'Guest order missing from Finance cost snapshots';
  end if;
  begin
    perform x.id from public.checkout_booking(null,hash,request_id,payload||'{"p_customer_name":"different"}','booking') x;
    raise exception 'Idempotency mismatch accepted';
  exception when raise_exception then
    if sqlerrm='Idempotency mismatch accepted' then raise; end if;
  end;
  begin
    perform public.customer_booking_action(null,repeat('0',64),booking,'cancel');
    raise exception 'Wrong guest obtained access';
  exception when raise_exception then
    if sqlerrm='Wrong guest obtained access' then raise; end if;
  end;
  proof:=guest::text||'/'||booking::text||'/regression.pdf';
  insert into storage.objects(bucket_id,name,metadata) values('booking-payment-proofs',proof,'{"mimetype":"application/pdf","size":16}');
  proof_id:=public.customer_booking_action(null,hash,booking,'proof',jsonb_build_object('path',proof,'name','regression.pdf','mime','application/pdf','size',16));
  if public.customer_booking_action(null,hash,booking,'proof',jsonb_build_object('path',proof))<>proof_id then raise exception 'Proof retry duplicated a record'; end if;
  if (select payment_status from public.booking_orders where id=booking)<>'pending' then raise exception 'Proof did not enter verification'; end if;
  if exists(select 1 from public.finance_transaction_entries where booking_id=booking and entry_type='payment') then raise exception 'Screenshot created a successful payment'; end if;
  update public.booking_orders set inventory_hold_expires_at=now()-interval '1 minute' where id=booking;
  perform public.expire_booking_holds();
  if (select order_status from public.booking_orders where id=booking)='expired' then raise exception 'Pending review released a reservation'; end if;
  begin
    perform public.customer_booking_action(null,hash,booking,'proof',jsonb_build_object('path',guest::text||'/'||booking::text||'/other.pdf','name','other.pdf','mime','application/pdf','size',16));
    raise exception 'Second pending proof accepted';
  exception when raise_exception then
    if sqlerrm='Second pending proof accepted' then raise; end if;
  end;
  perform public.customer_booking_action(u,hash,booking,'claim');
  if not exists(select 1 from public.booking_orders where id=booking and user_id=u and guest_session_id is null) then raise exception 'Verified claim failed'; end if;
  begin
    perform public.customer_booking_action(null,hash,booking,'cancel');
    raise exception 'Claim retained guest access';
  exception when raise_exception then
    if sqlerrm='Claim retained guest access' then raise; end if;
  end;
  select x.id into retry from public.checkout_booking(null,hash,gen_random_uuid(),payload,'booking') x;
  update public.booking_orders set inventory_hold_expires_at=now()-interval '1 minute' where id=retry;
  perform public.expire_booking_holds();
  if (select order_status from public.booking_orders where id=retry)<>'expired' then raise exception 'Unpaid hold did not expire'; end if;
  select x.id into retry from public.checkout_booking(u,null,gen_random_uuid(),payload,'booking') x;
  if not exists(select 1 from public.booking_orders where id=retry and user_id=u and guest_session_id is null) then raise exception 'Authenticated ownership failed'; end if;
  update public.booking_guest_sessions set expires_at=now()-interval '1 minute' where id=guest;
  begin
    perform x.id from public.checkout_booking(null,hash,gen_random_uuid(),payload,'booking') x;
    raise exception 'Expired guest accepted';
  exception when raise_exception then
    if sqlerrm='Expired guest accepted' then raise; end if;
  end;
  update public.booking_guest_sessions set expires_at=now()+interval '30 days',revoked_at=now() where id=guest;
  begin
    perform x.id from public.checkout_booking(null,hash,gen_random_uuid(),payload,'booking') x;
    raise exception 'Revoked guest accepted';
  exception when raise_exception then
    if sqlerrm='Revoked guest accepted' then raise; end if;
  end;
  if not public.booking_rate_limit('smoke-rate',1,60) or public.booking_rate_limit('smoke-rate',1,60) then raise exception 'Rate limit failed'; end if;
  raise notice 'Guest idempotency, private ownership, proof review, full payment, expiry, claim, revocation and rate limits passed';
end $$;
reset role;
set local role anon;
do $$
begin
  if has_function_privilege('anon','public.checkout_booking(uuid,text,uuid,jsonb,text)','execute') then raise exception 'Public checkout adapter exposed'; end if;
  if has_function_privilege('authenticated','public.customer_booking_action(uuid,text,uuid,text,jsonb)','execute') then raise exception 'Privileged action adapter exposed'; end if;
  if has_table_privilege('anon','public.booking_guest_sessions','select') then raise exception 'Guest secrets exposed'; end if;
end $$;
reset role;
rollback;
