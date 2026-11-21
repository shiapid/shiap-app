begin;
\ir payment_integrity_test_helpers.sql
\ir unified_checkout_fixture.sql
\ir unified_checkout_catalog_fixture.sql

update public.shiap_experience_packages set booking_mode='scheduled_session' where id=(select package from unified_fixture);
insert into public.shiap_experience_sessions(package_id,starts_at,ends_at,capacity,status,weather_status,safety_plan_verified)
select package,(current_date+n+time '10:00') at time zone 'Asia/Makassar',
  (current_date+n+time '11:00') at time zone 'Asia/Makassar',1,'open','approved',true
from unified_fixture cross join unnest(array[101,102,104,105,106]) n;

create function pg_temp.pay_booking(p_booking uuid,p_source text) returns void language plpgsql as $$
declare e uuid; s uuid;
begin
  perform set_config('request.jwt.claim.sub',(select admin::text from f),true);
  select item_id into s from public.stay_partner_fulfillment where order_id=p_booking;
  select id into e from public.shiap_experience_booking_records where booking_id=p_booking;
  if s is not null then perform public.manage_stay_partner_item(s,'APPROVE','Synthetic Stay approved for refunds test'); end if;
  if e is not null then perform public.admin_review_experience_request(e,'approve','Synthetic Experience approved'); end if;
  perform pg_temp.verify_test_bank('booking',p_booking,null,(select total_amount from public.booking_orders where id=p_booking),p_source);
  if s is not null then perform public.manage_stay_partner_item(s,'CONFIRM','Synthetic Stay payment confirmed');
  else perform public.admin_update_booking_status(p_booking,'confirmed','Synthetic booking approved'); end if;
end $$;

create function pg_temp.refund_action(p_action text,p_item uuid,p_refund uuid default null,p_amount bigint default null)
returns uuid language sql as $$
  select public.admin_manage_unified_refund(gen_random_uuid(),p_action,p_item,p_refund,
    jsonb_build_object('reason','Synthetic Phase 4C Finance case','amount',p_amount))
$$;

create function pg_temp.confirm_refund(p_item uuid,p_refund uuid,p_amount bigint,p_bank_id text,p_key uuid)
returns uuid language plpgsql as $$
declare
  actor uuid:=auth.uid();
  path text := actor||'/'||p_key;
  at_time timestamptz;
begin
  insert into storage.objects(bucket_id,name,owner_id,metadata) values('finance-bank-evidence',path,actor::text,'{"size":100,"mimetype":"application/pdf"}')
    on conflict do nothing;
  select approved_at into at_time from shiap_private.unified_item_refunds where id=p_refund;
  return public.admin_manage_unified_refund(p_key,'pay',p_item,p_refund,
    jsonb_build_object('reason','Synthetic bank statement and beneficiary verified','amount',p_amount,
      'bank_id',p_bank_id,'confirmed',true,'occurred_at',at_time,'evidence',path));
end $$;

do $$
declare
  mixed uuid; second uuid; unpaid uuid; all_cancelled uuid; replacement uuid;
  trip uuid; stay uuid; exp uuid; second_exp uuid; second_trip uuid; refund_trip uuid; refund_stay_a uuid;
  refund_stay_b uuid; refund_exp uuid; outsider uuid;
  snap_before jsonb; snap_after jsonb; payout_key uuid:=gen_random_uuid();
  original bigint; total_out bigint; projection jsonb; marker uuid;
begin
  mixed:=pg_temp.unified_book(101,array['stay','trip','experience']);
  second:=pg_temp.unified_book(102,array['trip','experience']);
  unpaid:=pg_temp.unified_book(104,array['trip','experience']);
  all_cancelled:=pg_temp.unified_book(105,array['stay','trip','experience']);
  select item_id into trip from shiap_private.unified_order_items where booking_id=mixed and service='trip';
  select item_id into stay from shiap_private.unified_order_items where booking_id=mixed and service='stay';
  select item_id into exp from shiap_private.unified_order_items where booking_id=mixed and service='experience';
  select item_id into second_exp from shiap_private.unified_order_items where booking_id=second and service='experience';
  select item_id into second_trip from shiap_private.unified_order_items where booking_id=second and service='trip';
  perform set_config('request.jwt.claim.sub',(select admin::text from f),true);
  begin
    perform pg_temp.refund_action('request',(select item_id from shiap_private.unified_order_items where booking_id=unpaid and service='trip'),null,100);
    raise exception 'Refund accepted before receipt verification';
  exception when check_violation then null; end;

  perform pg_temp.pay_booking(mixed,'QA-PHASE4C-IN1');
  perform pg_temp.pay_booking(second,'QA-PHASE4C-IN2');
  perform pg_temp.pay_booking(all_cancelled,'QA-PHASE4C-IN3');
  update public.booking_orders set customer_email='qa-refund-customer@example.invalid' where id in(mixed,second);
  update public.notification_settings set email_enabled=true,provider_verified_at=now(),smtp_test_confirmed_at=now(),
    verified_sender='qa-sender@example.invalid',verified_transport=repeat('a',64),
    email_events=array['item_refund_requested','item_refund_approved','item_refund_rejected','item_refund_paid','booking_item_cancelled'] where id;
  select to_jsonb(t) into snap_before from public.finance_transaction_entries t where booking_id=mixed and entry_type='payment';
  select total_amount into original from public.booking_orders where id=mixed;
  begin
    perform public.finance_record_transaction(mixed,'refund',100,'qa-phase4c-parent-refund',null,null);
    raise exception 'Parent refund bypass succeeded';
  exception when check_violation then null; end;

  refund_trip:=pg_temp.refund_action('request',trip,null,240000);
  perform pg_temp.refund_action('review',trip,refund_trip);
  perform pg_temp.refund_action('approve',trip,refund_trip,240000);
  if (select liability from shiap_private.unified_item_accounting where item_id=trip)<>240000
    or (select executed from shiap_private.unified_item_accounting where item_id=trip)<>0 then
    raise exception 'Approval cash differs from liability';
  end if;
  if exists(select 1 from public.notification_events where booking_item_id=trip and event_type='item_refund_paid') then
    raise exception 'Approval sent paid notice';
  end if;
  perform pg_temp.refund_action('cancel_item',trip);
  if (select order_status from public.booking_orders where id=mixed)<>'confirmed'
    or (select booked_seats from public.trip_departures where id=(select departure_id from public.booking_items where id=trip))<>0
    or (select booked from shiap_private.stay_inventory((select room from f),current_date+101,current_date+102))<>1 then
    raise exception 'Trip cancellation changed parent or Stay inventory';
  end if;
  if (select array_agg(item_id) from public.admin_cancelled_unified_item_ids(array[trip,stay])) is distinct from array[trip] then
    raise exception 'Calendar cancellation scope leaked to active Stay';
  end if;
  perform pg_temp.refund_action('queue',trip,refund_trip);
  perform pg_temp.refund_action('fail',trip,refund_trip);
  if (select status from shiap_private.unified_item_refunds where id=refund_trip)<>'FAILED' or
     exists(select 1 from shiap_private.unified_refund_payouts where refund_id=refund_trip) then
    raise exception 'Failed transfer created cash adjustment';
  end if;
  perform pg_temp.refund_action('queue',trip,refund_trip);
  perform pg_temp.confirm_refund(trip,refund_trip,240000,'QA-OUT-1',payout_key);
  perform pg_temp.confirm_refund(trip,refund_trip,240000,'QA-OUT-1',payout_key);

  refund_stay_a:=pg_temp.refund_action('request',stay,null,25000);
  refund_stay_b:=pg_temp.refund_action('request',stay,null,30000);
  begin
    perform pg_temp.refund_action('request',stay,null,(select gross from shiap_private.unified_item_accounting where item_id=stay));
    raise exception 'Refund exceeds item cap';
  exception when check_violation then null; end;
  perform pg_temp.refund_action('review',stay,refund_stay_a);
  begin
    perform pg_temp.refund_action('approve',stay,refund_stay_a,25001);
    raise exception 'Approval did not enforce requested amount';
  exception when check_violation then null; end;
  perform pg_temp.refund_action('approve',stay,refund_stay_a,25000);
  perform pg_temp.refund_action('queue',stay,refund_stay_a);
  begin
    perform pg_temp.confirm_refund(stay,refund_stay_a,25000,'QA-OUT-1',gen_random_uuid());
    raise exception 'Bank payout reused across requests';
  exception when unique_violation then null; end;
  perform pg_temp.confirm_refund(stay,refund_stay_a,25000,'QA-OUT-2',gen_random_uuid());
  perform pg_temp.refund_action('review',stay,refund_stay_b);
  perform pg_temp.refund_action('approve',stay,refund_stay_b,30000);
  perform pg_temp.refund_action('queue',stay,refund_stay_b);
  perform pg_temp.confirm_refund(stay,refund_stay_b,30000,'QA-OUT-3',gen_random_uuid());

  refund_exp:=pg_temp.refund_action('request',second_exp,null,150000);
  perform pg_temp.refund_action('review',second_exp,refund_exp);
  perform pg_temp.refund_action('approve',second_exp,refund_exp,150000);
  perform pg_temp.refund_action('cancel_item',second_exp);
  perform pg_temp.refund_action('queue',second_exp,refund_exp);
  perform pg_temp.confirm_refund(second_exp,refund_exp,150000,'QA-OUT-4',gen_random_uuid());
  if (select order_status from public.booking_orders where id=second)<>'confirmed'
    or not shiap_private.unified_item_active(second_trip)
    or not shiap_private.unified_item_active(stay)
    or (select booked_seats from public.trip_departures where id=(select departure_id from public.booking_items where id=second_trip))<>2 then
    raise exception 'Refund affected another item or order';
  end if;

  -- A new customer can take the cancelled Experience slot. Existing Trip stays booked.
  replacement:=pg_temp.unified_book(102,array['stay','experience']);
  if not exists(select 1 from public.shiap_experience_booking_records where booking_id=replacement) then
    raise exception 'Cancelled session seat did not release';
  end if;
  perform set_config('request.jwt.claim.sub',(select admin::text from f),true);
  for marker in select item_id from shiap_private.unified_order_items where booking_id=all_cancelled order by item_id loop
    perform pg_temp.refund_action('cancel_item',marker);
  end loop;
  if (select order_status from public.booking_orders where id=all_cancelled)<>'cancelled'
    or (select payment_status from public.booking_orders where id=all_cancelled)<>'paid' then
    raise exception 'All cancellation rewrote payment or failed terminal state';
  end if;
  begin
    perform public.admin_complete_unified_service(trip,'Cancelled service cannot be completed');
    raise exception 'Cancelled Trip was fulfilled';
  exception when check_violation then null; end;

  select to_jsonb(t) into snap_after from public.finance_transaction_entries t where booking_id=mixed and entry_type='payment';
  select sum(amount) into total_out from public.finance_transaction_entries where booking_id=mixed and entry_type='refund' and status='posted';
  if snap_after is distinct from snap_before or total_out<>295000
    or (select sum(remaining_value) from shiap_private.unified_item_accounting where booking_id=mixed)<>original-total_out
    or not exists(select 1 from public.finance_booking_profit_v where id=mixed
      and cash_received=original and refunds=total_out and net_sales=original-total_out)
    or (select service_fee_refunded from public.finance_booking_profit_v where id=mixed)<>0
    or (select service_fee_amount from public.finance_booking_profit_v where id=mixed)<>10500
    or (select commission_bps from shiap_private.unified_order_items where item_id=stay)<>1500
    or (select count(*) from public.notification_events where booking_item_id=trip and event_type='item_refund_paid')<>1 then
    raise exception 'Finance, commission, service fee, or outbox reconciliation failed';
  end if;
  if not exists(select 1 from public.notification_events e join public.notification_deliveries d on d.event_id=e.id
    where e.booking_item_id=stay and e.event_type='item_refund_paid' and d.audience='partner' and d.state='queued'
      and shiap_private.notification_eligible(e.id))
    or exists(select 1 from public.notification_events e join public.notification_deliveries d on d.event_id=e.id
      where e.booking_item_id=trip and d.audience='partner')
    or not exists(select 1 from public.notification_events e join public.notification_deliveries d on d.event_id=e.id
      where e.booking_item_id=trip and e.event_type='item_refund_paid' and d.audience='customer' and d.state='queued'
        and shiap_private.notification_eligible(e.id)) then raise exception 'Outbox recipient scope or paid eligibility failed'; end if;

  -- After the remaining service is fulfilled, a settled cancelled item is terminal.
  set constraints all immediate;
  alter table public.booking_items disable trigger aa_guard_priced_booking_items;
  update public.booking_items set date_start=current_date-2 where id=second_trip;
  alter table public.booking_items enable trigger aa_guard_priced_booking_items;
  update public.trip_departures set departure_date=current_date-2,end_date=current_date-2
    where id=(select departure_id from public.booking_items where id=second_trip);
  perform public.admin_complete_unified_service(second_trip,'QA synthetic Trip successfully fulfilled');
  if (select order_status from public.booking_orders where id=second)<>'completed' then
    raise exception 'Completed active Trip with settled cancelled Experience did not resolve the parent';
  end if;
  select f.owner_id into outsider from f;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  begin
    perform public.admin_unified_refund_report(mixed);
    raise exception 'Vendor read private Finance report';
  exception when insufficient_privilege then null; end;
  begin
    perform pg_temp.refund_action('request',stay,null,1000);
    raise exception 'Vendor created Finance transaction';
  exception when insufficient_privilege then null; end;
  projection:=public.read_stay_partner_operations((select f.stay from f),null,null);
  if not exists (select 1 from jsonb_array_elements(projection->'bookings') q where q->>'item_id'=stay::text
     and (q->'refund'->>'paid')::bigint=55000) or exists
    (select 1 from jsonb_array_elements(projection->'bookings') q where q->>'item_id' in (trip::text,second_exp::text)) then
    raise exception 'Vendor projection missing or cross-service data leaked';
  end if;
end $$;
rollback;
