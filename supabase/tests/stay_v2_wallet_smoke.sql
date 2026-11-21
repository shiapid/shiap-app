\set ON_ERROR_STOP on
begin;
\ir payment_integrity_test_helpers.sql
\ir unified_checkout_fixture.sql

do $$
declare
  owner_id uuid:=(select f.owner_id from f);
  customer uuid:=(select f.customer from f);
  admin_id uuid:=(select f.admin from f);
  places uuid:=(select f.place from f);
  payload jsonb;
  booking uuid;
  item uuid;
  refund uuid;
  wallet jsonb;
  principal bigint;
  expected_net bigint;
  withdrawal uuid:=gen_random_uuid();
  second uuid:=gen_random_uuid();
  payout_event uuid:=gen_random_uuid();
  account_id uuid;
  beneficiary text;
  bank_name text;
  evidence text;
  transfer jsonb;
begin
  select jsonb_build_object('p_customer_name','Synthetic Wallet Guest','p_customer_whatsapp','620000000000',
    'p_items',jsonb_build_array(jsonb_build_object('service_type','stay','property_id',f.stay,
      'room_type_id',f.room,'date_start',current_date+109,'date_end',current_date+110,'guests',2,'quantity',1)))
    into payload from f;
  select x.id into strict booking from public.checkout_booking(customer,null,gen_random_uuid(),payload,'booking') x;
  select s.item_id,s.subtotal_idr into strict item,principal from shiap_private.unified_order_items s where s.booking_id=booking;
  expected_net:=principal-principal*1500/10000;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  if jsonb_array_length(public.read_stay_partner_wallet(places)->'items')<>0 then
    raise exception 'Wallet credited an unverified booking';
  end if;

  perform public.manage_stay_partner_item(item,'APPROVE','Synthetic QA approval');
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform pg_temp.verify_test_bank('booking',booking,null,
    (select total_amount from public.booking_orders where id=booking),'QA-WALLET-IN');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  wallet:=public.read_stay_partner_wallet(places);
  if (wallet#>>'{totals,pending_idr}')::bigint is distinct from expected_net
    or (wallet#>>'{totals,eligibility_idr}')::bigint is distinct from 0::bigint
    or wallet#>>'{items,0,eligibility}' is distinct from 'PENDING' then
    raise exception 'Wallet made unconfirmed funds eligible';
  end if;

  perform public.manage_stay_partner_item(item,'CONFIRM','Synthetic QA confirmation');
  wallet:=public.read_stay_partner_wallet(places);
  if (wallet#>>'{totals,eligibility_idr}')::bigint is distinct from expected_net/2
    or wallet#>>'{items,0,eligibility}' is distinct from 'EARLY' then
    raise exception 'Early withdrawal projection was not capped at half the verified net item';
  end if;

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  insert into shiap_private.stay_payout_operators(user_id) values(admin_id);
  select c.bank_name,'123456'||c.bank_last4 into strict bank_name,beneficiary
    from public.stay_partner_booking_config c where c.places_id=places;
  evidence:=admin_id||'/'||gen_random_uuid();
  insert into storage.objects(bucket_id,name,owner_id) values('finance-bank-evidence',evidence,admin_id::text);
  account_id:=public.admin_verify_stay_payout_account(places,bank_name,beneficiary,evidence);

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  begin
    perform public.partner_request_stay_withdrawal(withdrawal,item,account_id,1000);
    raise exception 'Wallet could pay with database flag off';
  exception when sqlstate 'PT409' then null; end;

  update shiap_private.stay_payout_control set enabled=true where id;
  perform public.partner_request_stay_withdrawal(withdrawal,item,account_id,1000);
  perform public.partner_request_stay_withdrawal(withdrawal,item,account_id,1000);
  begin
    perform public.partner_request_stay_withdrawal(second,item,account_id,expected_net/2);
    raise exception 'Pending payout did not reserve cumulative early capacity';
  exception when check_violation then null; end;
  begin
    perform public.admin_manage_stay_withdrawal(gen_random_uuid(),withdrawal,'APPROVE','Synthetic payout review');
    raise exception 'Owner approved own payout';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform public.admin_manage_stay_withdrawal(gen_random_uuid(),withdrawal,'APPROVE','Synthetic payout approval');
  if exists(select 1 from shiap_private.stay_withdrawal_transfers where withdrawal_id=withdrawal) then
    raise exception 'Approval was recorded as bank payment';
  end if;
  perform public.admin_manage_stay_withdrawal(gen_random_uuid(),withdrawal,'START','Synthetic payout authorized');
  evidence:=admin_id||'/'||payout_event;
  insert into storage.objects(bucket_id,name,owner_id) values('finance-bank-evidence',evidence,admin_id::text);
  transfer:=jsonb_build_object('bank_id','QA-PARTNER-PAYOUT','occurred_at',clock_timestamp(),
    'evidence',evidence,'amount',1000,'source_account','1234567890','beneficiary_account',beneficiary);
  begin
    perform public.admin_manage_stay_withdrawal(payout_event,withdrawal,'PAY','Synthetic bank payout statement',
      transfer||jsonb_build_object('beneficiary_account','0000001111'));
    raise exception 'Transfer to the wrong beneficiary was accepted';
  exception when invalid_parameter_value then null; end;
  perform public.admin_manage_stay_withdrawal(payout_event,withdrawal,'PAY','Synthetic bank payout statement',transfer);
  perform public.admin_manage_stay_withdrawal(payout_event,withdrawal,'PAY','Synthetic bank payout statement',transfer);
  if (select count(*) from shiap_private.stay_finance_journals j where j.source_kind='PAYOUT_PAID' and j.source_id=withdrawal)<>1 then
    raise exception 'Transfer confirmation was not idempotent';
  end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  wallet:=public.read_stay_partner_wallet(places);
  if wallet#>>'{withdrawals,0,status}' is distinct from 'PAID'
    or (wallet#>>'{totals,eligibility_idr}')::bigint is distinct from expected_net/2-1000
    or (wallet#>>'{totals,verified_earnings_idr}')::bigint is distinct from expected_net then
    raise exception 'Paid withdrawal did not consume cumulative eligibility or changed original earnings';
  end if;

  perform set_config('request.jwt.claim.sub',customer::text,true);
  if jsonb_array_length(public.read_stay_partner_wallet()->'properties')<>0 then
    raise exception 'Customer discovered another property in the wallet';
  end if;
  begin
    perform public.read_stay_partner_wallet(places);
    raise exception 'Customer could query another property wallet';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  refund:=public.admin_manage_unified_refund(gen_random_uuid(),'request',item,null,
    jsonb_build_object('amount',10000,'reason','Synthetic Wallet hold for refund'));
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  wallet:=public.read_stay_partner_wallet(places);
  if (wallet#>>'{totals,held_idr}')::bigint is distinct from expected_net-1000
    or (wallet#>>'{totals,eligibility_idr}')::bigint is distinct from 0::bigint
    or wallet#>>'{items,0,eligibility}' is distinct from 'HELD' then
    raise exception 'Open refund failed to hold Wallet item';
  end if;

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform public.admin_manage_unified_refund(gen_random_uuid(),'reject',item,refund,
    jsonb_build_object('reason','Synthetic refund case declined'));
  update public.stay_partner_fulfillment set check_in_at=clock_timestamp()-interval '2 hours',
    check_out_at=clock_timestamp()+interval '1 hour' where item_id=item;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.manage_stay_partner_item(item,'CHECK_IN','Synthetic QA check-in',
    array(select u.id from public.stay_partner_units u where u.room_type_id=(select f.room from f) and u.enabled));
  perform public.manage_stay_partner_item(item,'CHECK_OUT','Synthetic QA check-out');
  update public.stay_partner_fulfillment set check_out_at=clock_timestamp()-interval '1 hour' where item_id=item;
  wallet:=public.read_stay_partner_wallet(places);
  if wallet#>>'{items,0,eligibility}' is distinct from 'EARLY' then
    raise exception 'Calendar date unlocked final funds before fulfillment completion';
  end if;
  perform public.manage_stay_partner_item(item,'COMPLETE','Synthetic verified QA completion');
  wallet:=public.read_stay_partner_wallet(places);
  if wallet#>>'{items,0,eligibility}' is distinct from 'FINAL'
    or (wallet#>>'{totals,eligibility_idr}')::bigint is distinct from expected_net-1000 then
    raise exception 'Final settlement failed to subtract the prior early payout';
  end if;

  perform public.partner_request_stay_withdrawal(second,item,account_id,5000);
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform public.admin_manage_stay_withdrawal(gen_random_uuid(),second,'APPROVE','Synthetic final payout approval');
  perform public.admin_manage_stay_withdrawal(gen_random_uuid(),second,'START','Synthetic final payout authorized');
  payout_event:=gen_random_uuid();
  evidence:=admin_id||'/'||payout_event;
  insert into storage.objects(bucket_id,name,owner_id) values('finance-bank-evidence',evidence,admin_id::text);
  perform public.admin_manage_stay_withdrawal(payout_event,second,'FAIL','Synthetic failed bank transfer verified',
    jsonb_build_object('evidence',evidence));
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  wallet:=public.read_stay_partner_wallet(places);
  if (wallet#>>'{totals,eligibility_idr}')::bigint is distinct from expected_net-1000
    or (wallet#>>'{totals,reserved_idr}')::bigint is distinct from 0::bigint
    or exists(select 1 from shiap_private.stay_withdrawal_transfers where withdrawal_id=second) then
    raise exception 'Failed bank transfer did not release its reservation';
  end if;
end $$;
rollback;
