begin;
set constraints all immediate;

do $$
declare
  admin_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  first_id uuid := gen_random_uuid();
  second_id uuid := gen_random_uuid();
  third_id uuid := gen_random_uuid();
  historical_id uuid := gen_random_uuid();
  key_a uuid := gen_random_uuid();
  key_b uuid := gen_random_uuid();
  key_c uuid := gen_random_uuid();
  key_d uuid := gen_random_uuid();
  occurred timestamptz := date_trunc('second',now())-interval '1 minute';
  proof_path text;
  first_result jsonb;
  result jsonb;
begin
  insert into auth.users(id,email) values (admin_id,admin_id||'@gate.invalid'),(other_id,other_id||'@gate.invalid');
  insert into public.admin_users(user_id) values(admin_id);
  update public.payment_settings set bank_name='QA Synthetic Bank',account_number='1234567890',is_active=true where id;
  insert into public.booking_orders(id,order_number,user_id,customer_name,customer_whatsapp,total_amount)
  select id,'QA-GATE-'||id,other_id,'Synthetic','620000000000',300000
  from unnest(array[first_id,second_id,third_id,historical_id]) as id;
  -- A fixture for records already present before migration. Only the test owner can disable this trigger.
  alter table public.booking_orders disable trigger finance_require_bank_for_paid;
  update public.booking_orders set payment_status='paid' where id=historical_id;
  alter table public.booking_orders enable trigger finance_require_bank_for_paid;

  insert into storage.objects(bucket_id,name,owner,owner_id,metadata)
  select 'finance-bank-evidence',admin_id||'/'||key,admin_id,admin_id::text,'{"size":40,"mimetype":"application/pdf"}'
  from unnest(array[key_a,key_b,key_c,key_d]) as key;
  perform set_config('request.jwt.claim.sub',other_id::text,true);
  execute 'set local role authenticated';
  begin
    perform public.finance_verify_bank_transfer('booking',first_id,null,300000,'QA-MUTATION-A','REF-PRINTED',occurred,
      admin_id||'/'||key_a,null,key_a);
    raise exception 'Unauthorized settlement';
  exception when insufficient_privilege then null; end;
  if exists (select 1 from storage.objects where bucket_id='finance-bank-evidence' and owner_id=admin_id::text) then
    raise exception 'Bank evidence visible to customer';
  end if;
  begin
    perform public.finance_bank_reconciliation();
    raise exception 'Unauthorized reconciliation report';
  exception when insufficient_privilege then null; end;
  reset role;

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  execute 'set local role authenticated';
  begin
    perform public.finance_record_transaction(first_id,'payment',300000,'gate-direct-payment','QA','REF-PRINTED');
    raise exception 'Legacy Finance bypass accepted';
  exception when check_violation then null; end;
  begin
    perform public.finance_verify_bank_transfer('booking',first_id,null,290000,'QA-MUTATION-A','REF-PRINTED',occurred,
      admin_id||'/'||key_a,null,key_a);
    raise exception 'Underpayment accepted';
  exception when raise_exception then
    if sqlerrm not like '%100%% total booking%' then raise; end if;
  end;
  first_result := public.finance_verify_bank_transfer('booking',first_id,null,300000,'QA-MUTATION-A','REF-PRINTED',occurred,
    admin_id||'/'||key_a,'Private Finance reconciliation note',key_a);
  if first_result->>'status' is distinct from 'ALLOCATED' then raise exception 'Settlement failed'; end if;
  result := public.finance_verify_bank_transfer('booking',first_id,null,300000,'QA-MUTATION-A','REF-PRINTED',occurred,
    admin_id||'/'||key_a,'Private Finance reconciliation note',key_a);
  if result is distinct from first_result then raise exception 'Retry returned a different allocation'; end if;
  begin
    perform public.finance_verify_bank_transfer('booking',second_id,null,300000,'QA-MUTATION-A','REF-PRINTED',occurred,
      admin_id||'/'||key_b,null,key_b);
    raise exception 'Same transfer settled two bookings';
  exception when sqlstate 'PT409' then null; end;
  result := public.finance_verify_bank_transfer('booking',second_id,null,300000,'QA-MUTATION-B','REF-PRINTED',occurred,
    admin_id||'/'||key_b,null,key_b);
  if result->>'status' is distinct from 'ALLOCATED' then raise exception 'Distinct bank IDs sharing a display reference failed'; end if;
  proof_path := admin_id||'/'||key_c;
  result := public.finance_verify_bank_transfer('booking',third_id,null,300000,null,'REF-PRINTED',occurred,
    proof_path,'No stable reference from bank',key_c);
  if result->>'status' is distinct from 'NEEDS_RECONCILIATION' then raise exception 'Ambiguous item was not queued'; end if;
  if result->>'status' is distinct from (public.finance_verify_bank_transfer('booking',third_id,null,300000,null,'REF-PRINTED',occurred,
    proof_path,'No stable reference from bank',key_c)->>'status') then raise exception 'Ambiguous retry duplicated'; end if;
  if not exists(select 1 from public.finance_bank_reconciliation() where target_id=historical_id and status='HISTORICAL_UNMATCHED') then
    raise exception 'Historical item missing from reconciliation';
  end if;
  perform public.finance_reconcile_bank_payment('booking',first_id,'review_reversal','Bank confirmed a reversal on pre-fulfillment transfer.',gen_random_uuid());
  perform public.finance_reconcile_bank_payment('booking',first_id,'record_review','Reviewed reversal and retained original allocation.',gen_random_uuid());
  begin
    perform public.finance_verify_bank_transfer('booking',third_id,null,300000,'QA-MUTATION-A','REF-PRINTED',occurred,
      admin_id||'/'||key_d,null,key_d);
    raise exception 'Reversed transfer was released to another booking';
  exception when sqlstate 'PT409' then null; end;
  reset role;

  if exists(select 1 from public.booking_order_events where booking_id=first_id and (note like '%Private Finance%' or note like '%BANK:%')) then
    raise exception 'Private bank audit details leaked into customer-readable booking events';
  end if;
  if (select count(*) from public.finance_transaction_entries where booking_id in(first_id,second_id))<>2
    or (select count(*) from shiap_private.bank_receipt_allocations where booking_id in(first_id,second_id,third_id))<>2
    or (select count(*) from shiap_private.bank_payment_audit where target_id=third_id and action='NEEDS_RECONCILIATION')<>1
    or (select payment_status from public.booking_orders where id=third_id)<>'unpaid'
    or (select payment_status from public.booking_orders where id=second_id)<>'paid'
    or (select status from public.finance_transaction_entries where booking_id=first_id)<>'reversed'
    or (select order_status from public.booking_orders where id=first_id)<>'cancelled' then
    raise exception 'Canonical allocation, ledger, or audit is inconsistent';
  end if;
end $$;

rollback;
