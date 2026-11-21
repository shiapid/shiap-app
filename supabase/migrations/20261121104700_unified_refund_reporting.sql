begin;

create function shiap_private.unified_refund_summary(p_item uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'eligible',s.subtotal_idr-s.discount_idr,
    'paid',coalesce((select sum(r.paid_idr) from shiap_private.unified_item_refunds r where r.item_id=s.item_id),0),
    'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'status',r.status,'requested',r.requested_idr,
      'approved',r.approved_idr,'paid',r.paid_idr,'updated_at',r.updated_at) order by r.requested_at desc,r.id)
      from (select * from shiap_private.unified_item_refunds q where q.item_id=s.item_id order by q.requested_at desc,q.id limit 20) r),'[]'::jsonb)
  ) from shiap_private.unified_order_items s where s.item_id=p_item
$$;
revoke all on function shiap_private.unified_refund_summary(uuid) from public,anon,authenticated,service_role;

do $migration$
declare d text; c text;
begin
  d:=pg_get_functiondef('public.server_unified_booking_view(uuid)'::regprocedure);
  c:=replace(d,$old$'fulfillment',coalesce(f.status,s.fulfillment),'review_open',s.review_open,$old$,
    $new$'fulfillment',case when s.cancelled_at is not null then 'CANCELLED' else coalesce(f.status,s.fulfillment) end,
    'review_open',s.review_open,'cancelled_at',s.cancelled_at,'refund',shiap_private.unified_refund_summary(s.item_id),$new$);
  c:=replace(c,$old$'reservation',case when b.order_status='expired'$old$,
    $new$'reservation',case when s.cancelled_at is not null then 'released' when b.order_status='expired'$new$);
  if d=c then raise exception 'Unified customer projection changed.'; end if;
  execute c;

  d:=pg_get_functiondef('public.read_stay_partner_operations(uuid,date,date)'::regprocedure);
  c:=replace(d,$old$i.service_name,i.room_type_id,i.quantity,i.guests,f.check_in_at,f.check_out_at,f.operational_hold$old$,
    $new$i.service_name,i.room_type_id,i.quantity,i.guests,f.check_in_at,f.check_out_at,f.operational_hold,
      shiap_private.unified_refund_summary(i.id) as refund$new$);
  if d=c then raise exception 'Partner booking projection changed.'; end if;
  execute c;
end $migration$;

create view shiap_private.unified_item_accounting as
select s.item_id,s.booking_id,s.service,s.vendor_kind,s.vendor_id,s.cancelled_at,s.subtotal_idr as gross,
  s.discount_idr as discount,s.tax_idr as tax,s.service_fee_idr as service_fee,s.commission_bps,
  s.subtotal_idr-s.discount_idr+s.tax_idr+s.service_fee_idr as original_amount,
  case when b.payment_status='paid' then s.subtotal_idr-s.discount_idr+s.tax_idr+s.service_fee_idr else 0 end as customer_payment,
  a.requested,a.liability,a.executed,a.issues,
  s.subtotal_idr-s.discount_idr-a.executed as principal_remaining,
  s.subtotal_idr-s.discount_idr+s.tax_idr+s.service_fee_idr-a.executed as remaining_value,
  case when s.service='stay' then (s.subtotal_idr-s.discount_idr)*s.commission_bps/10000 end as original_commission,
  case when s.service='stay' then (s.subtotal_idr-s.discount_idr-a.executed)*s.commission_bps/10000 end as remaining_commission,
  case when s.service='stay' then (s.subtotal_idr-s.discount_idr-a.executed)-
    (s.subtotal_idr-s.discount_idr-a.executed)*s.commission_bps/10000 end as remaining_vendor_share,
  case when b.order_status='completed' and b.payment_status='paid' and s.cancelled_at is null
    then s.subtotal_idr-s.discount_idr-a.executed else 0 end as recognized_principal,
  case when b.order_status='completed' and b.payment_status='paid' and s.cancelled_at is null
    then s.service_fee_idr else 0 end as recognized_fee
from shiap_private.unified_order_items s join public.booking_orders b on b.id=s.booking_id
cross join lateral (
  select coalesce(sum(r.requested_idr) filter(where r.status in ('REQUESTED','UNDER_REVIEW')),0)::bigint as requested,
    coalesce(sum(r.approved_idr) filter(where r.status in ('APPROVED','PENDING_PAYMENT','FAILED')),0)::bigint as liability,
    coalesce(sum(case when r.status='PAID' then f.amount else 0 end),0)::bigint as executed,
    count(*) filter(where r.reconcile_required or (r.status='PAID' and (f.id is null or f.amount<>r.paid_idr))) as issues
  from shiap_private.unified_item_refunds r left join shiap_private.unified_refund_payouts p on p.refund_id=r.id
  left join public.finance_transaction_entries f on f.unified_refund_payout_id=p.id and f.status='posted'
  where r.item_id=s.item_id
) a;
revoke all on shiap_private.unified_item_accounting from public,anon,authenticated,service_role;

create function public.admin_unified_refund_report(p_booking uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare orders uuid[]; items jsonb; requests jsonb;
begin
  if auth.uid() is null or not public.is_shiap_admin() then raise exception 'Akses Finance Admin diperlukan.' using errcode='42501'; end if;
  if p_booking is null then
    select array_agg(id) into orders from (
      select r.booking_id as id from shiap_private.unified_item_refunds r
      group by r.booking_id order by bool_or(r.status not in ('PAID','REJECTED') or r.reconcile_required) desc,max(r.updated_at) desc limit 75
    ) q;
  else orders:=array[p_booking]; end if;

  select jsonb_agg(to_jsonb(a)||jsonb_build_object('service_name',i.service_name,'order_number',b.order_number,
    'payment_status',b.payment_status,'order_status',b.order_status,
    'remaining_eligible',a.gross-a.discount-shiap_private.unified_refund_reserved(a.item_id),
    'receipt_total',coalesce((select sum(f.amount) from public.finance_transaction_entries f where f.booking_id=b.id and f.entry_type='payment' and f.status='posted'),0)
  ) order by b.created_at desc,a.service) into items
  from shiap_private.unified_item_accounting a join public.booking_orders b on b.id=a.booking_id
  join public.booking_items i on i.id=a.item_id where a.booking_id=any(orders);

  select jsonb_agg(to_jsonb(q) order by q.updated_at desc,q.id) into requests from (
    select r.id,r.item_id,r.booking_id,r.status,r.reason,r.original_idr,r.eligible_idr,r.requested_idr,r.approved_idr,r.paid_idr,
      r.approved_by,r.approved_at,r.requested_at,r.updated_at,r.reconcile_required,r.policy_snapshot,
      p.source_transaction_id as bank_id,p.display_reference as bank_reference,p.occurred_at as paid_at,
      a.action as last_action
    from shiap_private.unified_item_refunds r left join shiap_private.unified_refund_payouts p on p.refund_id=r.id
    left join lateral (select action from shiap_private.unified_refund_actions u where u.refund_id=r.id order by u.occurred_at desc limit 1) a on true
    where r.booking_id=any(orders)
    order by (r.status not in ('PAID','REJECTED') or r.reconcile_required) desc,r.updated_at desc limit 300
  ) q;
  return jsonb_build_object('items',coalesce(items,'[]'::jsonb),'requests',coalesce(requests,'[]'::jsonb));
end $$;
revoke all on function public.admin_unified_refund_report(uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_unified_refund_report(uuid) to authenticated;

-- These scalar readers are used inside security-invoker Finance views. An
-- authenticated non-admin cannot use them to read private allocations.
create function shiap_private.finance_unified_recognition(p_booking uuid,p_item uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.is_shiap_admin() and count(*)>0 then jsonb_build_object(
    'principal',sum(case when a.service='stay' then 0 else a.recognized_principal end),
    'fee',sum(a.recognized_fee),'fee_cash',sum(case when a.customer_payment>0 then a.service_fee else 0 end)
  ) end
  from shiap_private.unified_item_accounting a
  where (p_booking is not null and a.booking_id=p_booking) or (p_item is not null and a.item_id=p_item)
$$;
revoke all on function shiap_private.finance_unified_recognition(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function shiap_private.finance_unified_recognition(uuid,uuid) to authenticated,service_role;

do $migration$
declare legacy text; d text; c text;
begin
  legacy:=pg_get_viewdef('public.finance_booking_profit_v'::regclass);
  execute 'create or replace view public.finance_booking_profit_v with (security_invoker=true) as
  with base as ('||rtrim(legacy,E';\n\r ')||') select b.id,b.order_number,b.order_status,b.payment_status,b.created_at,
    b.payable_amount,b.discount_amount,b.gross_sales,b.net_sales,t.revenue as recognized_revenue,
    b.cash_received,b.refunds,b.estimated_direct_cost,b.actual_direct_cost,b.processing_fees,b.receivable,
    (t.revenue-b.estimated_direct_cost)::numeric(14,2) as estimated_profit,
    (t.revenue-b.actual_direct_cost)::numeric(14,2) as contribution_profit,
    (case when b.net_sales>0 then round((t.revenue-b.actual_direct_cost)/b.net_sales*100,2) else 0 end)::numeric(7,2) as profit_margin,
    b.recognized_at,b.service_fee_amount,
    coalesce((u.data->>''fee_cash'')::numeric,b.service_fee_cash_received) as service_fee_cash_received,
    (case when u.data is not null then 0 else b.service_fee_refunded end) as service_fee_refunded,
    coalesce((u.data->>''fee'')::numeric,b.service_fee_recognized_revenue)::numeric(14,2) as service_fee_recognized_revenue,
    coalesce((u.data->>''principal'')::numeric,b.package_recognized_revenue)::numeric(14,2) as package_recognized_revenue,
    u.data is not null as is_unified
  from base b cross join lateral (select shiap_private.finance_unified_recognition(b.id,null) as data) u
  cross join lateral (select coalesce((u.data->>''principal'')::numeric+(u.data->>''fee'')::numeric,b.recognized_revenue)::numeric(14,2) as revenue) t';

  d:=pg_get_viewdef('public.finance_service_profit_v'::regclass);
  c:=replace(d,'((p.package_recognized_revenue * s.gross_item_sales) / os.gross_total)',
    'coalesce((shiap_private.finance_unified_recognition(null,s.id)->>''principal'')::numeric,
      ((p.package_recognized_revenue * s.gross_item_sales) / os.gross_total))');
  if d=c then raise exception 'Finance service allocation view changed.'; end if;
  execute 'create or replace view public.finance_service_profit_v with (security_invoker=true) as '||c;
end $migration$;

commit;
