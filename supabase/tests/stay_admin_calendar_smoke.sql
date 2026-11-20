begin;

do $$
declare
  property uuid := gen_random_uuid();
  room uuid := gen_random_uuid();
  admin_user uuid := gen_random_uuid();
  customer uuid := gen_random_uuid();
  night date := current_date + 90;
  items jsonb;
  confirmed_id uuid;
  held_id uuid;
  summary record;
  agenda record;
begin
  insert into auth.users(id,aud,role,email) values
    (customer,'authenticated','authenticated',customer||'@local.test'),
    (admin_user,'authenticated','authenticated',admin_user||'@local.test');
  insert into public.admin_users(user_id) values(admin_user);
  insert into public.stay_properties(id,name,slug,location,status)
    values(property,'Synthetic stay calendar',property::text,'Local test','published');
  insert into public.stay_room_types(id,property_id,name,capacity,total_units,weekday_price,weekend_price,status)
    values(room,property,'Synthetic suite',2,4,300000,375000,'active');
  items := jsonb_build_array(jsonb_build_object('service_type','stay','service_name','Calendar test','property_id',property,
    'room_type_id',room,'quantity',1,'guests',1,'date_start',night,'date_end',night+1));
  perform set_config('request.jwt.claim.sub',customer::text,true);
  set local role authenticated;
  select id into confirmed_id from public.create_booking_order('Synthetic QA','6280000000000',null,null,items);
  select id into held_id from public.create_booking_order('Synthetic QA','6280000000000',null,null,items);
  begin
    perform public.admin_stay_calendar_inventory(room,night,night+1);
    raise exception 'Customer read admin occupancy';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_stay_calendar_reservations(night,night+1);
    raise exception 'Customer read global stay reservations';
  exception when insufficient_privilege then null; end;
  reset role;

  update public.booking_orders set order_status='confirmed' where id=confirmed_id;
  perform set_config('request.jwt.claim.sub',admin_user::text,true);
  set local role authenticated;
  insert into public.stay_room_inventory_blocks(room_type_id,starts_on,ends_on,blocked_units,reason)
    values(room,night,night,1,'Synthetic calendar block');
  select * into summary from public.admin_stay_calendar_inventory(room,night,night+1);
  if (summary.total,summary.booked,summary.held,summary.blocked,summary.available)
    is distinct from (4,1::bigint,1::bigint,1::bigint,1::bigint) then
    raise exception 'Stay calendar did not separate confirmed, held and blocked: %',summary;
  end if;
  select count(*) as n, count(*) filter (where held) as held into agenda
    from public.admin_stay_calendar_reservations(night,night+1) where room_id=room;
  if agenda.n <> 2 or agenda.held <> 1 then
    raise exception 'Global calendar uses different availability semantics: %',agenda;
  end if;
  if exists(select 1 from public.admin_stay_calendar_reservations(night+1,night+2) where room_id=room) then
    raise exception 'Calendar wrongly counts checkout date';
  end if;
  reset role;
  update public.booking_orders set inventory_hold_expires_at=now()-interval '1 minute' where id=held_id;
  set local role authenticated;
  select * into summary from public.admin_stay_calendar_inventory(room,night,night+1);
  if summary.held <> 0 or summary.available <> 2 or
    exists(select 1 from public.admin_stay_calendar_reservations(night,night+1) where room_id=room and held) then
    raise exception 'Expired hold should disappear from both calendars';
  end if;
  reset role;
end;
$$;

rollback;
