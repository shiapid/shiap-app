-- Local only. Every tariff, booking, bank fixture and ledger entry rolls back.
begin;
\ir payment_integrity_test_helpers.sql
do $$ declare admin_id uuid:=gen_random_uuid(); customer_id uuid:=gen_random_uuid(); rental uuid:=gen_random_uuid(); activity uuid:=gen_random_uuid(); guest uuid;
begin
  if exists(select 1 from public.service_fee_settings where enabled or percentage_bps<>200 or max_percentage_bps<>1000) then raise exception 'Initial fees must be disabled with recommended 2%% and cap 10%%'; end if;
  if has_table_privilege('anon','public.service_fee_settings','select') or has_function_privilege('authenticated','public.quote_service_fees(jsonb)','execute') then raise exception 'Fee access exposed'; end if;
  if (select relrowsecurity from pg_class where oid='public.service_fee_settings'::regclass) is distinct from true then raise exception 'Fee RLS missing'; end if;
  if (shiap_private.service_fee_line('trip',1,true,'fixed',200,1000,9999)->>'fee')::bigint<>0 then raise exception 'Tiny subtotal cap failed'; end if;
  if (shiap_private.service_fee_line('trip',125,true,'percentage',200,0,1000)->>'fee')::bigint<>3 then raise exception 'Percentage half-up rounding failed'; end if;
  if (shiap_private.service_fee_line('trip',125,true,'fixed',200,1000,1000)->>'fee')::bigint<>12 then raise exception 'Cap must round down'; end if;
  if (shiap_private.service_fee_line('trip',1000000,false,'percentage',200,0,1000)->>'fee')::bigint<>0 then raise exception 'Disabled fee not zero'; end if;
  begin perform shiap_private.service_fee_line('trip',100,true,'percentage',10000,0,10000); raise exception '100 percent accepted'; exception when raise_exception then if sqlerrm='100 percent accepted' then raise; end if; end;
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(admin_id,'authenticated','authenticated',admin_id::text||'@fee.invalid',now(),'{}','{}',now(),now()),
          (customer_id,'authenticated','authenticated',customer_id::text||'@fee.invalid',now(),'{}','{}',now(),now());
  insert into public.admin_users(user_id) values(admin_id);
  insert into public.shiap_experiences(id,experience_type,catalog_category,title,slug,base_price,price_basis,status)
    values(rental,'activity','rental','Fee rental',rental::text,50001,'per_unit','published'),(activity,'activity','activity','Fee activity',activity::text,120000,'per_unit','published');
  insert into public.booking_guest_sessions(secret_hash) values(repeat('a',64)) returning id into guest;
  perform set_config('shiap.fee_admin',admin_id::text,true); perform set_config('shiap.fee_customer',customer_id::text,true);
  perform set_config('shiap.fee_rental',rental::text,true); perform set_config('shiap.fee_activity',activity::text,true);
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  update public.payment_settings set is_active=true where id=true;
end $$;
set local role authenticated;
do $$ declare result jsonb;
begin
  update public.service_fee_settings set enabled=true,mode='fixed',fixed_amount=500000 where category='rental';
  update public.service_fee_settings set enabled=true,mode='percentage',percentage_bps=200 where category='activity';
  result:=public.admin_preview_service_fee('rental',100002,true,'fixed',200,500000,1000);
  if (result->>'fee')::bigint<>10000 or not(result->>'capped')::boolean then raise exception 'Admin preview mismatch'; end if;
  if (select count(*) from public.service_fee_settings_audit)<>2 then raise exception 'Admin audit missing'; end if;
  begin update public.service_fee_settings set max_percentage_bps=10000 where category='rental'; raise exception 'Unsafe cap accepted'; exception when check_violation then null; end;
end $$;
set local role service_role;
do $$ declare payload jsonb; booking uuid; request_id uuid:=gen_random_uuid(); quote jsonb; subtotal bigint; fees bigint;
begin
  quote:=public.quote_service_fees('[{"category":"rental","subtotal":50001},{"category":"rental","subtotal":50001},{"category":"activity","subtotal":120000}]');
  if (quote->>'fee')::bigint<>12400 or jsonb_array_length(quote->'lines')<>2 then raise exception 'Fixed fee applied more than once/category'; end if;
  payload:=jsonb_build_object('p_customer_name','Fee local test','p_customer_whatsapp','0000000000','service_fee_total',999999,
    'p_items',jsonb_build_array(
      jsonb_build_object('service_type','activity','service_catalog_id',current_setting('shiap.fee_rental'),'service_name','Fee rental','date_start',current_date+90,'quantity',1,'guests',1),
      jsonb_build_object('service_type','activity','service_catalog_id',current_setting('shiap.fee_rental'),'service_name','Fee rental','date_start',current_date+90,'quantity',1,'guests',1),
      jsonb_build_object('service_type','activity','service_catalog_id',current_setting('shiap.fee_activity'),'service_name','Fee activity','date_start',current_date+90,'quantity',1,'guests',1)));
  select x.id into booking from public.checkout_booking(null,repeat('a',64),request_id,payload,'booking') x;
  if not exists(select 1 from public.booking_orders where id=booking and package_subtotal=220002 and service_fee_total=12400 and total_amount=232402 and jsonb_array_length(service_fee_snapshot)=2) then raise exception 'Authoritative multi-category snapshot mismatch'; end if;
  if (select x.id from public.checkout_booking(null,repeat('a',64),request_id,payload,'booking') x)<>booking then raise exception 'Retry duplicated charge'; end if;
  if (select service_fee_recognized_revenue from public.finance_booking_profit_v where id=booking)<>0 then raise exception 'Unpaid revenue recognized'; end if;
  begin update public.booking_orders set service_fee_total=1 where id=booking; raise exception 'Snapshot mutable'; exception when raise_exception then if sqlerrm='Snapshot mutable' then raise; end if; end;
  begin update public.booking_items set quantity=2 where booking_id=booking; raise exception 'Priced items mutable'; exception when raise_exception then if sqlerrm='Priced items mutable' then raise; end if; end;
  perform set_config('shiap.fee_booking',booking::text,true);
end $$;
reset role;
do $$ declare booking uuid:=current_setting('shiap.fee_booking')::uuid; payment uuid; duplicate uuid; before_rev numeric;
begin
  perform set_config('request.jwt.claim.sub',current_setting('shiap.fee_admin'),true);
  update public.service_fee_settings set enabled=false;
  if (select service_fee_total from public.booking_orders where id=booking)<>12400 then raise exception 'Tariff edit repriced old booking'; end if;
  -- Isolated ledger fixtures exercise the existing verified full-transfer path.
  begin perform public.finance_record_transaction(booking,'payment',220002,gen_random_uuid()::text,'local fixture','LOCAL-FEE-BANK'); raise exception 'Package-only payment accepted'; exception when raise_exception then if sqlerrm='Package-only payment accepted' then raise; end if; end;
  payment:=pg_temp.verify_test_bank('booking',booking,null,232402,'LOCAL-FEE-BANK');
  duplicate:=pg_temp.verify_test_bank('booking',booking,null,232402,'LOCAL-FEE-BANK');
  if payment<>duplicate then raise exception 'Payment retry duplicated fee'; end if;
  if (select count(*) from public.finance_transaction_entries where booking_id=booking and entry_type='payment')<>1 then raise exception 'Fee created separate cash transaction'; end if;
  update public.booking_orders set order_status='completed' where id=booking;
  if not exists(select 1 from public.finance_booking_profit_v where id=booking and service_fee_cash_received=12400 and service_fee_recognized_revenue=12400 and package_recognized_revenue=220002) then raise exception 'Fee revenue split mismatch'; end if;
  perform public.finance_record_transaction(booking,'refund',116201,gen_random_uuid()::text,'Local half-refund fixture');
  if not exists(select 1 from public.finance_booking_profit_v where id=booking and service_fee_refunded=6200 and service_fee_recognized_revenue=6200 and package_recognized_revenue=110001) then raise exception 'Pro-rata refund split mismatch'; end if;
  update public.booking_orders set order_status='cancelled' where id=booking;
  if (select service_fee_recognized_revenue from public.finance_booking_profit_v where id=booking)<>0 then raise exception 'Cancelled revenue recognized'; end if;
  perform public.finance_record_transaction(booking,'refund',116201,gen_random_uuid()::text,'Local remaining-refund fixture');
  if not exists(select 1 from public.finance_booking_profit_v where id=booking and service_fee_refunded=12400 and service_fee_cash_received=12400 and service_fee_recognized_revenue=0 and receivable=0) then raise exception 'Full refund did not reverse fee'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('shiap.fee_customer'),true);
end $$;
set local role authenticated;
do $$ begin
  if exists(select 1 from public.service_fee_settings) then raise exception 'Customer can read admin settings'; end if;
  update public.service_fee_settings set enabled=true;
  if found then raise exception 'Customer can change fees'; end if;
  begin perform public.admin_preview_service_fee('trip',100,true,'percentage',200,0,1000); raise exception 'Customer preview override accepted'; exception when raise_exception then if sqlerrm='Customer preview override accepted' then raise; end if; end;
end $$;
reset role;
rollback;
