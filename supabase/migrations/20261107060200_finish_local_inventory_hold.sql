-- Booking RPC marks the departure full after inserting the final hold. Allow the
-- V1.4 price trigger to finish pricing that already-locked booking item.
create or replace function public.apply_booking_item_price()
returns trigger language plpgsql security invoker set search_path=public
as $$
declare night date; rate numeric; total numeric:=0;
begin
 if new.service_type='trip' and new.trip_id is not null then
  if new.departure_id is not null then
   select d.price_per_person into rate from public.trip_departures d where d.id=new.departure_id and d.trip_id=new.trip_id and d.status in('open','full') for share;
   if rate is not null and rate>0 then new.unit_price:=rate; new.price_status:='quoted'; end if;
  elsif coalesce(new.variant,'') ilike '%private%' then
   select q.effective_price_per_person into rate from public.calculate_private_trip_quote(new.trip_id,new.guests) q;
   if rate is not null and rate>0 then new.unit_price:=rate; new.price_status:='quoted'; end if;
  end if;
 elsif new.service_type='stay' and new.room_type_id is not null and new.date_end>new.date_start then
  for night in select d::date from generate_series(new.date_start::timestamp,(new.date_end-1)::timestamp,interval '1 day') d loop
   select case when extract(isodow from night) in(6,7) then r.weekend_price else r.weekday_price end into rate
   from public.stay_room_types r where r.id=new.room_type_id and r.status='active' for share;
   if rate is null or rate<=0 then total:=0; exit; end if;
   total:=total+rate;
  end loop;
  if total>0 then new.unit_price:=ceil(total/(new.date_end-new.date_start)); new.price_status:='quoted'; end if;
 end if;
 return new;
end $$;
