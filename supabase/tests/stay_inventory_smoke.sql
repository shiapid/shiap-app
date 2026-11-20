begin;

do $$
declare
  property uuid := gen_random_uuid();
  room uuid := gen_random_uuid();
  customer uuid := gen_random_uuid();
  admin_user uuid := gen_random_uuid();
  first_booking uuid;
  last_booking uuid;
  block_id uuid;
  start_day date := current_date + 120;
  item jsonb;
  stock record;
begin
  insert into auth.users(id,aud,role,email)
    values (customer,'authenticated','authenticated',customer||'@local.test'),
           (admin_user,'authenticated','authenticated',admin_user||'@local.test');
  insert into public.admin_users(user_id) values (admin_user);
  insert into public.stay_properties(id,name,slug,location,status)
    values (property,'Synthetic inventory test',property::text,'Local test','draft');
  insert into public.stay_room_types(id,property_id,name,capacity,total_units,weekday_price,weekend_price,status)
    values (room,property,'Test room',2,2,300000,375000,'active');

  set local role anon;
  if exists (select 1 from public.quote_stay_availability(room,start_day,start_day+1)) then
    raise exception 'Availability exposed an unpublished property';
  end if;
  begin
    perform public.admin_stay_inventory(room,start_day,start_day+1);
    raise exception 'Anonymous request reached admin inventory';
  exception when insufficient_privilege then null; end;
  reset role;

  update public.stay_properties set status='published' where id=property;
  item := jsonb_build_object('service_type','stay','service_name','Inventory QA','property_id',property,
    'room_type_id',room,'quantity',1,'guests',1);
  perform set_config('request.jwt.claim.sub',customer::text,true);
  set local role authenticated;
  begin
    insert into public.stay_room_inventory_blocks(room_type_id,starts_on,ends_on,blocked_units,reason)
      values(room,start_day,start_day,1,'Not authorized');
    raise exception 'Customer could create an inventory block';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_stay_inventory(room,start_day,start_day+1);
    raise exception 'Customer reached admin inventory';
  exception when insufficient_privilege then null; end;
  select id into first_booking from public.create_booking_order('Synthetic QA','6280000000000',null,null,
    jsonb_build_array(item || jsonb_build_object('date_start',start_day,'date_end',start_day+1)));
  perform public.create_booking_order('Synthetic QA','6280000000000',null,null,
    jsonb_build_array(item || jsonb_build_object('date_start',start_day+1,'date_end',start_day+2)));
  -- With the old interval-wide sum, these adjacent reservations incorrectly exhausted two units.
  select id into last_booking from public.create_booking_order('Synthetic QA','6280000000000',null,null,
    jsonb_build_array(item || jsonb_build_object('date_start',start_day,'date_end',start_day+2)));
  begin
    perform public.create_booking_order('Synthetic QA','6280000000000',null,null,
      jsonb_build_array(item || jsonb_build_object('date_start',start_day,'date_end',start_day+2)));
    raise exception 'Oversold a full night';
  exception when raise_exception then
    if sqlerrm <> 'Ketersediaan kamar tidak mencukupi.' then raise; end if;
  end;
  reset role;

  update public.booking_orders set order_status='cancelled' where id=first_booking;
  update public.booking_orders set inventory_hold_expires_at=now()-interval '1 minute' where id=last_booking;
  if (select available from public.quote_stay_availability(room,start_day,start_day+1)) <> 2 then
    raise exception 'Cancellation or expired unpaid hold did not release inventory';
  end if;

  perform set_config('request.jwt.claim.sub',admin_user::text,true);
  set local role authenticated;
  insert into public.stay_room_inventory_blocks(room_type_id,starts_on,ends_on,blocked_units,reason)
    values (room,start_day,start_day+1,1,'Synthetic maintenance') returning id into block_id;
  select * into stock from public.admin_stay_inventory(room,start_day+1,start_day+2);
  if (stock.total,stock.booked,stock.blocked,stock.available) is distinct from (2,1::bigint,1::bigint,0::bigint) then
    raise exception 'Invalid maintenance inventory: %', stock;
  end if;
  begin
    update public.stay_room_types set total_units=1 where id=room;
    raise exception 'Admin could reduce stock below booked and blocked units';
  exception when raise_exception then
    if sqlerrm not like 'Jumlah unit tidak boleh%' then raise; end if;
  end;
  begin
    insert into public.stay_room_inventory_blocks(room_type_id,starts_on,ends_on,reason)
      values (room,start_day+1,start_day+1,'Synthetic closure');
    raise exception 'Closure consumed a held reservation';
  exception when raise_exception then
    if sqlerrm not like 'Blokir melebihi%' then raise; end if;
  end;
  delete from public.stay_room_inventory_blocks where id=block_id;
  insert into public.stay_room_inventory_blocks(room_type_id,starts_on,ends_on,reason)
    values (room,start_day+2,start_day+2,'Synthetic closure') returning id into block_id;
  if (select available from public.quote_stay_availability(room,start_day+2,start_day+3)) <> 0
    or (select available from public.quote_stay_availability(room,start_day+3,start_day+4)) <> 2 then
    raise exception 'Full-day closure or exclusive checkout was incorrect';
  end if;
  delete from public.stay_room_inventory_blocks where id=block_id;
  insert into public.calendar_date_blocks(service_type,service_id,start_date,end_date,created_by)
    values ('stay',property,start_day+2,start_day+2,admin_user);
  select * into stock from public.admin_stay_inventory(room,start_day+2,start_day+3);
  if not stock.calendar_closed or stock.available <> 0 then
    raise exception 'Existing Calendar closure was ignored';
  end if;
  reset role;
  perform set_config('request.jwt.claim.sub',customer::text,true);
  set local role authenticated;
  if exists (select 1 from public.stay_room_inventory_blocks) then
    raise exception 'Customer can see internal block details';
  end if;
  begin
    perform public.create_booking_order('Synthetic QA','6280000000000',null,null,
      jsonb_build_array(item || jsonb_build_object('date_start',start_day+2,'date_end',start_day+3)));
    raise exception 'Booking ignored a Calendar closure';
  exception when raise_exception then
    if sqlerrm <> 'Ketersediaan kamar tidak mencukupi.' then raise; end if;
  end;
  reset role;
end $$;

rollback;
