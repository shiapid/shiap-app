begin;
set local lock_timeout = '5s';

create table public.stay_room_inventory_blocks (
  id uuid primary key default gen_random_uuid(),
  room_type_id uuid not null references public.stay_room_types(id) on delete restrict,
  starts_on date not null,
  ends_on date not null,
  blocked_units integer check (blocked_units > 0),
  reason text not null check (length(btrim(reason)) between 3 and 240),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (isfinite(starts_on) and isfinite(ends_on) and ends_on - starts_on between 0 and 364)
);
comment on column public.stay_room_inventory_blocks.blocked_units is 'NULL closes the room type for the entire inclusive date range.';
create index stay_room_inventory_blocks_dates on public.stay_room_inventory_blocks(room_type_id, starts_on, ends_on);
create index if not exists booking_items_stay_nights on public.booking_items(room_type_id, date_start, date_end)
  where room_type_id is not null;
alter table public.stay_room_inventory_blocks enable row level security;
revoke all on public.stay_room_inventory_blocks from public, anon, authenticated;
grant select, delete on public.stay_room_inventory_blocks to authenticated;
grant insert (room_type_id, starts_on, ends_on, blocked_units, reason) on public.stay_room_inventory_blocks to authenticated;
create policy stay_inventory_admin_read on public.stay_room_inventory_blocks
  for select to authenticated using ((select public.is_shiap_admin()));
create policy stay_inventory_admin_insert on public.stay_room_inventory_blocks
  for insert to authenticated with check ((select public.is_shiap_admin()) and created_by = (select auth.uid()));
create policy stay_inventory_admin_delete on public.stay_room_inventory_blocks
  for delete to authenticated using ((select public.is_shiap_admin()));

create function shiap_private.stay_held_booking_items(p_room uuid)
returns table (starts_on date, ends_before date, units integer)
language sql stable set search_path = ''
as $$
  select i.date_start, i.date_end, i.quantity
  from public.booking_items i join public.booking_orders b on b.id = i.booking_id
  where i.room_type_id = p_room
    and (b.order_status = 'confirmed' or (b.order_status = 'pending_confirmation' and (
      b.inventory_hold_expires_at is null or b.inventory_hold_expires_at > statement_timestamp()
      or b.payment_status <> 'unpaid'
      or exists (select 1 from public.booking_payment_records pmt where pmt.booking_id = b.id and pmt.status = 'pending')
    )));
$$;

create function shiap_private.stay_inventory(p_room uuid, p_start date, p_end date)
returns table (night date, total integer, booked bigint, blocked bigint, available bigint, calendar_closed boolean)
language sql stable set search_path = ''
as $$
  with nights as (
    select p_start + n as night
    from generate_series(0, case when isfinite(p_start) and isfinite(p_end)
      and p_end - p_start between 1 and 365 then p_end - p_start - 1 end) n
  ), reservations as materialized (
    select * from shiap_private.stay_held_booking_items(p_room)
    where starts_on < p_end and ends_before > p_start
  ), blocks as materialized (
    select b.* from public.stay_room_inventory_blocks b
    where b.room_type_id = p_room and b.starts_on < p_end and b.ends_on >= p_start
  ), daily as (
    select n.night, r.total_units as total,
      (select coalesce(sum(i.units), 0) from reservations i where i.starts_on <= n.night and i.ends_before > n.night) as booked,
      (select coalesce(sum(b.blocked_units), 0) from blocks b where n.night between b.starts_on and b.ends_on) as reserved_blocks,
      exists (select 1 from blocks b where b.blocked_units is null and n.night between b.starts_on and b.ends_on) as room_closed,
      exists (select 1 from public.calendar_date_blocks d where d.service_type = 'stay'
        and (d.service_id is null or d.service_id = r.property_id)
        and n.night between d.start_date and d.end_date) as calendar_closed
    from nights n cross join public.stay_room_types r where r.id = p_room
  )
  select d.night, d.total, d.booked,
    case when d.room_closed or d.calendar_closed then greatest(d.total - d.booked, 0) else d.reserved_blocks end,
    case when d.room_closed or d.calendar_closed then 0 else greatest(d.total - d.booked - d.reserved_blocks, 0) end,
    d.calendar_closed
  from daily d order by d.night;
$$;

create function public.quote_stay_availability(p_room uuid, p_start date, p_end date)
returns table (night date, available bigint)
language sql stable security definer set search_path = ''
as $$
  select i.night, i.available
  from public.stay_room_types r join public.stay_properties p on p.id = r.property_id
  cross join lateral shiap_private.stay_inventory(r.id, p_start, p_end) i
  where r.id = p_room and r.status = 'active' and p.status = 'published'
    and p_start >= current_date;
$$;

create function public.admin_stay_inventory(p_room uuid, p_start date, p_end date)
returns table (night date, total integer, booked bigint, blocked bigint, available bigint, calendar_closed boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(public.is_shiap_admin(), false) then
    raise exception 'Akses admin diperlukan.' using errcode = '42501';
  end if;
  return query select * from shiap_private.stay_inventory(p_room, p_start, p_end);
end;
$$;

create function shiap_private.guard_stay_room_inventory_block()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform 1 from public.stay_room_types where id = old.room_type_id for update;
    return old;
  end if;
  perform 1 from public.stay_room_types where id = new.room_type_id for update;
  if not found then raise exception 'Tipe kamar tidak ditemukan.'; end if;
  if not isfinite(new.starts_on) or not isfinite(new.ends_on)
    or new.ends_on - new.starts_on not between 0 and 364 then
    raise exception 'Rentang blokir harus antara 1 dan 365 malam.';
  end if;
  if exists (select 1 from shiap_private.stay_inventory(new.room_type_id, new.starts_on, new.ends_on + 1) i
    where (new.blocked_units is null and (i.booked > 0 or i.blocked > 0 or i.calendar_closed))
       or new.blocked_units > i.available) then
    raise exception 'Blokir melebihi stok atau bertumpang tindih dengan reservasi atau penutupan.';
  end if;
  return new;
end;
$$;

create function shiap_private.guard_stay_total_units()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.total_units >= old.total_units then return new; end if;
  -- Only starts can increase occupied units. Include today for in-progress stays and blocks.
  if exists (
    with reservations as materialized (
      select * from shiap_private.stay_held_booking_items(old.id) where ends_before > current_date
    ), blocks as materialized (
      select b.* from public.stay_room_inventory_blocks b
      where b.room_type_id = old.id and b.blocked_units is not null and b.ends_on >= current_date
    ), boundaries as (
      select current_date as night
      union select starts_on from reservations where starts_on > current_date
      union select starts_on from blocks where starts_on > current_date
    )
    select 1 from boundaries d
    where coalesce((select sum(i.units) from reservations i where i.starts_on <= d.night and i.ends_before > d.night), 0)
      + coalesce((select sum(b.blocked_units) from blocks b where d.night between b.starts_on and b.ends_on), 0)
      > new.total_units
  ) then raise exception 'Jumlah unit tidak boleh lebih kecil dari reservasi aktif dan blokir pada malam yang sama.'; end if;
  return new;
end;
$$;

revoke all on function shiap_private.stay_held_booking_items(uuid), shiap_private.stay_inventory(uuid,date,date),
  shiap_private.guard_stay_room_inventory_block(), shiap_private.guard_stay_total_units()
  from public, anon, authenticated;
revoke all on function public.quote_stay_availability(uuid,date,date), public.admin_stay_inventory(uuid,date,date)
  from public, anon, authenticated;
grant execute on function public.quote_stay_availability(uuid,date,date) to anon, authenticated;
grant execute on function public.admin_stay_inventory(uuid,date,date) to authenticated;
create trigger stay_room_inventory_blocks_guard before insert or delete on public.stay_room_inventory_blocks
  for each row execute function shiap_private.guard_stay_room_inventory_block();
create trigger stay_room_inventory_total_guard before update of total_units on public.stay_room_types
  for each row execute function shiap_private.guard_stay_total_units();

-- Keep the existing checkout function, replacing only the Stay availability clause.
do $migration$
declare
  original text := replace(pg_get_functiondef('public.create_booking_order(text,text,text,text,jsonb)'::regprocedure), chr(13), '');
  old_clause text := $old$      perform pg_advisory_xact_lock(hashtextextended(rid::text,0));
      select r.total_units into units from public.stay_room_types r join public.stay_properties p on p.id=r.property_id
       where r.id=rid and r.property_id=pid and r.status='active' and p.status='published';
      if not found then raise exception 'Tipe kamar tidak tersedia.'; end if;
      if pax>qty*(select capacity from public.stay_room_types where stay_room_types.id=rid) then raise exception 'Jumlah tamu melebihi kapasitas kamar.'; end if;
      select coalesce(sum(i.quantity),0)::integer into used_units
        from public.booking_items i join public.booking_orders b on b.id=i.booking_id
       where i.room_type_id=rid and i.date_start<end_on and i.date_end>start_on
         and (b.order_status='confirmed' or (b.order_status='pending_confirmation' and (
           b.inventory_hold_expires_at is null or b.inventory_hold_expires_at>clock_timestamp()
           or b.payment_status<>'unpaid'
           or exists(select 1 from public.booking_payment_records pmt where pmt.booking_id=b.id and pmt.status='pending')
         )));
      if used_units+qty>units then raise exception 'Ketersediaan kamar tidak mencukupi.'; end if;$old$;
  new_clause text := $new$      if not isfinite(end_on) or not isfinite(start_on) or end_on - start_on > 365 then
        raise exception 'Durasi Stay tidak valid.'; end if;
      -- Match the existing Stay-wide calendar lock before locking this room row.
      perform pg_advisory_xact_lock(hashtextextended('shiap-calendar:stay',0));
      select r.total_units into units from public.stay_room_types r join public.stay_properties p on p.id=r.property_id
       where r.id=rid and r.property_id=pid and r.status='active' and p.status='published' for update of r;
      if not found then raise exception 'Tipe kamar tidak tersedia.'; end if;
      if pax>qty*(select capacity from public.stay_room_types where stay_room_types.id=rid) then raise exception 'Jumlah tamu melebihi kapasitas kamar.'; end if;
      if exists (select 1 from shiap_private.stay_inventory(rid,start_on,end_on) i where i.available < qty)
        then raise exception 'Ketersediaan kamar tidak mencukupi.'; end if;$new$;
  revised text;
begin
  old_clause := replace(old_clause, chr(13), '');
  revised := replace(original, old_clause, replace(new_clause, chr(13), ''));
  if length(original) - length(replace(original, old_clause, '')) <> length(old_clause) then
    raise exception 'Stay inventory migration: checkout function differs from reviewed baseline.';
  end if;
  execute revised;
end;
$migration$;

commit;
