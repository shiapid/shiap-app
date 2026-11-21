-- Run on local Supabase after the Admin Operations and departure removal migrations.
begin;

do $$
declare
  admin_id uuid := gen_random_uuid();
  trip_id uuid := gen_random_uuid();
  empty_id uuid := gen_random_uuid();
  held_id uuid := gen_random_uuid();
  linked_id uuid := gen_random_uuid();
  booking_id uuid := gen_random_uuid();
  initial_version integer;
begin
  insert into auth.users(id, email) values (admin_id, admin_id::text || '@local.test');
  insert into public.admin_users(user_id) values (admin_id);
  insert into public.trip_packages(id, title, slug, location, status, pricing_model, base_price)
    values (trip_id, 'Schedule smoke', trip_id::text, 'Local test', 'published', 'open_per_person', 75000);
  insert into public.trip_departures(id, trip_id, departure_date, status, price_per_person, booked_seats)
    values (empty_id, trip_id, current_date + 30, 'open', 75000, 0),
           (held_id, trip_id, current_date + 31, 'open', 75000, 1),
           (linked_id, trip_id, current_date + 32, 'open', 75000, 0);

  if has_function_privilege('anon', 'public.admin_remove_trip_departure(uuid,uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.admin_remove_trip_departure(uuid,uuid,integer)', 'execute')
     or not has_function_privilege('service_role', 'public.admin_remove_trip_departure(uuid,uuid,integer)', 'execute') then
    raise exception 'Unexpected removal RPC grants';
  end if;
  begin
    perform public.admin_remove_trip_departure(gen_random_uuid(), empty_id, 1);
    raise exception 'Non-admin removal accepted';
  exception when insufficient_privilege then null;
  end;

  select version into initial_version from public.trip_departures where id = empty_id;
  if public.admin_remove_trip_departure(admin_id, empty_id, initial_version + 1) is distinct from 'conflict' then
    raise exception 'Stale removal accepted';
  end if;
  if public.admin_remove_trip_departure(admin_id, held_id, 1) is distinct from 'has_bookings' then
    raise exception 'Held departure removal accepted';
  end if;

  insert into public.booking_orders(id, order_number, user_id, customer_name, customer_whatsapp)
    values (booking_id, booking_id::text, admin_id, 'Synthetic', '+620000000000');
  insert into public.booking_items(booking_id, service_type, service_name, date_start, departure_id, trip_id)
    values (booking_id, 'trip', 'Schedule smoke', current_date + 32, linked_id, trip_id);
  if public.admin_remove_trip_departure(admin_id, linked_id,
    (select version from public.trip_departures where id = linked_id)) is distinct from 'has_bookings' then
    raise exception 'Referenced departure removal accepted';
  end if;

  set local role service_role;
  if public.admin_remove_trip_departure(admin_id, empty_id, initial_version) is distinct from 'removed'
     or public.admin_remove_trip_departure(admin_id, empty_id, initial_version) is distinct from 'removed' then
    raise exception 'Removal or retry failed';
  end if;
  if not exists (select 1 from public.trip_departures where id = empty_id and status = 'cancelled'
                 and removed_at is not null and version = initial_version + 1 and price_per_person = 75000)
     or (select count(*) from public.admin_trip_departure_audit
         where departure_id = empty_id and actor_user_id = admin_id) <> 1 then
    raise exception 'Expected preserved departure and one Admin audit entry';
  end if;
  begin
    update public.trip_departures set status = 'open' where id = empty_id;
    raise exception 'Removed departure can be reopened';
  exception when check_violation then null;
  end;

  reset role;
  perform set_config('test.removed_departure', empty_id::text, true);
end $$;

set local role anon;
do $$
begin
  if exists (select 1 from public.trip_departures where id = current_setting('test.removed_departure')::uuid) then
    raise exception 'Removed departure is visible to the public';
  end if;
end $$;
reset role;

rollback;
