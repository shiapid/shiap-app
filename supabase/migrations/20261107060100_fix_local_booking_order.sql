-- Correct local order code generation to avoid depending on extension search_path.
create or replace function public.create_booking_order(p_customer_name text,p_customer_whatsapp text,p_customer_email text,p_customer_notes text,p_items jsonb)
returns table(id uuid,order_number text)
language plpgsql security definer set search_path=public,auth
as $$
declare uid uuid:=auth.uid(); oid uuid; onum text; item jsonb; typ text; tid uuid; did uuid; pid uuid; rid uuid;
 start_on date; end_on date; qty integer; pax integer; seats integer; max_seats integer; units integer; used_units integer;
 price numeric; amount numeric:=0;
begin
 if uid is null then raise exception 'Silakan login terlebih dahulu.'; end if;
 if nullif(trim(p_customer_name),'') is null or nullif(trim(p_customer_whatsapp),'') is null then raise exception 'Nama dan nomor WhatsApp wajib diisi.'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>20 then raise exception 'Daftar layanan tidak valid.'; end if;
 onum:='SH-'||to_char(clock_timestamp() at time zone 'UTC','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 insert into public.booking_orders(order_number,user_id,customer_name,customer_whatsapp,customer_email,customer_notes)
 values(onum,uid,trim(p_customer_name),trim(p_customer_whatsapp),nullif(trim(p_customer_email),''),nullif(trim(p_customer_notes),'')) returning booking_orders.id into oid;
 for item in select value from jsonb_array_elements(p_items) as e(value) loop
  typ:=item->>'service_type';
  if typ not in('trip','stay','activity','documentation','other') then raise exception 'Jenis layanan tidak valid.'; end if;
  start_on:=nullif(item->>'date_start','')::date; end_on:=nullif(item->>'date_end','')::date;
  qty:=coalesce(nullif(item->>'quantity','')::integer,1); pax:=coalesce(nullif(item->>'guests','')::integer,1);
  if start_on is null or start_on<current_date or qty<1 or qty>20 or pax<1 or pax>100 then raise exception 'Tanggal atau jumlah layanan tidak valid.'; end if;
  if typ='stay' and (end_on is null or end_on<=start_on) then raise exception 'Tanggal check-out harus setelah check-in.'; end if;
  tid:=nullif(item->>'trip_id','')::uuid; did:=nullif(item->>'departure_id','')::uuid; pid:=nullif(item->>'property_id','')::uuid; rid:=nullif(item->>'room_type_id','')::uuid;
  if typ='trip' and tid is not null then
   if did is not null then
    select d.booked_seats,d.max_participants into seats,max_seats from public.trip_departures d join public.trip_packages p on p.id=d.trip_id and p.status='published'
    where d.id=did and d.trip_id=tid and d.status='open' for update of d;
    if not found then raise exception 'Jadwal trip tidak tersedia.'; end if;
    if seats+pax>max_seats then raise exception 'Kapasitas jadwal tidak mencukupi.'; end if;
    update public.trip_departures set booked_seats=booked_seats+pax where trip_departures.id=did;
   elsif not exists(select 1 from public.trip_packages p where p.id=tid and p.status='published') then raise exception 'Paket trip tidak tersedia.';
   end if;
  elsif typ='stay' and rid is not null then
   perform pg_advisory_xact_lock(hashtextextended(rid::text,0));
   select r.total_units into units from public.stay_room_types r join public.stay_properties p on p.id=r.property_id where r.id=rid and r.property_id=pid and r.status='active' and p.status='published';
   if not found then raise exception 'Tipe kamar tidak tersedia.'; end if;
   if pax>qty*(select capacity from public.stay_room_types where stay_room_types.id=rid) then raise exception 'Jumlah tamu melebihi kapasitas kamar.'; end if;
   select coalesce(sum(i.quantity),0)::integer into used_units from public.booking_items i join public.booking_orders b on b.id=i.booking_id
   where i.room_type_id=rid and i.date_start<end_on and i.date_end>start_on and b.order_status in('pending_confirmation','confirmed');
   if used_units+qty>units then raise exception 'Ketersediaan kamar tidak mencukupi.'; end if;
  end if;
  insert into public.booking_items(booking_id,service_type,service_name,variant,date_start,date_end,quantity,guests,notes,trip_id,departure_id,property_id,room_type_id)
  values(oid,typ,coalesce(nullif(trim(item->>'service_name'),''),'Layanan SHIAP'),nullif(trim(item->>'variant'),''),start_on,end_on,qty,pax,nullif(trim(item->>'notes'),''),tid,did,pid,rid)
  returning unit_price into price;
  if typ='trip' and did is not null then update public.trip_departures set status='full' where trip_departures.id=did and booked_seats>=max_participants; end if;
  if typ='trip' then amount:=amount+price*pax*qty; elsif typ='stay' then amount:=amount+price*(end_on-start_on)*qty; else amount:=amount+price*qty; end if;
 end loop;
 update public.booking_orders set total_amount=amount where booking_orders.id=oid;
 insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,to_status,note) values(oid,uid,'customer','booking_created','pending_confirmation','Permintaan booking dibuat.');
 return query select oid,onum;
end $$;
revoke all on function public.create_booking_order(text,text,text,text,jsonb) from public,anon;
grant execute on function public.create_booking_order(text,text,text,text,jsonb) to authenticated;
