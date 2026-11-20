begin;

-- Keep the eligibility predicate shared by checkout, inventory, and the Admin calendar.
create function shiap_private.stay_inventory_reservations(p_room uuid, p_start date, p_end date)
returns table (item_id uuid, booking_id uuid, room_id uuid, starts_on date, ends_before date, units integer, held boolean)
language sql stable set search_path = ''
as $$
  select i.id, b.id, i.room_type_id, i.date_start, i.date_end, i.quantity, b.order_status = 'pending_confirmation'
  from public.booking_items i join public.booking_orders b on b.id = i.booking_id
  where i.room_type_id is not null
    and (p_room is null or i.room_type_id = p_room)
    and (p_start is null or i.date_end > p_start)
    and (p_end is null or i.date_start < p_end)
    and (b.order_status = 'confirmed' or (b.order_status = 'pending_confirmation' and (
      b.inventory_hold_expires_at is null or b.inventory_hold_expires_at > statement_timestamp()
      or b.payment_status <> 'unpaid'
      or exists (select 1 from public.booking_payment_records pmt where pmt.booking_id = b.id and pmt.status = 'pending')
    )));
$$;

create or replace function shiap_private.stay_held_booking_items(p_room uuid)
returns table (starts_on date, ends_before date, units integer)
language sql stable set search_path = ''
as $$
  select r.starts_on, r.ends_before, r.units
  from shiap_private.stay_inventory_reservations(p_room, null, null) r
  where p_room is not null;
$$;

create function public.admin_stay_calendar_inventory(p_room uuid, p_start date, p_end date)
returns table (night date, total integer, booked bigint, held bigint, blocked bigint, available bigint, calendar_closed boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(public.is_shiap_admin(), false) then
    raise exception 'Akses admin diperlukan.' using errcode = '42501';
  end if;
  if p_room is null or p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
    or p_end <= p_start or p_end - p_start > 62 then return; end if;
  return query
    with holds as materialized (
      select r.starts_on, r.ends_before, r.units
      from shiap_private.stay_inventory_reservations(p_room, p_start, p_end) r where r.held
    )
    select i.night, i.total, i.booked - h.units, h.units, i.blocked, i.available, i.calendar_closed
    from shiap_private.stay_inventory(p_room,p_start,p_end) i
    cross join lateral (
      select coalesce(sum(holds.units),0) as units from holds
      where holds.starts_on <= i.night and holds.ends_before > i.night
    ) h;
end;
$$;

create function public.admin_stay_calendar_reservations(p_start date, p_end date)
returns table (item_id uuid, order_number text, property_id uuid, room_id uuid, room_name text, property_name text, starts_on date, ends_before date, units integer, held boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(public.is_shiap_admin(), false) then
    raise exception 'Akses admin diperlukan.' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
    or p_end <= p_start or p_end - p_start > 62 then return; end if;
  return query
    select r.item_id, b.order_number, p.id, room.id, room.name, p.name, r.starts_on, r.ends_before, r.units, r.held
    from shiap_private.stay_inventory_reservations(null,p_start,p_end) r
    join public.booking_orders b on b.id = r.booking_id
    join public.stay_room_types room on room.id = r.room_id
    join public.stay_properties p on p.id = room.property_id
    where b.payment_status <> 'paid'
    order by r.item_id;
end;
$$;

revoke all on function shiap_private.stay_inventory_reservations(uuid,date,date),
  public.admin_stay_calendar_inventory(uuid,date,date), public.admin_stay_calendar_reservations(date,date)
  from public, anon, authenticated;
grant execute on function public.admin_stay_calendar_inventory(uuid,date,date),
  public.admin_stay_calendar_reservations(date,date) to authenticated;

commit;
