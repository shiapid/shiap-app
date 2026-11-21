begin;

-- The checkout adapter is installed separately after these guards are tested.
create table shiap_private.unified_orders (
  booking_id uuid primary key references public.booking_orders(id) on delete restrict,
  sealed_at timestamptz,
  payment_opened_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

create table shiap_private.unified_order_items (
  item_id uuid primary key references public.booking_items(id) on delete restrict,
  booking_id uuid not null references shiap_private.unified_orders(booking_id) on delete restrict,
  service text not null check (service in ('stay','trip','experience')),
  product_id uuid not null,
  vendor_kind text not null check (vendor_kind in ('places_property','shiap','catalog_vendor')),
  vendor_id uuid not null,
  unit_price numeric(14,2) not null check (unit_price > 0),
  subtotal_idr bigint not null check (subtotal_idr > 0),
  discount_idr bigint not null default 0 check (discount_idr = 0),
  tax_idr bigint not null default 0 check (tax_idr = 0),
  tax_treatment text not null default 'NO_SEPARATE_TAX',
  service_fee_idr bigint not null check (service_fee_idr >= 0),
  commission_bps integer not null check (
    (service = 'stay' and commission_bps = 1500) or (service <> 'stay' and commission_bps = 0)
  ),
  partner_agreement_id uuid references public.stay_service_agreements(id) on delete restrict,
  partner_agreement_version integer,
  fulfillment text not null default 'PENDING' check (fulfillment in ('PENDING','COMPLETED')),
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete restrict,
  completion_note text,
  unique (booking_id, service),
  check ((fulfillment = 'COMPLETED') = (completed_at is not null and completed_by is not null)),
  check ((service = 'stay') = (partner_agreement_id is not null and partner_agreement_version is not null))
);

alter table shiap_private.unified_orders enable row level security;
alter table shiap_private.unified_order_items enable row level security;
revoke all on shiap_private.unified_orders, shiap_private.unified_order_items
from public, anon, authenticated, service_role;

-- Use the same resources the legacy booking engine uses. Try-locks on resources
-- acquired after the parent avoid deadlocks with legacy flows holding them first.
create function shiap_private.unified_payment_error(
  p_booking uuid, p_allow_timely_proof boolean default false
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  b public.booking_orders%rowtype;
  item record;
  trip record;
  session_row record;
  stay public.stay_partner_fulfillment%rowtype;
  exp public.shiap_experience_booking_records%rowtype;
  ref_time timestamptz := clock_timestamp();
  service_time timestamptz;
  lines integer;
  subtotal bigint;
  fee bigint;
begin
  select * into strict b from public.booking_orders where id=p_booking for update;
  if not exists(select 1 from shiap_private.unified_orders where booking_id=b.id and sealed_at is not null)
    or b.order_status<>'pending_confirmation' or b.payment_status not in ('unpaid','pending') then
    return 'Pesanan gabungan belum dapat menerima pembayaran.';
  end if;
  if b.inventory_hold_expires_at is null or (b.inventory_hold_expires_at<=ref_time and not (
    p_allow_timely_proof and b.payment_status='pending' and exists (
      select 1 from public.booking_payment_records p where p.booking_id=b.id
        and p.status in ('pending','approved') and p.submitted_at<=b.inventory_hold_expires_at
    )
  )) then return 'Hold pesanan gabungan kedaluwarsa. Buat checkout baru atau hubungi Finance jika sudah transfer.'; end if;

  service_time:=ref_time;
  if p_allow_timely_proof and b.payment_status='pending' then
    select coalesce(min(p.submitted_at),ref_time) into service_time
      from public.booking_payment_records p where p.booking_id=b.id
        and p.status in ('pending','approved') and p.submitted_at<=b.inventory_hold_expires_at;
  end if;
  perform 1 from public.booking_items where booking_id=b.id order by id for update;
  select count(*),sum(s.subtotal_idr),sum(s.service_fee_idr) into lines,subtotal,fee
    from shiap_private.unified_order_items s where s.booking_id=b.id;
  if lines not between 2 and 3 or lines<>(select count(*) from public.booking_items where booking_id=b.id)
    or b.service_fee_version<>1 or subtotal is distinct from b.package_subtotal
    or fee is distinct from b.service_fee_total or b.total_amount is distinct from subtotal+fee then
    return 'Snapshot harga pesanan gabungan tidak valid.';
  end if;
  if exists (
    select 1 from shiap_private.unified_order_items s
    left join public.stay_partner_fulfillment f on f.item_id=s.item_id
    left join public.shiap_experience_booking_records e on e.booking_item_id=s.item_id
    where s.booking_id=b.id and (
      (s.service='stay' and (f.status is distinct from 'AWAITING_PAYMENT' or f.operational_hold)) or
      (s.service='experience' and (e.request_status is null or e.request_status not in ('approved','not_required')))
    )
  ) then return 'Persetujuan semua layanan diperlukan sebelum pembayaran.'; end if;

  for item in
    select i.*,s.service,s.product_id as snapshot_product,s.unit_price as snapshot_price
    from shiap_private.unified_order_items s join public.booking_items i on i.id=s.item_id
    where s.booking_id=b.id order by s.service,i.id
  loop
    if item.booking_id<>b.id or item.unit_price is distinct from item.snapshot_price then
      return 'Snapshot layanan pesanan tidak cocok.';
    end if;
    if item.service='stay' then
      if not pg_try_advisory_xact_lock(hashtextextended('shiap-calendar:stay',0)) then
        raise exception 'Inventori Stay sedang diperbarui. Coba lagi.' using errcode='40001';
      end if;
      select * into strict stay from public.stay_partner_fulfillment where item_id=item.id;
      perform 1 from public.stay_room_types r where r.id=item.room_type_id and r.property_id=stay.property_id
        and r.status='active' and item.guests<=r.capacity*item.quantity for share nowait;
      if not found or stay.check_in_at<=service_time or not shiap_private.stay_partner_booking_ready(stay.property_id)
        or not exists (select 1 from public.stay_partner_booking_config c
          join public.stay_service_agreements a on a.id=c.agreement_id
          where c.property_id=stay.property_id and c.status='ACTIVE'
            and c.agreement_id=stay.agreement_id and a.version=stay.agreement_version)
        or exists(select 1 from shiap_private.stay_inventory(item.room_type_id,item.date_start,item.date_end) a
          where a.calendar_closed or a.booked<item.quantity or a.booked+a.blocked>a.total)
        or exists(select 1 from public.stay_room_inventory_blocks blk where blk.room_type_id=item.room_type_id
          and blk.blocked_units is null and blk.starts_on<item.date_end and blk.ends_on>=item.date_start) then
        return 'Reservasi Stay tidak lagi tersedia.';
      end if;
    elsif item.service='trip' then
      select d.*, p.status as product_status into trip from public.trip_departures d
        join public.trip_packages p on p.id=d.trip_id where d.id=item.departure_id for share of d,p nowait;
      if not found or trip.trip_id is distinct from item.snapshot_product or trip.product_status<>'published'
        or trip.status not in ('open','full') or trip.departure_date is distinct from item.date_start
        or (trip.departure_date+coalesce(trip.departure_time,time '00:00')) at time zone 'Asia/Makassar'<=service_time
        or (select coalesce(sum(i.guests*i.quantity),0) from public.booking_items i
          join public.booking_orders bo on bo.id=i.booking_id where i.departure_id=item.departure_id and
          (bo.order_status in ('confirmed','completed') or (bo.order_status='pending_confirmation' and
            (bo.inventory_hold_expires_at is null or bo.inventory_hold_expires_at>ref_time or bo.payment_status<>'unpaid'))))
          >trip.max_participants then
        return 'Reservasi Trip tidak lagi tersedia.';
      end if;
    else
      select * into strict exp from public.shiap_experience_booking_records where booking_item_id=item.id;
      if not exists (select 1 from public.shiap_experience_packages k join public.shiap_experience_products p on p.id=k.product_id
        join public.shiap_experience_categories c on c.id=p.category_id
        where k.id=exp.package_id and k.status='published' and not k.is_demo
          and p.id=exp.product_id and p.status='published' and not p.is_demo and c.is_active
          and exp.participant_count between k.min_guests and k.max_guests) then
        return 'Paket Experience tidak lagi tersedia.';
      end if;
      if exp.session_id is not null then
        select * into session_row from public.shiap_experience_sessions s where s.id=exp.session_id
          and s.package_id=exp.package_id for share nowait;
        if not found or session_row.status<>'open' or session_row.starts_at<=service_time
          or session_row.weather_status='blocked'
          or (session_row.weather_status='pending' and session_row.starts_at<service_time+interval '24 hours')
          or (select coalesce(sum(e.participant_count),0) from public.shiap_experience_booking_records e
            join public.booking_orders bo on bo.id=e.booking_id where e.session_id=exp.session_id and
            (bo.order_status in ('confirmed','completed') or (bo.order_status='pending_confirmation' and
              (bo.inventory_hold_expires_at is null or bo.inventory_hold_expires_at>ref_time or bo.payment_status<>'unpaid'))))
              >session_row.capacity then
          return 'Reservasi sesi Experience tidak lagi tersedia.';
        end if;
      elsif item.date_start<(service_time at time zone 'Asia/Makassar')::date then
        return 'Tanggal Experience sudah berlalu.';
      end if;
    end if;
  end loop;
  return null;
end $$;

create function shiap_private.unified_refresh_payment(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare reason text; changed integer;
begin
  reason:=shiap_private.unified_payment_error(p_booking,false);
  update public.booking_orders set payment_enabled=reason is null
  where id=p_booking and payment_status='unpaid' and payment_enabled is distinct from (reason is null);
  get diagnostics changed=row_count;
  if changed=1 and reason is null then
    update shiap_private.unified_orders set payment_opened_at=clock_timestamp()
      where booking_id=p_booking and payment_opened_at is null;
    insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note)
    values(p_booking,auth.uid(),'system','unified_payment_opened','Semua layanan telah memenuhi syarat pembayaran.');
  end if;
end $$;

create function shiap_private.unified_all_fulfilled(p_booking uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) between 2 and 3
    and count(*)=(select count(*) from public.booking_items where booking_id=p_booking)
    and bool_and(case when s.service='stay' then coalesce(f.status='COMPLETED' and not f.operational_hold,false)
                     else s.fulfillment='COMPLETED' end)
  from shiap_private.unified_order_items s left join public.stay_partner_fulfillment f on f.item_id=s.item_id
  where s.booking_id=p_booking
$$;

create function shiap_private.unified_complete_parent(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if shiap_private.unified_all_fulfilled(p_booking) then
    update public.booking_orders set order_status='completed'
    where id=p_booking and order_status='confirmed' and payment_status='paid';
  end if;
end $$;

create function shiap_private.guard_unified_parent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare reason text;
begin
  if not exists(select 1 from shiap_private.unified_orders where booking_id=old.id) then return new; end if;
  if new.order_status in ('cancelled','expired','rejected') then
    if old.payment_status='paid' and old.order_status is distinct from new.order_status
      and not (new.payment_status='unpaid' and exists (
        select 1 from public.finance_transaction_entries f where f.booking_id=old.id and f.entry_type='payment'
          and f.status='reversed' and f.bank_transfer_id is not null
      )) then
      raise exception 'Pesanan gabungan yang sudah dibayar harus ditinjau Finance.' using errcode='23514';
    end if;
    new.payment_enabled:=false;
  end if;
  if new.inventory_hold_expires_at is distinct from old.inventory_hold_expires_at
     and new.order_status not in ('cancelled','expired','rejected')
     and exists(select 1 from shiap_private.unified_orders where booking_id=old.id and sealed_at is not null) then
    raise exception 'Batas reservasi gabungan tidak dapat diperpanjang tanpa reservasi ulang.' using errcode='23514';
  end if;
  if (new.payment_enabled and not old.payment_enabled) or
    (new.payment_status is distinct from old.payment_status and new.payment_status in ('pending','paid')) then
    if new.payment_status in ('pending','paid') and not old.payment_enabled then
      raise exception 'Pembayaran pesanan gabungan belum dibuka.' using errcode='23514';
    end if;
    reason:=shiap_private.unified_payment_error(old.id,new.payment_status='paid');
    if reason is not null then raise exception '%',reason using errcode='23514'; end if;
  end if;
  if new.order_status='completed' and old.order_status is distinct from new.order_status then
    if new.payment_status<>'paid' or not shiap_private.unified_all_fulfilled(old.id) then
      raise exception 'Seluruh layanan harus selesai sebelum pesanan gabungan diselesaikan.' using errcode='23514';
    end if;
  end if;
  return new;
end $$;

create trigger aa_unified_order_gate before update on public.booking_orders
for each row execute function shiap_private.guard_unified_parent();

create function shiap_private.guard_unified_proof() returns trigger
language plpgsql security definer set search_path = '' as $$
declare reason text;
begin
  if exists(select 1 from shiap_private.unified_orders where booking_id=new.booking_id) then
    reason:=shiap_private.unified_payment_error(new.booking_id,false);
    if reason is not null then raise exception '%',reason using errcode='23514'; end if;
  end if;
  return new;
end $$;
create trigger aa_unified_proof_gate before insert on public.booking_payment_records
for each row execute function shiap_private.guard_unified_proof();

create function shiap_private.guard_unified_cash_receipt() returns trigger
language plpgsql security definer set search_path = '' as $$
declare reason text;
begin
  if exists(select 1 from shiap_private.unified_orders where booking_id=new.booking_id) then
    if new.entry_type='refund' then
      raise exception 'Refund pesanan gabungan memerlukan tinjauan Finance per layanan.' using errcode='23514';
    end if;
    if new.entry_type='payment' then
      reason:=shiap_private.unified_payment_error(new.booking_id,new.source_type='booking_payment_proof');
      if reason is not null then raise exception '%',reason using errcode='23514'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger aa_unified_receipt_gate before insert on public.finance_transaction_entries
for each row execute function shiap_private.guard_unified_cash_receipt();

create function shiap_private.release_unified_trip() returns trigger
language plpgsql security definer set search_path = '' as $$
declare departure uuid;
begin
  if exists(select 1 from shiap_private.unified_orders where booking_id=new.id) then
    for departure in select distinct departure_id from public.booking_items where booking_id=new.id
      and departure_id is not null order by departure_id
    loop
      perform public.recalculate_trip_departure_inventory(departure);
    end loop;
  end if;
  return new;
end $$;
create trigger unified_terminal_trip_inventory after update of order_status on public.booking_orders
for each row when (old.order_status is distinct from new.order_status and new.order_status in ('cancelled','expired','rejected'))
execute function shiap_private.release_unified_trip();

revoke all on function shiap_private.unified_payment_error(uuid,boolean), shiap_private.unified_refresh_payment(uuid),
  shiap_private.unified_all_fulfilled(uuid), shiap_private.unified_complete_parent(uuid),
  shiap_private.guard_unified_parent(), shiap_private.guard_unified_proof(),
  shiap_private.guard_unified_cash_receipt(), shiap_private.release_unified_trip()
from public, anon, authenticated, service_role;

commit;
