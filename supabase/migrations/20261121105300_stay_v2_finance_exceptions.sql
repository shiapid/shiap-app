begin;

create function shiap_private.guard_stay_finance_returned_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from shiap_private.stay_finance_journals j
    join shiap_private.stay_finance_bank_returns r on r.original_journal_id=j.id
    where j.booking_id=new.booking_id and j.source_kind='RECEIPT') then
    raise exception 'Mutasi penerimaan dikembalikan bank. Rekonsiliasi Finance wajib sebelum refund.' using errcode='23514';
  end if;
  return new;
end $$;

create trigger stay_finance_returned_receipt_approval
before update of approved_idr on shiap_private.unified_item_refunds for each row
when (old.approved_idr is null and new.approved_idr is not null)
execute function shiap_private.guard_stay_finance_returned_receipt();
create trigger stay_finance_returned_receipt_refund
before insert on public.finance_transaction_entries for each row
when (new.unified_refund_payout_id is not null)
execute function shiap_private.guard_stay_finance_returned_receipt();

revoke all on function shiap_private.guard_stay_finance_returned_receipt() from public,anon,authenticated,service_role;

create or replace function public.admin_stay_finance_reconciliation(p_limit integer default 100)
returns table(booking_id uuid,receipt_id uuid,state text,observed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_shiap_admin() then
    raise exception 'Finance Admin access required.' using errcode='42501';
  end if;

  return query
    select e.order_id,e.reference_id,e.issue,e.issue_at from (
      select f.booking_id order_id,f.id reference_id,
        case when f.status='reversed' then 'REVERSED_RECEIPT_REVIEW'
          when f.bank_transfer_id is null then 'BANK_IDENTITY_REQUIRED'
          when u.booking_id is null then 'LEGACY_PARTNER_ALLOCATION_REQUIRED'
          else 'OPENING_RECONCILIATION_REQUIRED' end issue,f.created_at issue_at
      from public.finance_transaction_entries f
      left join shiap_private.unified_orders u on u.booking_id=f.booking_id
      left join public.stay_partner_fulfillment s on s.order_id=f.booking_id
      left join shiap_private.stay_finance_journals j on j.source_kind='RECEIPT' and j.source_id=f.id
      where f.entry_type='payment' and (u.booking_id is not null or s.order_id is not null)
        and (j.id is null or f.status='reversed')
      union all
      select j.booking_id,r.id,
        case when j.source_kind='RECEIPT' then 'BANK_RETURN_SUSPENSE' else 'REFUND_LIABILITY_REOPENED' end,
        r.occurred_at
      from shiap_private.stay_finance_bank_returns r
      join shiap_private.stay_finance_journals j on j.id=r.original_journal_id
    ) e order by e.issue_at desc,e.reference_id limit greatest(1,least(coalesce(p_limit,100),500));
end $$;

create function public.admin_stay_finance_item_balance(p_booking uuid)
returns table(item_id uuid,service text,vendor_kind text,vendor_id uuid,account text,delta_idr numeric)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_shiap_admin() then
    raise exception 'Finance Admin access required.' using errcode='42501';
  end if;
  return query select s.item_id,s.service,s.vendor_kind,s.vendor_id,l.account,sum(l.delta_idr)
    from shiap_private.unified_order_items s join shiap_private.stay_finance_lines l on l.item_id=s.item_id
    where s.booking_id=p_booking
    group by s.item_id,s.service,s.vendor_kind,s.vendor_id,l.account
    order by s.item_id,l.account;
end $$;

revoke all on function public.admin_stay_finance_item_balance(uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_stay_finance_item_balance(uuid) to authenticated;
commit;
