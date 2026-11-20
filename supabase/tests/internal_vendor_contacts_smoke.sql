-- Local fixtures only. Roll back the booking and all vendor data.
begin;
do $$
declare
  admin_id uuid := gen_random_uuid();
  customer_id uuid := gen_random_uuid();
  trip uuid := gen_random_uuid();
  departure uuid := gen_random_uuid();
  booking uuid := gen_random_uuid();
begin
  insert into auth.users(id,aud,role,email)
  values (admin_id,'authenticated','authenticated',admin_id||'@local.test'),
         (customer_id,'authenticated','authenticated',customer_id||'@local.test');
  insert into public.admin_users(user_id) values(admin_id);
  insert into public.trip_packages(id,title,slug,location,status,pricing_model,base_price,min_pax,max_pax)
  values(trip,'Vendor smoke trip',trip::text,'Local test','published','open_per_person',12000,1,2);
  insert into public.trip_departures(id,trip_id,departure_date,price_per_person,min_participants,max_participants,status)
  values(departure,trip,current_date+90,12000,1,2,'open');
  insert into public.booking_orders(id,order_number,user_id,customer_name,customer_whatsapp)
  values(booking,booking::text,customer_id,'Synthetic Customer','6280000000000');
  insert into public.booking_items(booking_id,trip_id,departure_id,service_type,service_name,date_start,quantity,guests)
  values(booking,trip,departure,'trip','Vendor smoke trip',current_date+90,1,1);

  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  set local role authenticated;
  insert into public.internal_vendor_contacts(trip_id,name,whatsapp,notes)
  values(trip,'Synthetic PIC','6281234567890','Private note');
  insert into public.internal_vendor_contacts(trip_id,name,whatsapp)
  values(trip,'Updated PIC','6281234567890')
  on conflict(trip_id) do update set name=excluded.name;
  if not exists(select 1 from public.admin_booking_vendor_contacts(booking) where name='Updated PIC' and whatsapp='6281234567890') then
    raise exception 'Admin booking vendor lookup failed';
  end if;

  perform set_config('request.jwt.claim.sub',customer_id::text,true);
  if exists(select 1 from public.internal_vendor_contacts) or exists(select 1 from public.admin_booking_vendor_contacts(booking)) then
    raise exception 'Customer can see vendor data';
  end if;
  begin
    insert into public.internal_vendor_contacts(trip_id,name,whatsapp) values(trip,'Unauthorized','6281234567890');
    raise exception 'Customer can write vendor data';
  exception when insufficient_privilege then null;
  end;
  reset role;
  if has_table_privilege('anon','public.internal_vendor_contacts','SELECT')
     or has_function_privilege('anon','public.admin_booking_vendor_contacts(uuid)','EXECUTE') then
    raise exception 'Anonymous grants expose vendor data';
  end if;
end $$;
rollback;
