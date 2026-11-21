begin;

-- This projection counts only verified receipts that produced a journal.
-- Keep the full historical amount and operational hold separate from eligibility.
create view shiap_private.stay_wallet_item_balances with (security_invoker=true) as
select s.item_id,s.booking_id,b.order_number,s.vendor_id as places_id,s.partner_agreement_id,
  balances.net_idr,balances.commission_idr,balances.revenue_idr,
  case when s.cancelled_at is not null or s.review_open or f.operational_hold
      or b.payment_status <> 'paid' or st.deleted_at is not null
      or f.status in ('CANCELLED','REJECTED') or balances.bank_suspense_idr>0
      or exists(select 1 from shiap_private.unified_item_refunds refund
        where refund.item_id=s.item_id and (refund.reconcile_required or refund.status not in ('PAID','REJECTED')))
      or exists(select 1 from shiap_private.stay_finance_journals j
        join shiap_private.stay_finance_bank_returns r on r.original_journal_id=j.id
        join shiap_private.stay_finance_lines l on l.journal_id=j.id and l.item_id=s.item_id
        where j.booking_id=s.booking_id)
    then 'HELD'
    when f.status='COMPLETED' and f.check_out_at<=statement_timestamp() then 'FINAL'
    when b.order_status='confirmed' and f.status in ('CONFIRMED','CHECKED_IN','CHECKED_OUT') and c.status='ACTIVE'
    then 'EARLY'
    else 'PENDING'
  end as eligibility,
  f.check_out_at,b.created_at
from shiap_private.unified_order_items s
join public.booking_orders b on b.id=s.booking_id
left join public.booking_admin_record_state st on st.booking_id=b.id
join public.stay_partner_fulfillment f on f.item_id=s.item_id
join public.stay_partner_booking_config c on c.property_id=f.property_id and c.places_id=s.vendor_id
cross join lateral (
  select coalesce(-sum(l.delta_idr) filter(where l.account='PARTNER_PAYABLE'),0)::bigint as net_idr,
    coalesce(-sum(l.delta_idr) filter(where l.account in ('COMMISSION_DEFERRED','COMMISSION_REVENUE')),0)::bigint as commission_idr,
    coalesce(-sum(l.delta_idr) filter(where l.account='COMMISSION_REVENUE'),0)::bigint as revenue_idr,
    coalesce(sum(l.delta_idr) filter(where l.account='BANK_RETURN_SUSPENSE'),0) as bank_suspense_idr
  from shiap_private.stay_finance_lines l
  where l.item_id=s.item_id
) balances
where s.service='stay' and s.vendor_kind='places_property'
  and exists(select 1 from shiap_private.stay_finance_journals j
    join shiap_private.stay_finance_lines l on l.journal_id=j.id and l.item_id=s.item_id and l.account='BANK'
    where j.booking_id=s.booking_id and j.source_kind='RECEIPT');

revoke all on shiap_private.stay_wallet_item_balances from public,anon,authenticated,service_role;

create function public.read_stay_partner_wallet(p_places uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  wallet jsonb;
begin
  if actor is null then
    raise exception 'Partner wallet access requires authentication.' using errcode='42501';
  end if;
  if p_places is not null and not exists(select 1 from public.stay_partner_booking_config c
    where c.places_id=p_places and shiap_private.stay_partner_can_manage(c.agreement_id,c.places_id)) then
    raise exception 'Wallet properti tidak dapat diakses.' using errcode='42501';
  end if;

  with eligible_properties as materialized (
    select c.places_id,c.agreement_id,p.name
    from public.stay_partner_booking_config c join public.places_properties p on p.id=c.places_id
    where (p_places is null or c.places_id=p_places) and shiap_private.stay_partner_can_manage(c.agreement_id,c.places_id)
  ), balances as materialized (
    select v.*,e.name,case v.eligibility when 'EARLY' then greatest(v.net_idr,0)/2
      when 'FINAL' then greatest(v.net_idr,0) else 0 end as eligibility_idr
    from eligible_properties e join shiap_private.stay_wallet_item_balances v
      on v.places_id=e.places_id and v.partner_agreement_id=e.agreement_id
  )
  select jsonb_build_object(
    'totals',jsonb_build_object(
      'verified_earnings_idr',coalesce((select sum(net_idr) from balances),0)::text,
      'pending_idr',coalesce((select sum(net_idr-eligibility_idr) from balances where eligibility<>'HELD'),0)::text,
      'held_idr',coalesce((select sum(net_idr) from balances where eligibility='HELD'),0)::text,
      'eligibility_idr',coalesce((select sum(eligibility_idr) from balances),0)::text),
    'properties',coalesce((select jsonb_agg(jsonb_build_object('places_id',e.places_id,'name',e.name)
      order by e.name,e.places_id) from eligible_properties e),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(jsonb_build_object('item_id',x.item_id,'order_number',x.order_number,
      'property_name',x.name,'net_idr',x.net_idr::text,'commission_idr',x.commission_idr::text,
      'eligible_idr',x.eligibility_idr::text,'eligibility',x.eligibility,'check_out_at',x.check_out_at)
      order by x.created_at desc,x.item_id)
      from (select * from balances order by created_at desc,item_id limit 100) x),'[]'::jsonb),
    'truncated',(select count(*)>100 from balances)
  ) into wallet;

  return wallet;
end $$;

revoke all on function public.read_stay_partner_wallet(uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_stay_partner_wallet(uuid) to authenticated;
commit;
