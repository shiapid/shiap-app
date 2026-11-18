-- SHIAP V1.4 Automatic Pricing Engine (additive)
-- Keeps create_booking_order and its inventory-hold behavior unchanged.
-- Install only after V1 booking tables and the V1.1 trip quote function exist.

create or replace function public.apply_booking_item_price()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_night date;
  v_rate numeric;
  v_total numeric := 0;
begin
  -- Only auto-price catalog-backed products. Custom services remain admin quoted.
  if new.service_type = 'trip' and new.trip_id is not null then
    if new.departure_id is not null then
      select d.price_per_person into v_rate
      from public.trip_departures d
      where d.id = new.departure_id and d.trip_id = new.trip_id
        and d.status = 'open'
      for share;

      if v_rate is not null and v_rate > 0 then
        new.unit_price := v_rate;
        new.price_status := 'quoted';
      end if;
    elsif coalesce(new.variant, '') ilike '%private%' then
      begin
        select q.effective_price_per_person into v_rate
        from public.calculate_private_trip_quote(new.trip_id, new.guests) q;
      exception when others then
        -- An unavailable quote must not block booking creation.
        v_rate := null;
      end;
      if v_rate is not null and v_rate > 0 then
        new.unit_price := v_rate;
        new.price_status := 'quoted';
      end if;
    end if;
  elsif new.service_type = 'stay' and new.room_type_id is not null then
    if new.date_end is not null and new.date_end > new.date_start then
      for v_night in
        select day::date
        from generate_series(new.date_start::timestamp, (new.date_end - 1)::timestamp, interval '1 day') as days(day)
      loop
        select case when extract(isodow from v_night) in (6, 7)
                    then r.weekend_price else r.weekday_price end
        into v_rate
        from public.stay_room_types r
        where r.id = new.room_type_id and r.status = 'active'
        for share;

        if v_rate is null or v_rate <= 0 then
          v_total := 0;
          exit;
        end if;
        v_total := v_total + v_rate;
      end loop;
    end if;

    -- unit_price is the per-room, per-night average; total is retained in the
    -- booking item unit convention used by the existing schema.
    if v_total > 0 and new.date_end > new.date_start then
      new.unit_price := ceil(v_total / (new.date_end - new.date_start));
      new.price_status := 'quoted';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists booking_items_apply_automatic_price on public.booking_items;
create trigger booking_items_apply_automatic_price
before insert on public.booking_items
for each row execute function public.apply_booking_item_price();

comment on function public.apply_booking_item_price() is
  'Computes catalog-backed trip and stay item unit prices before insertion; does not change booking order RPC or inventory holds.';
