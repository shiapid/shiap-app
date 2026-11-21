-- Local rollback-only. All addresses, bank references and messages are fixtures.
begin;
\ir payment_integrity_test_helpers.sql
do $$ declare customer uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); service uuid:=gen_random_uuid();
begin
  if (select email_enabled from public.notification_settings where id=true) then raise exception 'External email must default disabled'; end if;
  if has_table_privilege('anon','public.notification_events','select') or has_table_privilege('authenticated','public.notification_deliveries','update') or has_function_privilege('authenticated','public.notification_claim(integer,uuid)','execute') then raise exception 'Notification queue exposed'; end if;
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(customer,'authenticated','authenticated',customer::text||'@example.invalid',now(),'{}','{}',now(),now()),(admin_id,'authenticated','authenticated',admin_id::text||'@example.invalid',now(),'{}','{}',now(),now());
  insert into public.admin_users(user_id) values(admin_id);
  insert into public.shiap_experiences(id,experience_type,title,slug,base_price,price_basis,status) values(service,'activity','Notification local fixture',service::text,100000,'per_unit','published');
  update public.notification_settings set email_enabled=true,verified_sender='test@example.invalid',provider_verified_at=now(),smtp_test_confirmed_at=now() where id=true;
  update public.payment_settings set is_active=true where id=true;
  perform set_config('shiap.notify_customer',customer::text,true);perform set_config('shiap.notify_admin',admin_id::text,true);perform set_config('shiap.notify_service',service::text,true);
end $$;
set local role service_role;
do $$ declare payload jsonb; booking uuid; request_id uuid:=gen_random_uuid(); reminder uuid; proof uuid; path text; job record; lease uuid:=gen_random_uuid(); failed_job uuid; before_status text;
begin
  payload:=jsonb_build_object('p_customer_name','Notification QA','p_customer_whatsapp','081234567890','p_customer_email','qa@example.invalid','p_items',jsonb_build_array(jsonb_build_object('service_type','activity','service_catalog_id',current_setting('shiap.notify_service'),'service_name','QA','date_start',current_date+90,'quantity',1,'guests',1)));
  select x.id into booking from public.checkout_booking(current_setting('shiap.notify_customer')::uuid,null,request_id,payload,'booking') x;
  perform x.id from public.checkout_booking(current_setting('shiap.notify_customer')::uuid,null,request_id,payload,'booking') x;
  if (select count(*) from public.notification_events where booking_id=booking and event_type='booking_created')<>1 then raise exception 'Checkout retry duplicated event'; end if;
  if (select count(*) from public.notification_deliveries d join public.notification_events e on e.id=d.event_id where e.booking_id=booking and e.event_type='booking_created' and d.channel='email')<>1 then raise exception 'Email queue missing or duplicated'; end if;
  update public.booking_orders set inventory_hold_expires_at=now()+interval '4 minutes' where id=booking;
  perform public.notification_schedule();perform public.notification_schedule();
  select id into reminder from public.notification_events where booking_id=booking and event_type='payment_reminder';
  if reminder is null or (select count(*) from public.notification_events where booking_id=booking and event_type='payment_reminder')<>1 then raise exception 'Reminder missing or duplicated'; end if;
  if not shiap_private.notification_eligible(reminder) then raise exception 'Eligible reminder rejected'; end if;
  path:=current_setting('shiap.notify_customer')||'/'||booking||'/local.pdf';
  insert into storage.objects(bucket_id,name,metadata) values('booking-payment-proofs',path,'{"mimetype":"application/pdf","size":16}');
  proof:=public.customer_booking_action(current_setting('shiap.notify_customer')::uuid,null,booking,'proof',jsonb_build_object('path',path,'name','local.pdf','mime','application/pdf','size',16))::uuid;
  if shiap_private.notification_eligible(reminder) then raise exception 'Reminder still eligible after proof'; end if;
  if not exists(select 1 from public.notification_events where booking_id=booking and event_type='proof_received' and priority='high') then raise exception 'Admin verification alert missing'; end if;
  for job in select * from public.notification_claim(25,lease) loop
    if job.event_id=reminder then raise exception 'Stale reminder claimed'; end if;
    failed_job:=job.id;
    perform public.notification_finish(job.id,lease,'retry',null,'PROVIDER_HTTP_503');
  end loop;
  if (select d.state from public.notification_deliveries d where d.event_id=reminder and d.channel='email')<>'skipped' then raise exception 'Stale reminder not skipped'; end if;
  if failed_job is null then raise exception 'No eligible job claimed'; end if;
  if exists(select 1 from public.notification_claim(25,gen_random_uuid())) then raise exception 'Backoff ignored'; end if;
  if not exists(select 1 from public.notification_deliveries where id=failed_job and attempts=1 and state='retry' and scheduled_at>now()) then raise exception 'Retry backoff missing'; end if;
  perform set_config('shiap.notify_booking',booking::text,true);perform set_config('shiap.notify_proof',proof::text,true);
  update public.notification_deliveries set scheduled_at=now(),dispatch_started_at=now(),state='processing',locked_until=now()-interval '1 minute' where id=failed_job;
  perform * from public.notification_claim(25,gen_random_uuid());
  if (select last_error from public.notification_deliveries where id=failed_job)<>'SMTP_DELIVERY_UNCERTAIN' then raise exception 'Ambiguous SMTP delivery retried'; end if;
  if not exists(select 1 from public.notification_events where booking_id=booking and event_type='delivery_failed') then raise exception 'Permanent failure alert missing'; end if;
  if (select payment_status from public.booking_orders where id=booking)<>'pending' then raise exception 'Email failure changed payment'; end if;
end $$;
reset role;
do $$ declare booking uuid:=current_setting('shiap.notify_booking')::uuid; proof uuid:=current_setting('shiap.notify_proof')::uuid;
begin
  perform set_config('request.jwt.claim.sub',current_setting('shiap.notify_admin'),true);
  perform pg_temp.verify_test_bank('booking',(select booking_id from public.booking_payment_records where id=proof),proof,100000,'LOCAL-NOTIFY-BANK');
  if (select count(*) from public.notification_events where booking_id=booking and event_type='payment_verified')<>1 then raise exception 'Verified full payment event missing'; end if;
  if (select count(*) from public.finance_transaction_entries where booking_id=booking and entry_type='payment')<>1 then raise exception 'Notifications changed finance payment count'; end if;
end $$;
set local role authenticated;
do $$ begin
  perform public.notification_mark_read(null);
  if not exists(select 1 from public.notification_reads where admin_id=current_setting('shiap.notify_admin')::uuid) then raise exception 'Read state not persisted'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('shiap.notify_customer'),true);
  if exists(select 1 from public.notification_events) or exists(select 1 from public.notification_settings) or exists(select 1 from public.notification_deliveries) or exists(select 1 from public.notification_whatsapp_activity) then raise exception 'Customer can see admin notifications'; end if;
  begin perform public.notification_mark_read(null);raise exception 'Customer marked admin notifications';exception when raise_exception then if sqlerrm='Customer marked admin notifications' then raise;end if;end;
end $$;
reset role;
do $$ declare test_id uuid:=gen_random_uuid(); fingerprint text:='local-fingerprint';
begin
  insert into public.notification_smtp_tests(id,admin_id,recipient,token_hash,transport_fingerprint,state)
    values(test_id,current_setting('shiap.notify_admin')::uuid,'admin@example.invalid','local-hash',fingerprint,'accepted');
  if public.notification_confirm_smtp(test_id,current_setting('shiap.notify_customer')::uuid,'local-hash','notifications@example.invalid',fingerprint) then raise exception 'Non-admin confirmed SMTP'; end if;
  if public.notification_confirm_smtp(test_id,current_setting('shiap.notify_admin')::uuid,'wrong-hash','notifications@example.invalid',fingerprint) then raise exception 'Wrong test code accepted'; end if;
  if not public.notification_confirm_smtp(test_id,current_setting('shiap.notify_admin')::uuid,'local-hash','notifications@example.invalid',fingerprint) then raise exception 'Valid test confirmation rejected'; end if;
end $$;
rollback;
