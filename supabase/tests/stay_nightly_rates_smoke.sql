begin;
do $$
declare property uuid:=gen_random_uuid(); room uuid:=gen_random_uuid(); customer uuid:=gen_random_uuid(); special_id uuid;
  booking uuid; bill record; snap jsonb; start_day date:=current_date+60;
  items jsonb; nightly numeric[]; labels text[];
begin
  while extract(isodow from start_day)<>4 loop start_day:=start_day+1; end loop;
  insert into auth.users(id,aud,role,email) values(customer,'authenticated','authenticated',customer||'@local.test');
  insert into public.stay_properties(id,name,slug,location,status)
    values(property,'Synthetic Stay',property::text,'Local test','published');
  insert into public.stay_room_types(id,property_id,name,capacity,total_units,weekday_price,weekend_price,status)
    values(room,property,'Nightly Room',3,5,300000,375000,'active');
  insert into public.stay_special_rates(room_type_id,starts_on,ends_on,price)
    values(room,start_day+2,start_day+3,1000000) returning id into special_id;
  begin
    insert into public.stay_special_rates(room_type_id,starts_on,ends_on,price)
      values(room,start_day+3,start_day+4,300000);
    raise exception 'overlapping special dates accepted';
  exception when exclusion_violation then null; end;
  begin
    update public.stay_room_types set weekday_price=300000.25 where id=room;
    raise exception 'fractional Rupiah accepted';
  exception when check_violation then null; end;

  set local role anon;
  select array_agg(rate order by night),array_agg(rate_kind order by night) into nightly,labels
    from public.quote_stay_nights(room,start_day,start_day+4);
  if nightly is distinct from array[300000,375000,1000000,1000000]::numeric[]
    or labels is distinct from array['weekday','weekend','special','special'] then
    raise exception 'Incorrect nightly selection: % %',nightly,labels;
  end if;
  begin
    insert into public.stay_special_rates(room_type_id,starts_on,ends_on,price)
      values(room,start_day+8,start_day+8,375000);
    raise exception 'public could edit calendar prices';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claim.sub',customer::text,true);
  items:=jsonb_build_array(jsonb_build_object('service_type','stay','service_name','Nightly Room','property_id',property,
    'room_type_id',room,'date_start',start_day,'date_end',start_day+3,'quantity',2,'guests',3,'expected_stay_subtotal',1675000));
  select b.id into booking from public.create_booking_order('Synthetic QA','6280000000000',null,null,items) b;
  select package_subtotal,service_fee_total,total_amount into bill from public.booking_orders where id=booking;
  select stay_rate_snapshot into snap from public.booking_items where booking_id=booking;
  if bill.package_subtotal<>3350000 or bill.total_amount<>3350000+bill.service_fee_total or (snap->>'subtotal')::numeric is distinct from 1675000 then
    raise exception 'Incorrect server subtotal or fee snapshot: %',bill;
  end if;
  update public.stay_special_rates set price=375001 where id=special_id;
  begin
    perform public.create_booking_order('Synthetic QA','6280000000000',null,null,items);
    raise exception 'Stale price accepted';
  exception when raise_exception then
    if sqlerrm not like 'Tarif Stay berubah.%' then raise; end if;
  end;
  if (select stay_rate_snapshot from public.booking_items where booking_id=booking) is distinct from snap
     or (select total_amount from public.booking_orders where id=booking) is distinct from bill.total_amount then
    raise exception 'Saved booking repriced';
  end if;
end $$;
rollback;
