-- Used inside rollback-only SQL fixtures on the isolated Phase 4 QA baseline.
create function pg_temp.verify_test_bank(
  kind text, target uuid, proof uuid, amount numeric, source_id text, request_id uuid default gen_random_uuid()
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  path text := actor||'/'||request_id;
begin
  update public.payment_settings set account_number='1234567890' where id and btrim(account_number)='';
  insert into storage.objects(bucket_id,name,owner,owner_id,metadata)
  values('finance-bank-evidence',path,actor,actor::text,'{"size":40,"mimetype":"application/pdf"}')
  on conflict do nothing;
  perform public.finance_verify_bank_transfer(kind,target,proof,amount::bigint,source_id,source_id,
    date_trunc('second',now())-interval '1 minute',path,'Synthetic bank statement QA data',request_id);
  if kind='invoice' then
    return (select subscription_id from public.places_billing_invoices where id=target);
  end if;
  return (select id from public.finance_transaction_entries
    where booking_id=target and entry_type='payment' and bank_transfer_id is not null);
end $$;
