-- SHIAP Finance & Profit Analytics V1 (additive; local/staging first).
-- Existing booking/payment RPC contracts stay intact. Financial data is admin-only.
begin;

create table public.finance_expense_categories (
  id text primary key,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.finance_expense_categories(id,name) values
  ('transport','Transportasi'),('accommodation','Akomodasi'),('activity','Aktivitas'),
  ('documentation','Dokumentasi'),('equipment','Peralatan'),('food','Konsumsi'),
  ('operations','Operasional'),('marketing','Pemasaran'),('payment_fee','Biaya Pembayaran'),('other','Lainnya')
on conflict(id) do nothing;

create table public.finance_cost_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  service_type text not null check (service_type in ('trip','stay','rental','activity','documentation','other')),
  product_id uuid,
  cost_basis text not null check (cost_basis in ('fixed_per_booking','per_participant','per_night','per_hour','per_day','per_unit','percentage')),
  amount numeric(14,2) not null check (amount >= 0),
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cost_basis <> 'percentage' or amount <= 100)
);
create index finance_cost_templates_match_idx on public.finance_cost_templates(service_type,is_active,product_id);
create trigger finance_cost_templates_updated_at before update on public.finance_cost_templates
  for each row execute function public.set_shiap_updated_at();

create table public.finance_booking_cost_snapshots (
  booking_item_id uuid primary key references public.booking_items(id) on delete cascade,
  booking_id uuid not null references public.booking_orders(id) on delete cascade,
  service_type text not null,
  product_id uuid,
  estimated_cost numeric(14,2) not null default 0 check (estimated_cost >= 0),
  components jsonb not null default '[]'::jsonb check (jsonb_typeof(components)='array'),
  snapshotted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index finance_cost_snapshots_booking_idx on public.finance_booking_cost_snapshots(booking_id);

create table public.finance_cost_recalculation_audit (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.booking_orders(id) on delete restrict,
  booking_item_id uuid not null references public.booking_items(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  reason text not null,
  previous_snapshot jsonb not null,
  next_snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index finance_cost_recalculation_audit_booking_idx on public.finance_cost_recalculation_audit(booking_id,created_at desc);

create table public.finance_transaction_entries (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.booking_orders(id) on delete restrict,
  entry_type text not null check (entry_type in ('payment','refund','processing_fee','discount')),
  amount numeric(14,2) not null check (amount > 0),
  source_type text not null check (source_type in ('admin','booking_payment_proof','payment_gateway','migration')),
  source_id text,
  idempotency_key text not null unique check (length(idempotency_key) between 8 and 180),
  external_reference text,
  note text,
  status text not null default 'posted' check (status in ('posted','reversed')),
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null
);
create index finance_transaction_entries_booking_idx on public.finance_transaction_entries(booking_id,created_at desc);
create index finance_transaction_entries_type_idx on public.finance_transaction_entries(entry_type,created_at desc) where status='posted';

create table public.finance_expenses (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.booking_orders(id) on delete restrict,
  booking_item_id uuid references public.booking_items(id) on delete restrict,
  service_type text check (service_type is null or service_type in ('trip','stay','rental','activity','documentation','other')),
  category_id text not null references public.finance_expense_categories(id) on delete restrict,
  supplier_name text,
  description text not null check (length(trim(description)) between 2 and 500),
  amount numeric(14,2) not null check (amount > 0),
  expense_date date not null default current_date,
  receipt_path text,
  external_reference text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','void')),
  status_note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (booking_item_id is null or booking_id is not null)
);
create index finance_expenses_date_status_idx on public.finance_expenses(expense_date desc,status);
create index finance_expenses_booking_idx on public.finance_expenses(booking_id,expense_date desc) where booking_id is not null;
create trigger finance_expenses_updated_at before update on public.finance_expenses
  for each row execute function public.set_shiap_updated_at();

create table public.finance_expense_audit (
  id bigint generated always as identity primary key,
  expense_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('insert','update','delete')),
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);
create index finance_expense_audit_expense_idx on public.finance_expense_audit(expense_id,created_at desc);

alter table public.finance_expense_categories enable row level security;
alter table public.finance_cost_templates enable row level security;
alter table public.finance_booking_cost_snapshots enable row level security;
alter table public.finance_cost_recalculation_audit enable row level security;
alter table public.finance_transaction_entries enable row level security;
alter table public.finance_expenses enable row level security;
alter table public.finance_expense_audit enable row level security;
create policy finance_categories_admin_read on public.finance_expense_categories for select to authenticated using(public.is_shiap_admin());
create policy finance_cost_templates_admin_all on public.finance_cost_templates for all to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create policy finance_cost_snapshots_admin_read on public.finance_booking_cost_snapshots for select to authenticated using(public.is_shiap_admin());
create policy finance_cost_audit_admin_read on public.finance_cost_recalculation_audit for select to authenticated using(public.is_shiap_admin());
create policy finance_transaction_admin_read on public.finance_transaction_entries for select to authenticated using(public.is_shiap_admin());
create policy finance_expenses_admin_all on public.finance_expenses for all to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create policy finance_expense_audit_admin_read on public.finance_expense_audit for select to authenticated using(public.is_shiap_admin());
revoke all on public.finance_expense_categories,public.finance_cost_templates,public.finance_booking_cost_snapshots,
  public.finance_cost_recalculation_audit,public.finance_transaction_entries,public.finance_expenses,public.finance_expense_audit from anon,authenticated;
grant select on public.finance_expense_categories,public.finance_cost_templates,public.finance_booking_cost_snapshots,
  public.finance_cost_recalculation_audit,public.finance_transaction_entries,public.finance_expenses,public.finance_expense_audit to authenticated;
grant insert,update on public.finance_cost_templates,public.finance_expenses to authenticated;
grant all on public.finance_expense_categories,public.finance_cost_templates,public.finance_booking_cost_snapshots,
  public.finance_cost_recalculation_audit,public.finance_transaction_entries,public.finance_expenses,public.finance_expense_audit to service_role;
grant usage,select on sequence public.finance_cost_recalculation_audit_id_seq,public.finance_expense_audit_id_seq to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('shiap-finance-receipts','shiap-finance-receipts',false,8388608,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=8388608,allowed_mime_types=excluded.allowed_mime_types;
create policy finance_receipts_admin_read on storage.objects for select to authenticated using(bucket_id='shiap-finance-receipts' and public.is_shiap_admin());
create policy finance_receipts_admin_insert on storage.objects for insert to authenticated with check(bucket_id='shiap-finance-receipts' and public.is_shiap_admin());
create policy finance_receipts_admin_update on storage.objects for update to authenticated using(bucket_id='shiap-finance-receipts' and public.is_shiap_admin()) with check(bucket_id='shiap-finance-receipts' and public.is_shiap_admin());
create policy finance_receipts_admin_delete on storage.objects for delete to authenticated using(bucket_id='shiap-finance-receipts' and public.is_shiap_admin());

comment on table public.finance_cost_templates is 'Internal estimated direct cost rules; never exposed to customer roles.';
comment on table public.finance_booking_cost_snapshots is 'Cost copies captured when items are inserted; changes require an audited admin recalculation.';
comment on table public.finance_transaction_entries is 'Idempotent payment, refund, fee, and discount ledger for finance reporting.';
comment on table public.finance_expenses is 'Manual actual expenses; receipts are stored in a private bucket.';

create or replace function public.finance_audit_expense_change()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' then
    insert into public.finance_expense_audit(expense_id,actor_user_id,action,old_values)
    values(old.id,auth.uid(),'delete',to_jsonb(old));
    return old;
  elsif tg_op='UPDATE' then
    insert into public.finance_expense_audit(expense_id,actor_user_id,action,old_values,new_values)
    values(new.id,auth.uid(),'update',to_jsonb(old),to_jsonb(new));
    return new;
  end if;
  insert into public.finance_expense_audit(expense_id,actor_user_id,action,new_values)
  values(new.id,auth.uid(),'insert',to_jsonb(new));
  return new;
end $$;
create trigger finance_expenses_audit after insert or update or delete on public.finance_expenses
  for each row execute function public.finance_audit_expense_change();

create or replace function public.finance_check_expense_booking_item()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.booking_item_id is not null and not exists (
    select 1 from public.booking_items bi where bi.id=new.booking_item_id and bi.booking_id=new.booking_id
  ) then raise exception 'Booking item tidak cocok dengan booking.'; end if;
  if new.receipt_path is not null and new.receipt_path !~ ('^'||new.created_by::text||'/[0-9a-f-]{36}/[^/]+$') then
    raise exception 'Path bukti pengeluaran tidak valid.';
  end if;
  return new;
end $$;
create trigger finance_expenses_validate before insert or update on public.finance_expenses
  for each row execute function public.finance_check_expense_booking_item();

create or replace function public.finance_snapshot_booking_item(p_item_id uuid,p_force boolean default false,p_reason text default null)
returns numeric language plpgsql security definer set search_path=public,pg_temp as $$
declare
  bi public.booking_items%rowtype;
  t record;
  existing public.finance_booking_cost_snapshots%rowtype;
  product_key uuid;
  service_key text;
  nights numeric;
  duration_match text[];
  duration_hours numeric:=0;
  sales_basis numeric;
  multiplier numeric;
  line_cost numeric;
  total_cost numeric:=0;
  lines jsonb:='[]'::jsonb;
begin
  if p_force and not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  select * into bi from public.booking_items where id=p_item_id;
  if not found then raise exception 'Booking item tidak ditemukan.'; end if;
  select * into existing from public.finance_booking_cost_snapshots where booking_item_id=p_item_id;
  if found and not p_force then return existing.estimated_cost; end if;
  service_key:=case when coalesce(bi.service_category,'other')='other' then bi.service_type else bi.service_category end;
  product_key:=coalesce(bi.service_catalog_id,bi.trip_id,bi.room_type_id,bi.property_id);
  nights:=greatest(coalesce(bi.date_end-bi.date_start,1),1);
  duration_match:=regexp_match(coalesce(bi.variant,''),'([0-9]+([.,][0-9]+)?)[[:space:]]*(jam|hours?|menit|minutes?)','i');
  if duration_match is not null then
    duration_hours:=replace(duration_match[1],',','.')::numeric;
    if lower(duration_match[3]) in ('menit','minute','minutes') then duration_hours:=duration_hours/60; end if;
  end if;
  sales_basis:=case
    when bi.service_type='trip' or bi.price_basis='per_person' then bi.unit_price*bi.guests*bi.quantity
    when bi.service_type='stay' then bi.unit_price*nights*bi.quantity
    else bi.unit_price*bi.quantity
  end;
  -- Lock the order while assigning fixed-per-booking costs so concurrent item inserts do not duplicate them.
  perform 1 from public.booking_orders where id=bi.booking_id for update;
  for t in
    select * from public.finance_cost_templates c
    where c.is_active and c.service_type=service_key and (c.product_id is null or c.product_id=product_key)
    order by c.created_at,c.id
  loop
    if t.cost_basis='fixed_per_booking' and exists (
      select 1 from public.finance_booking_cost_snapshots s
      cross join lateral jsonb_array_elements(s.components) as component(value)
      where s.booking_id=bi.booking_id and s.booking_item_id<>bi.id and component.value->>'template_id'=t.id::text
    ) then continue; end if;
    multiplier:=case t.cost_basis
      when 'fixed_per_booking' then 1
      when 'per_participant' then bi.guests*bi.quantity
      when 'per_night' then nights*bi.quantity
      when 'per_hour' then duration_hours*bi.quantity
      when 'per_day' then nights*bi.quantity
      when 'per_unit' then bi.quantity
      when 'percentage' then sales_basis/100
      else 0
    end;
    line_cost:=round(t.amount*multiplier,2);
    total_cost:=total_cost+line_cost;
    lines:=lines||jsonb_build_array(jsonb_build_object(
      'template_id',t.id,'name',t.name,'basis',t.cost_basis,'rate',t.amount,
      'multiplier',multiplier,'estimated_cost',line_cost,'product_id',t.product_id
    ));
  end loop;
  if existing.booking_item_id is not null then
    insert into public.finance_cost_recalculation_audit(booking_id,booking_item_id,actor_user_id,reason,previous_snapshot,next_snapshot)
    values(bi.booking_id,bi.id,auth.uid(),coalesce(nullif(trim(p_reason),''),'Rekalkulasi biaya booking'),
      jsonb_build_object('estimated_cost',existing.estimated_cost,'components',existing.components,'snapshotted_at',existing.snapshotted_at),
      jsonb_build_object('estimated_cost',total_cost,'components',lines,'snapshotted_at',now()));
  end if;
  insert into public.finance_booking_cost_snapshots(booking_item_id,booking_id,service_type,product_id,estimated_cost,components,snapshotted_at,updated_at)
  values(bi.id,bi.booking_id,service_key,product_key,total_cost,lines,now(),now())
  on conflict(booking_item_id) do update set service_type=excluded.service_type,product_id=excluded.product_id,
    estimated_cost=excluded.estimated_cost,components=excluded.components,snapshotted_at=excluded.snapshotted_at,updated_at=now();
  return total_cost;
end $$;
revoke all on function public.finance_snapshot_booking_item(uuid,boolean,text) from public,anon,authenticated;

create or replace function public.finance_on_booking_item_insert()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin perform public.finance_snapshot_booking_item(new.id,false,null); return new; end $$;
create trigger finance_booking_item_cost_snapshot after insert on public.booking_items
  for each row execute function public.finance_on_booking_item_insert();

-- Historical items receive a snapshot using the cost templates configured at migration time.
do $$ declare x record; begin
  for x in select id from public.booking_items order by created_at,id loop
    perform public.finance_snapshot_booking_item(x.id,false,null);
  end loop;
end $$;

create or replace function public.finance_recalculate_booking_costs(p_booking_id uuid,p_reason text)
returns numeric language plpgsql security definer set search_path=public,pg_temp as $$
declare x record; total numeric:=0; admin_id uuid:=auth.uid();
begin
  if admin_id is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  if length(trim(coalesce(p_reason,'')))<4 then raise exception 'Alasan rekalkulasi minimal 4 karakter.'; end if;
  perform 1 from public.booking_orders where id=p_booking_id for update;
  if not found then raise exception 'Booking tidak ditemukan.'; end if;
  for x in select id from public.booking_items where booking_id=p_booking_id order by created_at,id loop
    total:=total+public.finance_snapshot_booking_item(x.id,true,p_reason);
  end loop;
  return total;
end $$;
revoke all on function public.finance_recalculate_booking_costs(uuid,text) from public,anon;
grant execute on function public.finance_recalculate_booking_costs(uuid,text) to authenticated;

create or replace function public.finance_record_transaction(
  p_booking_id uuid,p_entry_type text,p_amount numeric,p_idempotency_key text,
  p_note text default null,p_external_reference text default null
)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  admin_id uuid:=auth.uid(); order_row public.booking_orders%rowtype;
  entry_id uuid; existing public.finance_transaction_entries%rowtype;
  paid numeric; refunded numeric; amount numeric:=round(p_amount,2);
begin
  if admin_id is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  if p_entry_type not in('payment','refund','processing_fee','discount') then raise exception 'Jenis transaksi tidak valid.'; end if;
  if amount is null or amount<=0 or amount>999999999999.99 then raise exception 'Nominal transaksi tidak valid.'; end if;
  if length(trim(coalesce(p_idempotency_key,'')))<8 or length(p_idempotency_key)>180 then raise exception 'Kunci idempotensi tidak valid.'; end if;
  select * into order_row from public.booking_orders where id=p_booking_id for update;
  if not found then raise exception 'Booking tidak ditemukan.'; end if;
  select * into existing from public.finance_transaction_entries where idempotency_key=p_idempotency_key;
  if found then
    if existing.booking_id<>p_booking_id or existing.entry_type<>p_entry_type or existing.amount<>amount then
      raise exception 'Kunci idempotensi sudah digunakan untuk nominal atau transaksi berbeda.';
    end if;
    return existing.id;
  end if;
  select coalesce(sum(e.amount),0) into paid from public.finance_transaction_entries e where e.booking_id=p_booking_id and e.entry_type='payment' and e.status='posted';
  select coalesce(sum(e.amount),0) into refunded from public.finance_transaction_entries e where e.booking_id=p_booking_id and e.entry_type='refund' and e.status='posted';
  if p_entry_type='payment' and amount>greatest(order_row.total_amount-paid,0) then raise exception 'Pembayaran melebihi sisa tagihan booking.'; end if;
  if p_entry_type='refund' and amount>greatest(paid-refunded,0) then raise exception 'Refund melebihi pembayaran bersih yang tercatat.'; end if;
  if p_entry_type='payment' and order_row.order_status in('cancelled','rejected','expired') then raise exception 'Booking tidak aktif tidak dapat menerima pembayaran baru.'; end if;
  insert into public.finance_transaction_entries(booking_id,entry_type,amount,source_type,source_id,idempotency_key,external_reference,note,actor_user_id)
  values(p_booking_id,p_entry_type,amount,'admin',p_idempotency_key,p_idempotency_key,nullif(trim(p_external_reference),''),nullif(trim(p_note),''),admin_id)
  returning id into entry_id;
  if p_entry_type='payment' then
    if paid+amount>=order_row.total_amount then update public.booking_orders set payment_status='paid' where id=p_booking_id;
    else update public.booking_orders set payment_status='pending' where id=p_booking_id; end if;
  end if;
  insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note)
  values(p_booking_id,admin_id,'admin','finance_'||p_entry_type,coalesce(nullif(trim(p_note),''),'Entri keuangan admin dicatat.'));
  return entry_id;
end $$;
revoke all on function public.finance_record_transaction(uuid,text,numeric,text,text,text) from public,anon;
grant execute on function public.finance_record_transaction(uuid,text,numeric,text,text,text) to authenticated;

create or replace function public.finance_capture_approved_payment_proof()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare order_row public.booking_orders%rowtype; already_paid numeric; due numeric;
begin
  if new.status<>'approved' or old.status='approved' then return new; end if;
  select * into order_row from public.booking_orders where id=new.booking_id for update;
  if not found or order_row.payment_status='paid' or order_row.order_status in('cancelled','rejected','expired') then return new; end if;
  select coalesce(sum(amount),0) into already_paid from public.finance_transaction_entries
   where booking_id=new.booking_id and entry_type='payment' and status='posted';
  due:=greatest(order_row.total_amount-already_paid,0);
  if due<=0 then return new; end if;
  insert into public.finance_transaction_entries(booking_id,entry_type,amount,source_type,source_id,idempotency_key,note,actor_user_id)
  values(new.booking_id,'payment',due,'booking_payment_proof',new.id::text,'proof:'||new.id::text,
    'Bukti transfer disetujui; dicatat sebesar sisa tagihan.',new.reviewed_by)
  on conflict(idempotency_key) do nothing;
  return new;
end $$;
create trigger finance_capture_payment_proof after update of status on public.booking_payment_records
  for each row when (old.status is distinct from new.status)
  execute function public.finance_capture_approved_payment_proof();

insert into public.finance_transaction_entries(booking_id,entry_type,amount,source_type,source_id,idempotency_key,note)
select b.id,'payment',b.total_amount,'migration',b.id::text,'legacy-paid:'||b.id::text,'Saldo paid yang sudah tercatat sebelum Finance V1.'
from public.booking_orders b where b.payment_status='paid' and b.total_amount>0
on conflict(idempotency_key) do nothing;

create or replace view public.finance_booking_profit_v with (security_invoker=true) as
with costs as (
  select booking_id,sum(estimated_cost)::numeric(14,2) estimated_direct_cost from public.finance_booking_cost_snapshots group by booking_id
), expenses as (
  select booking_id,sum(amount)::numeric(14,2) actual_expenses from public.finance_expenses where status='approved' and booking_id is not null group by booking_id
), entries as (
  select booking_id,
    sum(amount) filter(where entry_type='payment' and status='posted')::numeric(14,2) cash_received,
    sum(amount) filter(where entry_type='refund' and status='posted')::numeric(14,2) cash_refunded,
    sum(amount) filter(where entry_type='processing_fee' and status='posted')::numeric(14,2) processing_fees,
    sum(amount) filter(where entry_type='discount' and status='posted')::numeric(14,2) discounts
  from public.finance_transaction_entries group by booking_id
), calculated as (
  select b.id,b.order_number,b.order_status,b.payment_status,b.created_at,b.total_amount::numeric(14,2) payable_amount,
    coalesce(e.discounts,0)::numeric(14,2) discount_amount,
    (b.total_amount+coalesce(e.discounts,0))::numeric(14,2) gross_sales,
    greatest(b.total_amount-coalesce(e.cash_refunded,0),0)::numeric(14,2) net_sales,
    case when b.order_status='completed' and b.payment_status='paid'
      then greatest(b.total_amount-coalesce(e.cash_refunded,0),0) else 0 end::numeric(14,2) recognized_revenue,
    coalesce(e.cash_received,case when b.payment_status='paid' then b.total_amount else 0 end,0)::numeric(14,2) cash_received,
    coalesce(e.cash_refunded,0)::numeric(14,2) refunds,
    coalesce(c.estimated_direct_cost,0)::numeric(14,2) estimated_direct_cost,
    (coalesce(x.actual_expenses,0)+coalesce(e.processing_fees,0))::numeric(14,2) actual_direct_cost,
    coalesce(e.processing_fees,0)::numeric(14,2) processing_fees,
    case when b.order_status in('cancelled','rejected','expired') then 0
      else greatest(b.total_amount-coalesce(e.cash_received,case when b.payment_status='paid' then b.total_amount else 0 end,0),0) end::numeric(14,2) receivable
  from public.booking_orders b left join costs c on c.booking_id=b.id left join expenses x on x.booking_id=b.id left join entries e on e.booking_id=b.id
)
select *, (recognized_revenue-estimated_direct_cost)::numeric(14,2) estimated_profit,
  (recognized_revenue-actual_direct_cost)::numeric(14,2) contribution_profit,
  case when net_sales>0 then round((recognized_revenue-actual_direct_cost)/net_sales*100,2) else 0 end::numeric(7,2) profit_margin
from calculated;

create or replace view public.finance_service_profit_v with (security_invoker=true) as
with item_sales as (
  select bi.id,bi.booking_id,case when coalesce(bi.service_category,'other')='other' then bi.service_type else bi.service_category end service_type,
    (case when bi.service_type='trip' or bi.price_basis='per_person' then bi.unit_price*bi.guests*bi.quantity
      when bi.service_type='stay' then bi.unit_price*greatest(coalesce(bi.date_end-bi.date_start,1),1)*bi.quantity
      else bi.unit_price*bi.quantity end)::numeric(14,2) gross_item_sales
  from public.booking_items bi
), order_sales as (
  select booking_id,sum(gross_item_sales)::numeric(14,2) gross_total from item_sales group by booking_id
), item_costs as (
  select booking_item_id,sum(estimated_cost)::numeric(14,2) estimated_direct_cost from public.finance_booking_cost_snapshots group by booking_item_id
), item_expenses as (
  select booking_item_id,sum(amount)::numeric(14,2) actual_direct_cost from public.finance_expenses where status='approved' and booking_item_id is not null group by booking_item_id
)
select s.service_type,
  sum(case when o.order_status='completed' and o.payment_status='paid'
    then (case when nullif(os.gross_total,0) is null then 0 else greatest(o.total_amount-coalesce(refunds.amount,0),0)*s.gross_item_sales/os.gross_total end) else 0 end)::numeric(14,2) recognized_revenue,
  sum(coalesce(c.estimated_direct_cost,0))::numeric(14,2) estimated_direct_cost,
  sum(coalesce(x.actual_direct_cost,0)+case when nullif(os.gross_total,0) is null then 0 else (coalesce(booking_expenses.amount,0)+coalesce(fees.amount,0))*s.gross_item_sales/os.gross_total end)::numeric(14,2) actual_direct_cost,
  sum(case when o.order_status='completed' and o.payment_status='paid'
    then (case when nullif(os.gross_total,0) is null then 0 else greatest(o.total_amount-coalesce(refunds.amount,0),0)*s.gross_item_sales/os.gross_total end)-coalesce(x.actual_direct_cost,0)-case when nullif(os.gross_total,0) is null then 0 else (coalesce(booking_expenses.amount,0)+coalesce(fees.amount,0))*s.gross_item_sales/os.gross_total end else 0 end)::numeric(14,2) contribution_profit,
  count(distinct s.booking_id)::integer booking_count
from item_sales s join public.booking_orders o on o.id=s.booking_id
left join order_sales os on os.booking_id=s.booking_id
left join item_costs c on c.booking_item_id=s.id
left join item_expenses x on x.booking_item_id=s.id
left join lateral (select sum(amount) amount from public.finance_transaction_entries where booking_id=s.booking_id and entry_type='refund' and status='posted') refunds on true
left join lateral (select sum(amount) amount from public.finance_transaction_entries where booking_id=s.booking_id and entry_type='processing_fee' and status='posted') fees on true
left join lateral (select sum(amount) amount from public.finance_expenses where booking_id=s.booking_id and booking_item_id is null and status='approved') booking_expenses on true
group by s.service_type;

grant select on public.finance_booking_profit_v,public.finance_service_profit_v to authenticated;
revoke all on public.finance_booking_profit_v,public.finance_service_profit_v from anon;
comment on view public.finance_booking_profit_v is 'Booking, cash, receivable, and profit; recognized revenue requires a completed, paid booking.';
commit;
