begin;

-- Keep the existing order RPC signature while adding an explicit 15-minute
-- inventory hold for new, unpaid booking requests.
create extension if not exists pg_cron with schema pg_catalog;

alter table public.booking_orders
  add column inventory_hold_expires_at timestamptz;

alter table public.booking_orders
  drop constraint booking_orders_order_status_check;
alter table public.booking_orders
  add constraint booking_orders_order_status_check
  check (order_status in ('pending_confirmation','confirmed','rejected','cancelled','completed','expired'));

create index booking_orders_expiring_holds_idx
  on public.booking_orders(inventory_hold_expires_at)
  where order_status='pending_confirmation' and payment_status='unpaid';

comment on column public.booking_orders.inventory_hold_expires_at is
  'Inventory reservation deadline; NULL preserves legacy requests created before the hold engine.';

create or replace function public.recalculate_trip_departure_inventory(p_departure_id uuid)
returns void language plpgsql security definer set search_path=public,auth
as $$
declare
  max_seats integer;
  active_seats integer;
  departure_status text;
begin
  select d.max_participants,d.status into max_seats,departure_status
    from public.trip_departures d where d.id=p_departure_id for update;
  if not found then return; end if;

  select coalesce(sum(i.guests*i.quantity),0)::integer into active_seats
    from public.booking_items i
    join public.booking_orders b on b.id=i.booking_id
   where i.departure_id=p_departure_id
     and (
       b.order_status in ('confirmed','completed')
       or (b.order_status='pending_confirmation' and (
         b.inventory_hold_expires_at is null
         or b.inventory_hold_expires_at>clock_timestamp()
         or b.payment_status<>'unpaid'
         or exists(select 1 from public.booking_payment_records p where p.booking_id=b.id and p.status='pending')
       ))
     );

  update public.trip_departures d
     set booked_seats=active_seats,
         status=case when departure_status='full' and active_seats<max_seats then 'open' else d.status end
   where d.id=p_departure_id;
end $$;
revoke all on function public.recalculate_trip_departure_inventory(uuid) from public,anon,authenticated;

create or replace function public.expire_booking_holds()
returns integer language plpgsql security definer set search_path=public,auth
as $$
declare
  expired_booking record;
  departure record;
  expired_count integer:=0;
begin
  for expired_booking in
    select b.id,b.order_status
      from public.booking_orders b
     where b.order_status='pending_confirmation'
       and b.payment_status='unpaid'
       and b.inventory_hold_expires_at is not null
       and b.inventory_hold_expires_at<=clock_timestamp()
       and not exists(select 1 from public.booking_payment_records p where p.booking_id=b.id and p.status='pending')
     order by b.inventory_hold_expires_at,b.id
     limit 500
     for update of b skip locked
  loop
    update public.booking_orders set order_status='expired' where id=expired_booking.id;
    insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,from_status,to_status,note)
    values(expired_booking.id,null,'system','booking_hold_expired','pending_confirmation','expired','Reservasi kedaluwarsa setelah 15 menit tanpa pembayaran atau bukti transfer yang menunggu verifikasi.');

    for departure in
      select distinct i.departure_id from public.booking_items i
       where i.booking_id=expired_booking.id and i.departure_id is not null
    loop
      perform public.recalculate_trip_departure_inventory(departure.departure_id);
    end loop;
    expired_count:=expired_count+1;
  end loop;
  return expired_count;
end $$;
revoke all on function public.expire_booking_holds() from public,anon;
grant execute on function public.expire_booking_holds() to authenticated;

create or replace function public.create_booking_order(
  p_customer_name text,p_customer_whatsapp text,p_customer_email text,p_customer_notes text,p_items jsonb
)
returns table(id uuid,order_number text)
language plpgsql security definer set search_path=public,auth
as $$
declare
  uid uuid:=auth.uid(); oid uuid; onum text; item jsonb; typ text; tid uuid; did uuid; pid uuid; rid uuid; service_id uuid;
  start_on date; end_on date; qty integer; pax integer; seat_count integer; seats integer; max_seats integer;
  units integer; used_units integer; price numeric; basis text; amount numeric:=0;
begin
  if uid is null then raise exception 'Silakan login terlebih dahulu.'; end if;
  if nullif(trim(p_customer_name),'') is null or nullif(trim(p_customer_whatsapp),'') is null then raise exception 'Nama dan nomor WhatsApp wajib diisi.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>20 then raise exception 'Daftar layanan tidak valid.'; end if;

  perform public.expire_booking_holds();
  onum:='SH-'||to_char(clock_timestamp() at time zone 'UTC','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.booking_orders(order_number,user_id,customer_name,customer_whatsapp,customer_email,customer_notes,inventory_hold_expires_at)
  values(onum,uid,trim(p_customer_name),trim(p_customer_whatsapp),nullif(trim(p_customer_email),''),nullif(trim(p_customer_notes),''),clock_timestamp()+interval '15 minutes')
  returning booking_orders.id into oid;

  for item in select value from jsonb_array_elements(p_items) as e(value) loop
    typ:=item->>'service_type';
    if typ not in('trip','stay','activity','documentation','other') then raise exception 'Jenis layanan tidak valid.'; end if;
    start_on:=nullif(item->>'date_start','')::date; end_on:=nullif(item->>'date_end','')::date;
    qty:=coalesce(nullif(item->>'quantity','')::integer,1); pax:=coalesce(nullif(item->>'guests','')::integer,1);
    if start_on is null or start_on<current_date or qty<1 or qty>20 or pax<1 or pax>100 then raise exception 'Tanggal atau jumlah layanan tidak valid.'; end if;
    if typ='stay' and (end_on is null or end_on<=start_on) then raise exception 'Tanggal check-out harus setelah check-in.'; end if;
    tid:=nullif(item->>'trip_id','')::uuid; did:=nullif(item->>'departure_id','')::uuid;
    pid:=nullif(item->>'property_id','')::uuid; rid:=nullif(item->>'room_type_id','')::uuid;
    service_id:=nullif(item->>'service_catalog_id','')::uuid;

    if typ='trip' and tid is not null then
      if did is not null then
        select d.max_participants into max_seats
          from public.trip_departures d join public.trip_packages p on p.id=d.trip_id and p.status='published'
         where d.id=did and d.trip_id=tid and d.status='open' for update of d;
        if not found then raise exception 'Jadwal trip tidak tersedia.'; end if;
        select coalesce(sum(i.guests*i.quantity),0)::integer into seats
          from public.booking_items i join public.booking_orders b on b.id=i.booking_id
         where i.departure_id=did
           and (b.order_status in('confirmed','completed') or (b.order_status='pending_confirmation' and (
             b.inventory_hold_expires_at is null or b.inventory_hold_expires_at>clock_timestamp()
             or b.payment_status<>'unpaid'
             or exists(select 1 from public.booking_payment_records pmt where pmt.booking_id=b.id and pmt.status='pending')
           )));
        seat_count:=pax*qty;
        if seats+seat_count>max_seats then raise exception 'Kapasitas jadwal tidak mencukupi.'; end if;
        update public.trip_departures d
           set booked_seats=seats+seat_count,
               status=case when seats+seat_count>=max_participants then 'full' else 'open' end
         where d.id=did;
      elsif not exists(select 1 from public.trip_packages p where p.id=tid and p.status='published') then
        raise exception 'Paket trip tidak tersedia.';
      end if;
    elsif typ='stay' and rid is not null then
      perform pg_advisory_xact_lock(hashtextextended(rid::text,0));
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
      if used_units+qty>units then raise exception 'Ketersediaan kamar tidak mencukupi.'; end if;
    elsif typ in ('activity','documentation') and service_id is null then
      raise exception 'Pilih layanan yang tersedia di katalog SHIAP.';
    end if;

    insert into public.booking_items(booking_id,service_type,service_name,variant,date_start,date_end,quantity,guests,notes,trip_id,departure_id,property_id,room_type_id,service_catalog_id)
    values(oid,typ,coalesce(nullif(trim(item->>'service_name'),''),'Layanan SHIAP'),nullif(trim(item->>'variant'),''),start_on,end_on,qty,pax,nullif(trim(item->>'notes'),''),tid,did,pid,rid,service_id)
    returning unit_price,price_basis into price,basis;
    if price is null or price<=0 then raise exception 'Harga layanan belum tersedia. Silakan hubungi SHIAP.'; end if;
    if typ='trip' or basis='per_person' then amount:=amount+price*pax*qty;
    elsif typ='stay' then amount:=amount+price*(end_on-start_on)*qty;
    else amount:=amount+price*qty; end if;
  end loop;

  update public.booking_orders set total_amount=amount where booking_orders.id=oid;
  insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,from_status,to_status,note)
  values(oid,uid,'customer','booking_created','pending_confirmation','pending_confirmation','Permintaan booking dibuat. Hold inventory berlaku 15 menit.');
  return query select oid,onum;
end $$;
revoke all on function public.create_booking_order(text,text,text,text,jsonb) from public,anon;
grant execute on function public.create_booking_order(text,text,text,text,jsonb) to authenticated;

create or replace function public.admin_update_booking_status(p_booking_id uuid,p_new_status text,p_note text default null)
returns void language plpgsql security definer set search_path=public,auth
as $$
declare admin_id uuid:=auth.uid(); old_status text; pay_status text; x record;
begin
  if admin_id is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  if p_new_status not in('confirmed','rejected','cancelled','completed') then raise exception 'Status booking tidak valid.'; end if;
  perform public.expire_booking_holds();
  select order_status,payment_status into old_status,pay_status from public.booking_orders where id=p_booking_id for update;
  if not found then raise exception 'Booking tidak ditemukan.'; end if;
  if old_status='expired' then return; end if;
  if not ((old_status='pending_confirmation' and p_new_status in('confirmed','rejected','cancelled')) or (old_status='confirmed' and p_new_status in('completed','cancelled'))) then raise exception 'Perubahan status dari % ke % tidak diizinkan.',old_status,p_new_status; end if;
  if p_new_status='completed' and pay_status<>'paid' then raise exception 'Booking hanya dapat diselesaikan setelah pembayaran diverifikasi.'; end if;
  update public.booking_orders set order_status=p_new_status where id=p_booking_id;
  if p_new_status in('rejected','cancelled') then
    for x in select distinct departure_id from public.booking_items where booking_id=p_booking_id and departure_id is not null loop
      perform public.recalculate_trip_departure_inventory(x.departure_id);
    end loop;
  end if;
  insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,from_status,to_status,note)
  values(p_booking_id,admin_id,'admin','booking_status_changed',old_status,p_new_status,nullif(trim(coalesce(p_note,'')),''));
end $$;
revoke all on function public.admin_update_booking_status(uuid,text,text) from public,anon;
grant execute on function public.admin_update_booking_status(uuid,text,text) to authenticated;

create or replace function public.admin_delete_unpaid_booking(p_booking_id uuid)
returns void language plpgsql security definer set search_path=public,auth
as $$
declare admin_id uuid:=auth.uid(); row_booking public.booking_orders%rowtype; departure_ids uuid[]; i integer;
begin
  if admin_id is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  perform public.expire_booking_holds();
  select * into row_booking from public.booking_orders where id=p_booking_id for update;
  if not found then raise exception 'Booking tidak ditemukan.'; end if;
  if row_booking.payment_status='paid' or row_booking.order_status in('completed') then raise exception 'Booking lunas atau selesai tidak dapat dihapus.'; end if;
  if exists(select 1 from public.booking_payment_records where booking_id=p_booking_id) then raise exception 'Booking dengan riwayat bukti pembayaran tidak dapat dihapus.'; end if;
  select array_agg(distinct departure_id) into departure_ids from public.booking_items where booking_id=p_booking_id and departure_id is not null;
  delete from public.booking_orders where id=p_booking_id;
  if departure_ids is not null then
    for i in 1..array_length(departure_ids,1) loop
      perform public.recalculate_trip_departure_inventory(departure_ids[i]);
    end loop;
  end if;
end $$;
revoke all on function public.admin_delete_unpaid_booking(uuid) from public,anon;
grant execute on function public.admin_delete_unpaid_booking(uuid) to authenticated;

create or replace function public.customer_cancel_booking(p_booking_id uuid)
returns text language plpgsql security definer set search_path=public,auth
as $$
declare uid uuid:=auth.uid(); order_state text; pay_state text; x record;
begin
  if uid is null then raise exception 'Silakan login terlebih dahulu.'; end if;
  perform public.expire_booking_holds();
  select order_status,payment_status into order_state,pay_state
    from public.booking_orders where id=p_booking_id and user_id=uid for update;
  if not found then raise exception 'Booking tidak ditemukan atau bukan milik Anda.'; end if;
  if order_state='expired' then return 'expired'; end if;
  if order_state<>'pending_confirmation' or pay_state<>'unpaid' then
    raise exception 'Booking yang sudah dikonfirmasi atau memiliki pembayaran diproses harus dibatalkan melalui admin.';
  end if;
  if exists(select 1 from public.booking_payment_records where booking_id=p_booking_id and status='pending') then
    raise exception 'Pembatalan tidak tersedia saat bukti pembayaran sedang diverifikasi.';
  end if;
  update public.booking_orders set order_status='cancelled' where id=p_booking_id;
  for x in select distinct departure_id from public.booking_items where booking_id=p_booking_id and departure_id is not null loop
    perform public.recalculate_trip_departure_inventory(x.departure_id);
  end loop;
  insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,from_status,to_status,note)
  values(p_booking_id,uid,'customer','booking_cancelled',order_state,'cancelled','Pelanggan membatalkan booking sebelum konfirmasi/pembayaran.');
  return 'cancelled';
end $$;
revoke all on function public.customer_cancel_booking(uuid) from public,anon;
grant execute on function public.customer_cancel_booking(uuid) to authenticated;

create or replace function public.submit_booking_payment_proof(
  p_booking_id uuid,p_storage_path text,p_file_name text,p_mime_type text,p_file_size bigint
)
returns uuid language plpgsql security definer set search_path=public,auth,storage
as $$
declare uid uuid:=auth.uid(); rec uuid; status_now text; payment_now text; hold_expires_at timestamptz;
begin
  if uid is null then raise exception 'Silakan login terlebih dahulu.'; end if;
  if p_mime_type not in('image/jpeg','image/png','image/webp','application/pdf') then raise exception 'Format bukti pembayaran tidak didukung.'; end if;
  if p_file_size is null or p_file_size<=0 or p_file_size>8388608 then raise exception 'Ukuran file maksimal 8 MB.'; end if;
  if split_part(coalesce(p_storage_path,''),'/',1)<>uid::text or split_part(p_storage_path,'/',2)<>p_booking_id::text or split_part(p_storage_path,'/',3)='' then raise exception 'Lokasi file bukti pembayaran tidak valid.'; end if;
  select order_status,payment_status,inventory_hold_expires_at into status_now,payment_now,hold_expires_at
    from public.booking_orders where id=p_booking_id and user_id=uid for update;
  if not found then raise exception 'Booking tidak ditemukan atau bukan milik Anda.'; end if;
  if status_now not in('pending_confirmation','confirmed') then raise exception 'Reservasi sudah tidak aktif; bukti pembayaran tidak dapat dikirim.'; end if;
  if status_now='pending_confirmation' and payment_now='unpaid' and hold_expires_at is not null and hold_expires_at<=clock_timestamp() then
    raise exception 'Masa reservasi 15 menit telah habis. Silakan buat booking baru untuk mengecek ketersediaan.';
  end if;
  if payment_now='paid' then raise exception 'Pembayaran booking ini sudah diverifikasi.'; end if;
  if not exists(select 1 from storage.objects where bucket_id='booking-payment-proofs' and name=p_storage_path) then raise exception 'File bukti pembayaran belum ditemukan di penyimpanan.'; end if;
  insert into public.booking_payment_records(booking_id,user_id,storage_path,original_file_name,mime_type,file_size)
  values(p_booking_id,uid,p_storage_path,left(coalesce(p_file_name,'bukti-pembayaran'),255),p_mime_type,p_file_size) returning id into rec;
  insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note)
  values(p_booking_id,uid,'customer','payment_proof_submitted','Customer mengirim bukti pembayaran; hold inventory dijaga hingga bukti ditinjau.');
  update public.booking_orders set payment_status='pending' where id=p_booking_id;
  return rec;
end $$;
revoke all on function public.submit_booking_payment_proof(uuid,text,text,text,bigint) from public,anon;
grant execute on function public.submit_booking_payment_proof(uuid,text,text,text,bigint) to authenticated;

create or replace function public.admin_review_booking_payment(p_payment_record_id uuid,p_decision text,p_rejection_reason text default null)
returns void language plpgsql security definer set search_path=public,auth
as $$
declare admin_id uuid:=auth.uid(); booking uuid; old_state text;
begin
  if admin_id is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  if p_decision not in('approved','rejected') then raise exception 'Keputusan pembayaran tidak valid.'; end if;
  if p_decision='rejected' and length(trim(coalesce(p_rejection_reason,'')))<3 then raise exception 'Alasan penolakan minimal 3 karakter.'; end if;
  select booking_id,status into booking,old_state from public.booking_payment_records where id=p_payment_record_id for update;
  if not found then raise exception 'Bukti pembayaran tidak ditemukan.'; end if;
  if old_state<>'pending' then raise exception 'Bukti pembayaran sudah ditinjau.'; end if;
  update public.booking_payment_records set status=p_decision,rejection_reason=case when p_decision='rejected' then trim(p_rejection_reason) else null end,reviewed_at=now(),reviewed_by=admin_id where id=p_payment_record_id;
  if p_decision='approved' then
    update public.booking_orders set payment_status='paid' where id=booking;
  elsif not exists(select 1 from public.booking_payment_records where booking_id=booking and id<>p_payment_record_id and status='pending') then
    update public.booking_orders set payment_status='unpaid' where id=booking and payment_status='pending';
    perform public.expire_booking_holds();
  end if;
  insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note)
  values(booking,admin_id,'admin','payment_'||p_decision,case when p_decision='rejected' then trim(p_rejection_reason) else 'Bukti pembayaran disetujui.' end);
end $$;
revoke all on function public.admin_review_booking_payment(uuid,text,text) from public,anon;
grant execute on function public.admin_review_booking_payment(uuid,text,text) to authenticated;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='shiap-expire-inventory-holds' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('shiap-expire-inventory-holds','* * * * *','select public.expire_booking_holds();');
end $$;

comment on function public.create_booking_order(text,text,text,text,jsonb) is
  'Creates a server-priced, capacity-checked booking and a 15-minute inventory hold. Existing RPC signature retained.';
comment on function public.expire_booking_holds() is
  'Expires unpaid booking holds every minute, while preserving holds with payment proofs under review.';

commit;
