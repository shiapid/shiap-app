\set ON_ERROR_STOP on
begin;
\ir unified_checkout_fixture.sql
\ir unified_checkout_catalog_fixture.sql
\ir payment_integrity_test_helpers.sql

do $$
declare
  booking uuid;
  admin_id uuid:=(select admin from f);
  guest_id uuid:=(select customer from f);
  stay_item uuid;
  trip_item uuid;
  receipt uuid;
  approval uuid;
  refund uuid;
  payout_id uuid;
  refund_journal uuid;
  return_journal uuid;
  payout_request uuid:=gen_random_uuid();
  return_request uuid:=gen_random_uuid();
  cash_before bigint;
  principal bigint;
  refund_amount bigint:=27131;
  paid_at timestamptz;
  moment timestamptz;
  evidence text;
  trip_refund uuid;
  debit_request uuid:=gen_random_uuid();
begin
  booking:=pg_temp.unified_book(106,array['stay','trip','experience']);
  select item_id,subtotal_idr into strict stay_item,principal from shiap_private.unified_order_items
    where booking_id=booking and service='stay';
  select item_id into strict trip_item from shiap_private.unified_order_items where booking_id=booking and service='trip';
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform public.manage_stay_partner_item(stay_item,'APPROVE','Synthetic QA Stay approval');
  perform public.admin_review_experience_request(
    (select id from public.shiap_experience_booking_records where booking_id=booking),'approve','Synthetic QA Experience approval');
  perform pg_temp.verify_test_bank('booking',booking,null,
    (select total_amount from public.booking_orders where id=booking),'QA-LEDGER-IN1');

  select j.id into strict receipt from shiap_private.stay_finance_journals j where j.booking_id=booking and j.source_kind='RECEIPT';
  select sum(delta_idr) into cash_before from shiap_private.stay_finance_lines where journal_id=receipt and account='BANK';
  if cash_before is distinct from (select total_amount from public.booking_orders where id=booking)
    or (select delta_idr from shiap_private.stay_finance_lines
      where journal_id=receipt and item_id=stay_item and account='PARTNER_PAYABLE') is distinct from -(principal-principal*1500/10000) then
    raise exception 'Receipt and partner payable do not reconcile';
  end if;

  begin
    update shiap_private.stay_finance_lines set delta_idr=delta_idr+1 where journal_id=receipt;
    raise exception 'Journal line could be rewritten';
  exception when check_violation then null; end;
  begin
    insert into shiap_private.stay_finance_lines(journal_id,item_id,account,delta_idr) values(receipt,stay_item,'REFUND_PAYABLE',1);
    raise exception 'Journal line could be appended';
  exception when check_violation then null; end;

  begin
    perform shiap_private.post_stay_finance('REFUND_APPROVED',gen_random_uuid(),booking,admin_id,'Cross-item unbalanced',
      jsonb_build_array(jsonb_build_object('item_id',stay_item,'account','BANK','delta_idr',1),
        jsonb_build_object('item_id',trip_item,'account','REFUND_PAYABLE','delta_idr',-1)));
    raise exception 'Cross-item postings balanced only at parent';
  exception when check_violation then null; end;

  refund:=public.admin_manage_unified_refund(gen_random_uuid(),'request',stay_item,null,
    jsonb_build_object('amount',refund_amount,'reason','Synthetic refund ledger verification'));
  perform public.admin_manage_unified_refund(gen_random_uuid(),'review',stay_item,refund,
    jsonb_build_object('reason','Synthetic refund ledger verification'));
  perform public.admin_manage_unified_refund(gen_random_uuid(),'approve',stay_item,refund,
    jsonb_build_object('amount',refund_amount,'reason','Synthetic refund ledger verification'));
  select j.id into strict approval from shiap_private.stay_finance_journals j where j.source_kind='REFUND_APPROVED' and j.source_id=refund;
  if exists(select 1 from shiap_private.stay_finance_lines where journal_id=approval and (account='BANK' or item_id<>stay_item))
    or (select delta_idr from shiap_private.stay_finance_lines where journal_id=approval and account='REFUND_PAYABLE')<>-refund_amount
    or (select delta_idr from shiap_private.stay_finance_lines where journal_id=approval and account='COMMISSION_DEFERRED')
      <>principal*1500/10000-(principal-refund_amount)*1500/10000
  then raise exception 'Refund approval did not book exact liability and commission'; end if;

  perform public.admin_manage_unified_refund(gen_random_uuid(),'queue',stay_item,refund,
    jsonb_build_object('reason','Synthetic refund ledger verification'));
  select approved_at into strict paid_at from shiap_private.unified_item_refunds where id=refund;
  evidence:=admin_id::text||'/'||payout_request::text;
  insert into storage.objects(bucket_id,name,owner_id) values('finance-bank-evidence',evidence,admin_id::text);
  perform public.admin_manage_unified_refund(payout_request,'pay',stay_item,refund,
    jsonb_build_object('amount',refund_amount,'occurred_at',paid_at,'evidence',evidence,'bank_id','QA-LEDGER-OUT1',
      'confirmed',true,'reason','Synthetic bank evidence and beneficiary'));
  select id into strict payout_id from shiap_private.unified_refund_payouts where refund_id=refund;
  select id into strict refund_journal from shiap_private.stay_finance_journals where source_id=payout_id and source_kind='REFUND_PAID';

  evidence:=admin_id::text||'/'||return_request::text;
  insert into storage.objects(bucket_id,name,owner_id) values('finance-bank-evidence',evidence,admin_id::text);
  moment:=clock_timestamp();
  begin
    perform public.admin_record_stay_finance_bank_return(refund_journal,return_request,'QA-LEDGER-IN1',refund_amount,moment,evidence,
      'Verified test bank returned refund');
    raise exception 'Return reused incoming bank identity';
  exception when unique_violation then null; end;
  perform set_config('request.jwt.claim.sub',guest_id::text,true);
  begin
    perform public.admin_record_stay_finance_bank_return(refund_journal,return_request,'QA-LEDGER-RT1',refund_amount,moment,evidence,
      'Verified test bank returned refund');
    raise exception 'Customer recorded return';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  return_journal:=public.admin_record_stay_finance_bank_return(refund_journal,return_request,'QA-LEDGER-RT1',
    refund_amount,moment,evidence,'Verified test bank returned refund');
  if return_journal is distinct from public.admin_record_stay_finance_bank_return(refund_journal,return_request,'QA-LEDGER-RT1',
    refund_amount,moment,evidence,'Verified test bank returned refund') then
    raise exception 'Return retry created a second journal';
  end if;
  if (select sum(l.delta_idr) from shiap_private.stay_finance_lines l join shiap_private.stay_finance_journals j
    on j.id=l.journal_id where j.booking_id=booking and l.account='BANK')<>cash_before
    or (select sum(l.delta_idr) from shiap_private.stay_finance_lines l where l.item_id=stay_item and account='REFUND_PAYABLE')<>-refund_amount
    or not exists(select 1 from shiap_private.unified_item_refunds where id=refund and status='PAID' and reconcile_required)
  then raise exception 'Bank return did not restore the liability and preserve the original paid event'; end if;

  trip_refund:=public.admin_manage_unified_refund(gen_random_uuid(),'request',trip_item,null,
    jsonb_build_object('amount',1000,'reason','Synthetic pending refund'));
  perform public.admin_manage_unified_refund(gen_random_uuid(),'review',trip_item,trip_refund,
    jsonb_build_object('reason','Synthetic pending refund'));
  evidence:=admin_id::text||'/'||debit_request::text;
  insert into storage.objects(bucket_id,name,owner_id) values('finance-bank-evidence',evidence,admin_id::text);
  perform public.admin_record_stay_finance_bank_return(receipt,debit_request,'QA-LEDGER-RT2',
    cash_before,clock_timestamp(),evidence,'Verified test bank reversed incoming receipt');
  if not exists(select 1 from public.admin_stay_finance_reconciliation() r
    where r.booking_id=booking and r.state='BANK_RETURN_SUSPENSE') then
    raise exception 'Incoming bank return missing from reconciliation';
  end if;
  begin
    perform public.admin_manage_unified_refund(gen_random_uuid(),'approve',trip_item,trip_refund,
      jsonb_build_object('amount',1000,'reason','Synthetic pending refund'));
    raise exception 'Refund approval bypassed a returned receipt';
  exception when check_violation then null; end;
  if (select sum(b.delta_idr) from public.admin_stay_finance_item_balance(booking) b)<>0 then
    raise exception 'Reconciliation report did not balance';
  end if;
end $$;

set local role authenticated;
do $$
begin
  if has_table_privilege(current_user,'shiap_private.stay_finance_lines','select') then
    raise exception 'Authenticated role can read the raw ledger';
  end if;
end $$;
rollback;
