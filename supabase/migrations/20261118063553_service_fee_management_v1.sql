-- Forward-only. Existing orders retain their totals and are not repriced.
begin;
create table public.service_fee_settings (
  category text primary key check(category in('trip','stay','activity','rental','documentation','other')),
  enabled boolean not null default false,
  mode text not null default 'percentage' check(mode in('percentage','fixed')),
  percentage_bps integer not null default 200 check(percentage_bps between 0 and 9999),
  fixed_amount bigint not null default 0 check(fixed_amount between 0 and 999999999999),
  max_percentage_bps integer not null default 1000 check(max_percentage_bps between 0 and 9999),
  version integer not null default 1,
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null,
  check(not enabled or mode<>'percentage' or percentage_bps<=max_percentage_bps)
);
insert into public.service_fee_settings(category) values('trip'),('stay'),('activity'),('rental'),('documentation'),('other');
alter table public.service_fee_settings enable row level security;
revoke all on public.service_fee_settings from public,anon,authenticated;
grant select,update on public.service_fee_settings to authenticated;
grant select on public.service_fee_settings to service_role;
create policy service_fee_admin_read on public.service_fee_settings for select to authenticated using(public.is_shiap_admin());
create policy service_fee_admin_update on public.service_fee_settings for update to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());

create table public.service_fee_settings_audit (
  id bigint generated always as identity primary key, category text not null,
  before_value jsonb not null, after_value jsonb not null,
  actor_id uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
alter table public.service_fee_settings_audit enable row level security;
revoke all on public.service_fee_settings_audit from public,anon,authenticated;
grant select on public.service_fee_settings_audit to authenticated;
create policy service_fee_audit_admin on public.service_fee_settings_audit for select to authenticated using(public.is_shiap_admin());
create function shiap_private.audit_service_fee_settings() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  if new.category<>old.category then raise exception 'Kategori tidak dapat diubah.'; end if;
  new.version:=old.version+1; new.updated_at:=clock_timestamp(); new.updated_by:=auth.uid();
  insert into public.service_fee_settings_audit(category,before_value,after_value,actor_id)
  values(old.category,to_jsonb(old),to_jsonb(new),auth.uid());
  return new;
end $$;
revoke all on function shiap_private.audit_service_fee_settings() from public,anon,authenticated;
create trigger service_fee_settings_audit before update on public.service_fee_settings
for each row execute function shiap_private.audit_service_fee_settings();

-- Integer IDR. Round percentage half-up once per category, floor the ceiling,
-- and always leave at least Rp1 of the category subtotal outside the fee.
create function shiap_private.service_fee_line(p_category text,p_subtotal bigint,p_enabled boolean,p_mode text,p_bps integer,p_fixed bigint,p_cap integer)
returns jsonb language plpgsql immutable set search_path='' as $$
declare requested bigint; ceiling bigint; actual bigint;
begin
  if p_category is null or p_category not in('trip','stay','activity','rental','documentation','other')
    or p_subtotal is null or p_subtotal<0 or p_subtotal>999999999999
    or p_enabled is null or p_mode is null or p_mode not in('percentage','fixed')
    or p_bps is null or p_bps not between 0 and 9999 or p_cap is null or p_cap not between 0 and 9999
    or p_fixed is null or p_fixed not between 0 and 999999999999
    or (p_enabled and p_mode='percentage' and p_bps>p_cap) then raise exception 'Pengaturan biaya layanan tidak valid.'; end if;
  requested:=case when not p_enabled then 0 when p_mode='fixed' then p_fixed else round(p_subtotal::numeric*p_bps/10000)::bigint end;
  ceiling:=least(floor(p_subtotal::numeric*p_cap/10000)::bigint,greatest(p_subtotal-1,0));
  actual:=least(requested,ceiling);
  return jsonb_build_object('category',p_category,'subtotal',p_subtotal,'enabled',p_enabled,'mode',p_mode,
    'percentage_bps',p_bps,'fixed_amount',p_fixed,'max_percentage_bps',p_cap,
    'requested_fee',requested,'ceiling',ceiling,'fee',actual,'total',p_subtotal+actual,'capped',actual<requested);
end $$;
revoke all on function shiap_private.service_fee_line(text,bigint,boolean,text,integer,bigint,integer) from public,anon,authenticated;

create function public.quote_service_fees(p_subtotals jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare lines jsonb; subtotal bigint; fees bigint;
begin
  if jsonb_typeof(p_subtotals)<>'array' or jsonb_array_length(p_subtotals)>20 then raise exception 'Subtotal kategori tidak valid.'; end if;
  -- Duplicate category inputs are aggregated before a fixed fee is applied.
  select coalesce(jsonb_agg(fee_calc.line order by fee_calc.category),'[]'::jsonb) into lines from (
    select g.category,shiap_private.service_fee_line(g.category,g.subtotal,c.enabled,c.mode,c.percentage_bps,c.fixed_amount,c.max_percentage_bps) as line
    from (select x->>'category' category,sum((x->>'subtotal')::numeric)::bigint subtotal from jsonb_array_elements(p_subtotals) x group by x->>'category') g
    join public.service_fee_settings c on c.category=g.category
  ) as fee_calc;
  if (select count(distinct x->>'category') from jsonb_array_elements(p_subtotals) x)<>jsonb_array_length(lines)
    or exists(select 1 from jsonb_array_elements(p_subtotals) x where x->>'category' is null or x->>'subtotal' is null or (x->>'subtotal')::numeric<0 or (x->>'subtotal')::numeric<>trunc((x->>'subtotal')::numeric)) then raise exception 'Subtotal kategori tidak valid.'; end if;
  select coalesce(sum((x->>'subtotal')::bigint),0),coalesce(sum((x->>'fee')::bigint),0) into subtotal,fees from jsonb_array_elements(lines) x;
  return jsonb_build_object('subtotal',subtotal,'fee',fees,'total',subtotal+fees,'lines',lines);
end $$;
-- This RPC is exposed only to the application server, never a public client.
revoke all on function public.quote_service_fees(jsonb) from public,anon,authenticated;
grant execute on function public.quote_service_fees(jsonb) to service_role;
grant usage on schema shiap_private to service_role;
grant execute on function shiap_private.service_fee_line(text,bigint,boolean,text,integer,bigint,integer) to service_role;

create function public.admin_preview_service_fee(p_category text,p_subtotal bigint,p_enabled boolean,p_mode text,p_bps integer,p_fixed bigint,p_cap integer)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  return shiap_private.service_fee_line(p_category,p_subtotal,p_enabled,p_mode,p_bps,p_fixed,p_cap);
end $$;
revoke all on function public.admin_preview_service_fee(text,bigint,boolean,text,integer,bigint,integer) from public,anon;
grant execute on function public.admin_preview_service_fee(text,bigint,boolean,text,integer,bigint,integer) to authenticated;

alter table public.booking_orders
  add column service_fee_version integer not null default 0 check(service_fee_version in(0,1)),
  add column package_subtotal bigint,
  add column service_fee_total bigint not null default 0 check(service_fee_total>=0),
  add column service_fee_snapshot jsonb not null default '[]'::jsonb;

create function shiap_private.snapshot_service_fees() returns trigger
language plpgsql security invoker set search_path='' as $$
declare subtotals jsonb; quote jsonb;
begin
  if new.service_fee_version is distinct from old.service_fee_version then raise exception 'Versi harga booking tidak dapat diubah.'; end if;
  if old.package_subtotal is not null then
    if new.package_subtotal is distinct from old.package_subtotal or new.service_fee_total<>old.service_fee_total
      or new.service_fee_snapshot<>old.service_fee_snapshot or new.total_amount<>old.total_amount then raise exception 'Snapshot harga booking tidak dapat diubah.'; end if;
  elsif new.package_subtotal is not null or new.service_fee_total<>0 or new.service_fee_snapshot<>'[]'::jsonb then
    raise exception 'Snapshot biaya hanya dapat dibuat oleh server.';
  elsif old.service_fee_version=1 and new.total_amount>0 then
    -- Lock tariff rows in a stable order so a concurrent admin save cannot mix
    -- revisions inside one booking. Catalog pricing has already run on items.
    perform 1 from public.service_fee_settings order by category for share;
    select jsonb_agg(jsonb_build_object('category',g.category,'subtotal',g.subtotal)) into subtotals from (
      select case when coalesce(i.service_category,'other')='other' then i.service_type else i.service_category end category,
        sum(round(case when i.service_type='trip' or i.price_basis='per_person' then i.unit_price*i.guests*i.quantity
          when i.service_type='stay' then i.unit_price*greatest(i.date_end-i.date_start,1)*i.quantity else i.unit_price*i.quantity end))::bigint subtotal
      from public.booking_items i where i.booking_id=new.id group by 1
    ) g;
    if subtotals is null then raise exception 'Booking tidak memiliki harga paket.'; end if;
    quote:=public.quote_service_fees(subtotals);
    new.package_subtotal:=(quote->>'subtotal')::bigint; new.service_fee_total:=(quote->>'fee')::bigint;
    new.service_fee_snapshot:=quote->'lines'; new.total_amount:=(quote->>'total')::bigint;
  end if;
  return new;
end $$;
revoke all on function shiap_private.snapshot_service_fees() from public,anon,authenticated;
create trigger booking_service_fee_snapshot before update on public.booking_orders
for each row execute function shiap_private.snapshot_service_fees();

create function shiap_private.guard_priced_booking_items() returns trigger
language plpgsql set search_path='' as $$
declare order_id uuid;
begin
  order_id:=case when tg_op='INSERT' then new.booking_id else old.booking_id end;
  perform 1 from public.booking_orders where id=order_id and package_subtotal is not null for update;
  if found then raise exception 'Item pada snapshot booking tidak dapat diubah. Buat booking baru untuk perubahan layanan.'; end if;
  if tg_op='UPDATE' and new.booking_id<>old.booking_id then
    perform 1 from public.booking_orders where id=new.booking_id and package_subtotal is not null for update;
    if found then raise exception 'Booking sudah memiliki snapshot harga.'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function shiap_private.guard_priced_booking_items() from public,anon,authenticated;
create trigger aa_guard_priced_booking_items before insert or update or delete on public.booking_items
for each row execute function shiap_private.guard_priced_booking_items();

-- Extend the existing authoritative engine, including its nested Experience
-- entry point. Keep auth, inventory locks, guest support and idempotency intact.
do $$ declare definition text; changed text;
begin
  definition:=pg_get_functiondef('public.create_booking_order(text,text,text,text,jsonb)'::regprocedure);
  changed:=replace(definition,'customer_notes,inventory_hold_expires_at)','customer_notes,inventory_hold_expires_at,service_fee_version)');
  changed:=replace(changed,'clock_timestamp()+interval ''15 minutes'')','clock_timestamp()+interval ''15 minutes'',1)');
  if changed=definition or position('customer_notes,inventory_hold_expires_at,service_fee_version)' in changed)=0 then raise exception 'Booking engine signature changed. Review fee integration.'; end if;
  execute changed;
end $$;

create function shiap_private.validate_service_fee_payment() returns trigger
language plpgsql security invoker set search_path='' as $$
declare b public.booking_orders%rowtype; sum_fee bigint; sum_base bigint; line jsonb; expected jsonb;
begin
  select * into b from public.booking_orders where id=new.booking_id for update;
  if b.service_fee_version=0 then return new; end if;
  if b.package_subtotal is null then raise exception 'Snapshot harga booking belum tersedia.'; end if;
  sum_fee:=0; sum_base:=0;
  for line in select value from jsonb_array_elements(b.service_fee_snapshot) loop
    expected:=shiap_private.service_fee_line(line->>'category',(line->>'subtotal')::bigint,(line->>'enabled')::boolean,
      line->>'mode',(line->>'percentage_bps')::integer,(line->>'fixed_amount')::bigint,(line->>'max_percentage_bps')::integer);
    if expected<>line then raise exception 'Snapshot biaya layanan tidak valid.'; end if;
    sum_fee:=sum_fee+(line->>'fee')::bigint; sum_base:=sum_base+(line->>'subtotal')::bigint;
  end loop;
  if sum_fee<>b.service_fee_total or sum_base<>b.package_subtotal or b.total_amount<>sum_base+sum_fee then raise exception 'Total pembayaran tidak sesuai snapshot.'; end if;
  return new;
end $$;
revoke all on function shiap_private.validate_service_fee_payment() from public,anon,authenticated;
create trigger booking_proof_validate_fee before insert on public.booking_payment_records
for each row execute function shiap_private.validate_service_fee_payment();
create trigger booking_ledger_validate_fee before insert or update on public.finance_transaction_entries
for each row when(new.entry_type='payment' and new.status='posted') execute function shiap_private.validate_service_fee_payment();

-- Fee is a component of the existing payment, never a second ledger payment.
-- Keep existing completed+paid recognition. Allocate unscoped refunds pro-rata
-- to package and fee. A full refund reverses the entire collected fee.
do $$ declare definition text;
begin
  definition:=rtrim(pg_get_viewdef('public.finance_booking_profit_v'::regclass,true),E';\n ');
  execute 'create or replace view public.finance_booking_profit_v with(security_invoker=true) as
    select b.*,o.service_fee_total as service_fee_amount,coalesce(f.fee_cash,0) as service_fee_cash_received,
    coalesce(f.fee_cash-f.fee_net,0) as service_fee_refunded,
    case when b.order_status=''completed'' and b.payment_status=''paid'' then coalesce(f.fee_net,0) else 0 end::numeric(14,2) as service_fee_recognized_revenue,
    (b.recognized_revenue-case when b.order_status=''completed'' and b.payment_status=''paid'' then coalesce(f.fee_net,0) else 0 end)::numeric(14,2) as package_recognized_revenue
    from ('||definition||') b join public.booking_orders o on o.id=b.id
    left join lateral (select coalesce(sum(e.amount),0) actual_paid from public.finance_transaction_entries e
      where e.booking_id=b.id and e.entry_type=''payment'' and e.status=''posted'') cash on true
    cross join lateral (select
      floor(o.service_fee_total*least(cash.actual_paid,o.total_amount)/nullif(o.total_amount,0))::numeric(14,2) fee_cash,
      floor(o.service_fee_total*greatest(least(cash.actual_paid,o.total_amount)-b.refunds,0)/nullif(o.total_amount,0))::numeric(14,2) fee_net) f';
end $$;
create or replace view public.finance_service_profit_v with (security_invoker=true) as
with item_sales as (
  select bi.id,bi.booking_id,
    case when coalesce(bi.service_category,'other')='other' then bi.service_type else bi.service_category end service_type,
    (case when bi.service_type='trip' or bi.price_basis='per_person' then bi.unit_price*bi.guests*bi.quantity
      when bi.service_type='stay' then bi.unit_price*greatest(coalesce(bi.date_end-bi.date_start,1),1)*bi.quantity
      else bi.unit_price*bi.quantity end)::numeric(14,2) gross_item_sales
  from public.booking_items bi
), order_sales as (
  select booking_id,sum(gross_item_sales)::numeric(14,2) gross_total from item_sales group by booking_id
), item_costs as (
  select booking_item_id,sum(estimated_cost)::numeric(14,2) estimated_direct_cost
  from public.finance_booking_cost_snapshots group by booking_item_id
), item_expenses as (
  select booking_item_id,sum(amount)::numeric(14,2) actual_direct_cost
  from public.finance_expenses where status='approved' and booking_item_id is not null group by booking_item_id
), service_pnl as (
  select s.service_type,
    sum(case when o.order_status='completed' and o.payment_status='paid'
      then case when nullif(os.gross_total,0) is null then 0
        else p.package_recognized_revenue*s.gross_item_sales/os.gross_total end
      else 0 end)::numeric(14,2) recognized_revenue,
    sum(coalesce(c.estimated_direct_cost,0))::numeric(14,2) estimated_direct_cost,
    sum(coalesce(x.actual_direct_cost,0)+case when nullif(os.gross_total,0) is null then 0
      else (coalesce(booking_expenses.amount,0)+coalesce(fees.amount,0))*s.gross_item_sales/os.gross_total end)::numeric(14,2) actual_direct_cost,
    sum(case when o.order_status='completed' and o.payment_status='paid'
      then case when nullif(os.gross_total,0) is null then 0
        else p.package_recognized_revenue*s.gross_item_sales/os.gross_total end
        -coalesce(x.actual_direct_cost,0)-case when nullif(os.gross_total,0) is null then 0
          else (coalesce(booking_expenses.amount,0)+coalesce(fees.amount,0))*s.gross_item_sales/os.gross_total end
      else 0 end)::numeric(14,2) contribution_profit,
    count(distinct s.booking_id)::integer booking_count
  from item_sales s join public.booking_orders o on o.id=s.booking_id
  join public.finance_booking_profit_v p on p.id=o.id
  left join order_sales os on os.booking_id=s.booking_id
  left join item_costs c on c.booking_item_id=s.id
  left join item_expenses x on x.booking_item_id=s.id
  left join lateral (select sum(amount) amount from public.finance_transaction_entries where booking_id=s.booking_id and entry_type='refund' and status='posted') refunds on true
  left join lateral (select sum(amount) amount from public.finance_transaction_entries where booking_id=s.booking_id and entry_type='processing_fee' and status='posted') fees on true
  left join lateral (select sum(amount) amount from public.finance_expenses where booking_id=s.booking_id and booking_item_id is null and status='approved') booking_expenses on true
  group by s.service_type
), service_expenses as (
  select service_type,sum(amount)::numeric(14,2) amount from public.finance_expenses
  where status='approved' and booking_id is null and booking_item_id is null and service_type is not null
  group by service_type
)
select p.service_type,p.recognized_revenue,p.estimated_direct_cost,
  (p.actual_direct_cost+coalesce(e.amount,0))::numeric(14,2) actual_direct_cost,
  (p.contribution_profit-coalesce(e.amount,0))::numeric(14,2) contribution_profit,
  p.booking_count
from service_pnl p left join service_expenses e on e.service_type=p.service_type
union all
select e.service_type,0::numeric(14,2),0::numeric(14,2),e.amount,(-e.amount)::numeric(14,2),0::integer
from service_expenses e where not exists(select 1 from service_pnl p where p.service_type=e.service_type)
union all
select 'platform',coalesce(sum(service_fee_recognized_revenue),0)::numeric(14,2),0::numeric(14,2),0::numeric(14,2),
  coalesce(sum(service_fee_recognized_revenue),0)::numeric(14,2),count(*)::integer
from public.finance_booking_profit_v where service_fee_amount>0 having count(*)>0;

commit;
