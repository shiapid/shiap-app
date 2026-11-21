begin;

create function public.read_stay_partner_payout_accounts()
returns table (id uuid,places_id uuid,bank_name text,last4 text)
language sql stable security definer set search_path='' as $$
  select a.id,a.places_id,a.bank_name,a.last4
  from shiap_private.stay_payout_accounts a join public.stay_partner_booking_config c on c.places_id=a.places_id
  where auth.uid() is not null and not public.is_shiap_admin()
    and a.retired_at is null and shiap_private.stay_partner_can_manage(c.agreement_id,a.places_id)
  order by a.verified_at desc
$$;

create function public.admin_read_stay_payout_queue()
returns table (id uuid,order_number text,property_name text,amount_idr text,status text,
  bank_name text,last4 text,account_evidence text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  perform shiap_private.require_stay_payout_operator();
  return query select w.id,b.order_number,p.name,w.amount_idr::text,w.status,a.bank_name,a.last4,a.evidence_path,w.created_at
    from shiap_private.stay_withdrawals w join shiap_private.stay_payout_accounts a on a.id=w.account_id
    join public.places_properties p on p.id=a.places_id
    join shiap_private.unified_order_items i on i.item_id=w.item_id and i.vendor_id=a.places_id
    join public.booking_orders b on b.id=i.booking_id
    order by (w.status in ('PENDING','APPROVED','PROCESSING')) desc,w.created_at desc,w.id
    limit 100;
end $$;

do $migration$
declare d text; c text;
begin
  d:=pg_get_functiondef('public.read_stay_partner_wallet(uuid)'::regprocedure);
  c:=replace(d,$old$'property_name',x.name,'net_idr'$old$,$new$'property_name',x.name,'places_id',x.places_id,'net_idr'$new$);
  if d=c then raise exception 'Wallet property projection changed'; end if;
  execute c;
end $migration$;

revoke all on function public.read_stay_partner_payout_accounts(),public.admin_read_stay_payout_queue()
from public,anon,authenticated,service_role;
grant execute on function public.read_stay_partner_payout_accounts(),public.admin_read_stay_payout_queue() to authenticated;
do $migration$
declare d text; c text;
begin
  d:=pg_get_functiondef('public.admin_record_stay_finance_bank_return(uuid,uuid,text,bigint,timestamptz,text,text)'::regprocedure);
  c:=replace(d,$old$o.bucket_id='finance-bank-evidence' and o.name=p_evidence$old$,
    $new$o.bucket_id in ('finance-bank-evidence','stay-payout-evidence') and o.name=p_evidence$new$);
  if d=c then raise exception 'Bank return evidence lookup changed'; end if;
  d:=c;
  c:=replace(d,$old$where id=p_journal and source_kind in ('RECEIPT','REFUND_PAID');$old$,
    $new$where id=p_journal and source_kind in ('RECEIPT','REFUND_PAID','PAYOUT_PAID');
  if source.source_kind='PAYOUT_PAID' and not public.can_manage_stay_payouts() then
    raise exception 'Akses Finance payout diperlukan.' using errcode='42501';
  end if;
  if not exists(select 1 from storage.objects o where o.bucket_id=case when source.source_kind='PAYOUT_PAID'
      then 'stay-payout-evidence' else 'finance-bank-evidence' end and o.name=p_evidence and o.owner_id=actor::text) then
    raise exception 'Bukti tidak sesuai jenis mutasi.' using errcode='22023';
  end if;$new$);
  if d=c then raise exception 'Bank return source lookup changed'; end if;
  d:=c;
  c:=replace(d,$old$  else
    select p.source_account_key,p.occurred_at,p.amount_idr into strict account_key,original_time,original_amount$old$,
    $new$  elsif source.source_kind='PAYOUT_PAID' then
    select t.source_fingerprint,t.occurred_at,w.amount_idr into strict account_key,original_time,original_amount
      from shiap_private.stay_withdrawal_transfers t join shiap_private.stay_withdrawals w on w.id=t.withdrawal_id
      where w.id=source.source_id and w.status='PAID';
  else
    select p.source_account_key,p.occurred_at,p.amount_idr into strict account_key,original_time,original_amount$new$);
  if d=c then raise exception 'Bank return associated transfer lookup changed'; end if;
  d:=c;
  c:=replace(d,$old$case when source.source_kind='RECEIPT' then 'BANK_RETURN_SUSPENSE' else 'REFUND_PAYABLE' end$old$,
    $new$case source.source_kind when 'RECEIPT' then 'BANK_RETURN_SUSPENSE'
      when 'PAYOUT_PAID' then 'PARTNER_PAYABLE' else 'REFUND_PAYABLE' end$new$);
  if d=c then raise exception 'Bank return compensation accounts changed'; end if;
  execute c;

  d:=pg_get_functiondef('public.admin_stay_finance_reconciliation(integer)'::regprocedure);
  c:=replace(d,$old$case when j.source_kind='RECEIPT' then 'BANK_RETURN_SUSPENSE' else 'REFUND_LIABILITY_REOPENED' end$old$,
    $new$case j.source_kind when 'RECEIPT' then 'BANK_RETURN_SUSPENSE' when 'PAYOUT_PAID' then 'PARTNER_PAYOUT_RETURNED'
      else 'REFUND_LIABILITY_REOPENED' end$new$);
  if d=c then raise exception 'Bank return report classification changed'; end if;
  execute c;
end $migration$;
do $migration$
declare d text; c text;
begin
  d:=pg_get_functiondef('public.read_stay_partner_wallet(uuid)'::regprocedure);
  c:=replace(d,$old$where w.item_id=v.item_id and w.status='PAID'),0) paid_idr$old$,
    $new$where w.item_id=v.item_id and w.status='PAID' and not exists (
      select 1 from shiap_private.stay_finance_bank_returns r join shiap_private.stay_finance_journals j on j.id=r.original_journal_id
      where j.source_kind='PAYOUT_PAID' and j.source_id=w.id
    )),0) paid_idr$new$);
  if d=c then raise exception 'Payout cash report changed'; end if;
  d:=c;
  c:=replace(d,$old$select w.id,w.status,w.amount_idr,w.created_at,a.last4,b.order_number$old$,
    $new$select w.id,case when exists(select 1 from shiap_private.stay_finance_bank_returns r
          join shiap_private.stay_finance_journals j on j.id=r.original_journal_id
          where j.source_kind='PAYOUT_PAID' and j.source_id=w.id) then 'RETURNED' else w.status end as status,
          w.amount_idr,w.created_at,a.last4,b.order_number$new$);
  if d=c then raise exception 'Payout history changed'; end if;
  execute c;
end $migration$;
commit;
