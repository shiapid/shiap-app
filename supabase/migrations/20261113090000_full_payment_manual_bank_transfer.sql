-- SHIAP policy: one full manual bank transfer per booking.
-- Existing bookings and finance ledger rows are left untouched.
begin;

alter table public.booking_payment_records
  add column if not exists verified_amount numeric(14,2),
  add column if not exists verified_bank_reference text;
alter table public.booking_payment_records
  drop constraint if exists booking_payment_records_verified_amount_check,
  add constraint booking_payment_records_verified_amount_check
    check (verified_amount is null or verified_amount > 0),
  drop constraint if exists booking_payment_records_verified_bank_reference_check,
  add constraint booking_payment_records_verified_bank_reference_check
    check (verified_bank_reference is null or length(trim(verified_bank_reference)) between 3 and 160);

-- The existing booking RPC remains the entry point. This carries server-priced
-- add-ons through its existing price trigger so the held total includes them.
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
        update public.trip_departures d set booked_seats=seats+seat_count,
          status=case when seats+seat_count>=max_participants then 'full' else 'open' end where d.id=did;
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

    insert into public.booking_items(booking_id,service_type,service_name,variant,date_start,date_end,quantity,guests,notes,
      trip_id,departure_id,property_id,room_type_id,service_catalog_id,selected_addons)
    values(oid,typ,coalesce(nullif(trim(item->>'service_name'),''),'Layanan SHIAP'),nullif(trim(item->>'variant'),''),start_on,end_on,qty,pax,
      nullif(trim(item->>'notes'),''),tid,did,pid,rid,service_id,
      case when typ in('activity','documentation') then coalesce(item->'selected_addons','[]'::jsonb) else '[]'::jsonb end)
    returning unit_price,price_basis into price,basis;
    if price is null or price<=0 then raise exception 'Harga layanan belum tersedia. Silakan hubungi SHIAP.'; end if;
    if typ='trip' or basis='per_person' then amount:=amount+price*pax*qty;
    elsif typ='stay' then amount:=amount+price*(end_on-start_on)*qty;
    else amount:=amount+price*qty; end if;
  end loop;

  update public.booking_orders set total_amount=amount where booking_orders.id=oid;
  insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,from_status,to_status,note)
  values(oid,uid,'customer','booking_created','pending_confirmation','pending_confirmation','Permintaan booking dibuat. Hold inventory berlaku 15 menit. Pembayaran penuh 100% melalui transfer bank.');
  return query select oid,onum;
end $$;
revoke all on function public.create_booking_order(text,text,text,text,jsonb) from public,anon;
grant execute on function public.create_booking_order(text,text,text,text,jsonb) to authenticated;

-- New payment entries must settle the whole outstanding payable amount and
-- include a bank mutation reference. Historical ledger rows are not rewritten.
create or replace function public.finance_record_transaction(
  p_booking_id uuid,p_entry_type text,p_amount numeric,p_idempotency_key text,
  p_note text default null,p_external_reference text default null
)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  admin_id uuid:=auth.uid(); order_row public.booking_orders%rowtype;
  entry_id uuid; existing public.finance_transaction_entries%rowtype;
  paid numeric; refunded numeric; amount numeric:=round(p_amount,2);
begin
  if admin_id is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  if p_entry_type not in('payment','refund','processing_fee','discount') then raise exception 'Jenis transaksi tidak valid.'; end if;
  if amount is null or amount<=0 or amount>999999999999.99 then raise exception 'Nominal transaksi tidak valid.'; end if;
  if length(trim(coalesce(p_idempotency_key,'')))<8 or length(p_idempotency_key)>180 then raise exception 'Kunci idempotensi tidak valid.'; end if;
  if p_entry_type='payment' and length(trim(coalesce(p_external_reference,'')))<3 then raise exception 'Referensi mutasi bank wajib dicatat untuk pembayaran.'; end if;
  if p_entry_type='payment' and length(trim(coalesce(p_external_reference,'')))>160 then raise exception 'Referensi mutasi bank maksimal 160 karakter.'; end if;
  if p_entry_type='payment' and not exists(select 1 from public.payment_settings where id=true and is_active) then raise exception 'Pembayaran transfer manual sedang dinonaktifkan.'; end if;
  select * into order_row from public.booking_orders b where b.id=p_booking_id for update;
  if not found then raise exception 'Booking tidak ditemukan.'; end if;
  if p_entry_type='payment' and not order_row.payment_enabled then raise exception 'Permintaan booking harus disetujui sebelum pembayaran dapat dicatat.'; end if;
  select * into existing from public.finance_transaction_entries e where e.idempotency_key=p_idempotency_key;
  if found then
    if existing.booking_id<>p_booking_id or existing.entry_type<>p_entry_type or existing.amount<>amount then
      raise exception 'Kunci idempotensi sudah digunakan untuk nominal atau transaksi berbeda.';
    end if;
    return existing.id;
  end if;
  if p_entry_type='payment' and exists(select 1 from public.booking_payment_records p where p.booking_id=p_booking_id and p.status='pending') then raise exception 'Bukti transfer sedang menunggu verifikasi; selesaikan pemeriksaan bukti terlebih dahulu.'; end if;
  select coalesce(sum(e.amount),0) into paid from public.finance_transaction_entries e
    where e.booking_id=p_booking_id and e.entry_type='payment' and e.status='posted';
  select coalesce(sum(e.amount),0) into refunded from public.finance_transaction_entries e
    where e.booking_id=p_booking_id and e.entry_type='refund' and e.status='posted';
  if p_entry_type='payment' and paid<>0 then raise exception 'Booking dengan histori pembayaran sebelumnya perlu rekonsiliasi legacy; pembayaran baru harus satu kali 100%%.'; end if;
  if p_entry_type='payment' and amount<>round(order_row.total_amount,2) then raise exception 'Nominal transfer wajib tepat 100%% total booking (%).',order_row.total_amount; end if;
  if p_entry_type='refund' and amount>greatest(paid-refunded,0) then raise exception 'Refund melebihi pembayaran bersih yang tercatat.'; end if;
  if p_entry_type='payment' and order_row.order_status in('cancelled','rejected','expired') then raise exception 'Booking tidak aktif tidak dapat menerima pembayaran baru.'; end if;
  insert into public.finance_transaction_entries(booking_id,entry_type,amount,source_type,source_id,idempotency_key,external_reference,note,actor_user_id)
  values(p_booking_id,p_entry_type,amount,'admin',p_idempotency_key,p_idempotency_key,nullif(trim(p_external_reference),''),nullif(trim(p_note),''),admin_id)
  returning id into entry_id;
  if p_entry_type='payment' then update public.booking_orders set payment_status='paid' where id=p_booking_id; end if;
  insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note)
  values(p_booking_id,admin_id,'admin','finance_'||p_entry_type,coalesce(nullif(trim(p_note),''),'Entri keuangan admin dicatat.'));
  return entry_id;
end $$;
revoke all on function public.finance_record_transaction(uuid,text,numeric,text,text,text) from public,anon;
grant execute on function public.finance_record_transaction(uuid,text,numeric,text,text,text) to authenticated;

-- Payment instructions and proof submission stay disabled for request-to-book
-- orders until the existing Experience approval flow enables payment.
create or replace function public.submit_booking_payment_proof(
  p_booking_id uuid,p_storage_path text,p_file_name text,p_mime_type text,p_file_size bigint
)
returns uuid language plpgsql security definer set search_path=public,auth,storage
as $$
declare uid uuid:=auth.uid(); rec uuid; status_now text; payment_now text; hold_expires_at timestamptz; payment_enabled_now boolean;
begin
  if uid is null then raise exception 'Silakan login terlebih dahulu.'; end if;
  if not exists(select 1 from public.payment_settings where id=true and is_active) then raise exception 'Pembayaran transfer manual sedang dinonaktifkan.'; end if;
  if p_mime_type not in('image/jpeg','image/png','image/webp','application/pdf') then raise exception 'Format bukti pembayaran tidak didukung.'; end if;
  if p_file_size is null or p_file_size<=0 or p_file_size>8388608 then raise exception 'Ukuran file maksimal 8 MB.'; end if;
  if split_part(coalesce(p_storage_path,''),'/',1)<>uid::text or split_part(p_storage_path,'/',2)<>p_booking_id::text or split_part(p_storage_path,'/',3)='' then raise exception 'Lokasi file bukti pembayaran tidak valid.'; end if;
  select order_status,payment_status,inventory_hold_expires_at,payment_enabled
    into status_now,payment_now,hold_expires_at,payment_enabled_now
    from public.booking_orders where id=p_booking_id and user_id=uid for update;
  if not found then raise exception 'Booking tidak ditemukan atau bukan milik Anda.'; end if;
  if not payment_enabled_now then raise exception 'Permintaan booking harus disetujui admin sebelum pembayaran.'; end if;
  if status_now not in('pending_confirmation','confirmed') then raise exception 'Reservasi sudah tidak aktif; bukti pembayaran tidak dapat dikirim.'; end if;
  if status_now='pending_confirmation' and payment_now='unpaid' and hold_expires_at is not null and hold_expires_at<=clock_timestamp() then raise exception 'Masa reservasi 15 menit telah habis. Silakan buat booking baru untuk mengecek ketersediaan.'; end if;
  if payment_now='paid' then raise exception 'Pembayaran booking ini sudah diverifikasi.'; end if;
  if not exists(select 1 from storage.objects where bucket_id='booking-payment-proofs' and name=p_storage_path) then raise exception 'File bukti pembayaran belum ditemukan di penyimpanan.'; end if;
  insert into public.booking_payment_records(booking_id,user_id,storage_path,original_file_name,mime_type,file_size)
  values(p_booking_id,uid,p_storage_path,left(coalesce(p_file_name,'bukti-pembayaran'),255),p_mime_type,p_file_size) returning id into rec;
  insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note)
  values(p_booking_id,uid,'customer','payment_proof_submitted','Customer mengirim bukti transfer bank penuh; menunggu verifikasi admin.');
  update public.booking_orders set payment_status='pending' where id=p_booking_id;
  return rec;
end $$;
revoke all on function public.submit_booking_payment_proof(uuid,text,text,text,bigint) from public,anon;
grant execute on function public.submit_booking_payment_proof(uuid,text,text,text,bigint) to authenticated;

drop policy if exists booking_proofs_owner_insert on storage.objects;
create policy booking_proofs_owner_insert on storage.objects for insert to authenticated with check(
  bucket_id='booking-payment-proofs'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(select 1 from public.payment_settings where id=true and is_active)
  and exists(select 1 from public.booking_orders b where b.id=((storage.foldername(name))[2])::uuid
    and b.user_id=(select auth.uid()) and b.payment_enabled
    and b.order_status in('pending_confirmation','confirmed') and b.payment_status<>'paid')
);

create or replace function public.finance_capture_approved_payment_proof()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare order_row public.booking_orders%rowtype; already_paid numeric; due numeric;
begin
  if new.status<>'approved' or old.status='approved' then return new; end if;
  if new.verified_amount is null or length(trim(coalesce(new.verified_bank_reference,'')))<3 then
    raise exception 'Pembayaran belum memiliki nominal dan referensi mutasi yang diverifikasi admin.';
  end if;
  select * into order_row from public.booking_orders where id=new.booking_id for update;
  if not found or order_row.payment_status='paid' or order_row.order_status in('cancelled','rejected','expired') then
    raise exception 'Booking tidak dapat dilunasi dari bukti ini.';
  end if;
  select coalesce(sum(amount),0) into already_paid from public.finance_transaction_entries
   where booking_id=new.booking_id and entry_type='payment' and status='posted';
  due:=round(order_row.total_amount,2);
  if already_paid<>0 or round(new.verified_amount,2)<>due then
    raise exception 'Nominal terverifikasi harus sama dengan total booking (%), tanpa pembayaran terdahulu.',due;
  end if;
  insert into public.finance_transaction_entries(booking_id,entry_type,amount,source_type,source_id,idempotency_key,external_reference,note,actor_user_id)
  values(new.booking_id,'payment',new.verified_amount,'booking_payment_proof',new.id::text,'proof:'||new.id::text,
    new.verified_bank_reference,'Transfer bank penuh telah diverifikasi admin.',new.reviewed_by)
  on conflict(idempotency_key) do nothing;
  return new;
end $$;

create or replace function public.admin_review_booking_payment_full_amount(
  p_payment_record_id uuid,p_decision text,p_received_amount numeric default null,
  p_bank_reference text default null,p_rejection_reason text default null
)
returns void language plpgsql security definer set search_path=public,auth
as $$
declare admin_id uuid:=auth.uid(); booking uuid; old_state text; order_state text; booking_payment text; can_pay boolean;
  payable numeric; already_paid numeric; due numeric; received numeric:=round(p_received_amount,2);
begin
  if admin_id is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  if p_decision not in('approved','rejected') then raise exception 'Keputusan pembayaran tidak valid.'; end if;
  if p_decision='rejected' and length(trim(coalesce(p_rejection_reason,'')))<3 then raise exception 'Alasan penolakan minimal 3 karakter.'; end if;
  select booking_id,status into booking,old_state from public.booking_payment_records where id=p_payment_record_id for update;
  if not found or old_state<>'pending' then raise exception 'Bukti pembayaran tidak ditemukan atau sudah ditinjau.'; end if;
  select order_status,payment_status,total_amount,payment_enabled into order_state,booking_payment,payable,can_pay from public.booking_orders where id=booking for update;
  if not found then raise exception 'Booking tidak ditemukan.'; end if;
  if p_decision='approved' then
    if not can_pay then raise exception 'Permintaan booking harus disetujui sebelum pembayaran dapat diverifikasi.'; end if;
    if order_state not in('pending_confirmation','confirmed') or booking_payment='paid' then raise exception 'Booking tidak dapat menerima pembayaran.'; end if;
    if received is null or received<=0 then raise exception 'Nominal mutasi terverifikasi wajib diisi.'; end if;
    if length(trim(coalesce(p_bank_reference,'')))<3 then raise exception 'Referensi mutasi bank wajib diisi.'; end if;
    select coalesce(sum(amount),0) into already_paid from public.finance_transaction_entries
      where booking_id=booking and entry_type='payment' and status='posted';
    due:=round(payable,2);
    if already_paid<>0 or received<>due then raise exception 'Pembayaran harus satu kali tepat 100%% total booking (%). Histori pembayaran lama perlu rekonsiliasi.',due; end if;
    if not exists(select 1 from public.payment_settings where id=true and is_active) then raise exception 'Instruksi transfer belum aktif.'; end if;
  end if;
  update public.booking_payment_records set status=p_decision,
    rejection_reason=case when p_decision='rejected' then trim(p_rejection_reason) else null end,
    verified_amount=case when p_decision='approved' then received else null end,
    verified_bank_reference=case when p_decision='approved' then left(trim(p_bank_reference),160) else null end,
    reviewed_at=now(),reviewed_by=admin_id where id=p_payment_record_id;
  if p_decision='approved' then
    select coalesce(sum(amount),0) into already_paid from public.finance_transaction_entries
      where booking_id=booking and entry_type='payment' and status='posted';
    if round(already_paid,2)<>round(payable,2) then raise exception 'Ledger pembayaran belum mencapai 100%% total tagihan.'; end if;
    update public.booking_orders set payment_status='paid' where id=booking;
  elsif not exists(select 1 from public.booking_payment_records where booking_id=booking and id<>p_payment_record_id and status='pending') then
    update public.booking_orders set payment_status='unpaid' where id=booking and payment_status='pending';
    perform public.expire_booking_holds();
  end if;
  insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note)
  values(booking,admin_id,'admin','payment_'||p_decision,
    case when p_decision='rejected' then trim(p_rejection_reason)
      else format('Pembayaran penuh %s diverifikasi dari mutasi bank %s.',received,left(trim(p_bank_reference),160)) end);
end $$;
revoke all on function public.admin_review_booking_payment_full_amount(uuid,text,numeric,text,text) from public,anon;
grant execute on function public.admin_review_booking_payment_full_amount(uuid,text,numeric,text,text) to authenticated;

-- Prevent older clients from approving a proof without entering a verified
-- received amount and bank statement reference.
create or replace function public.admin_review_booking_payment(p_payment_record_id uuid,p_decision text,p_rejection_reason text default null)
returns void language plpgsql security definer set search_path=public,auth
as $$
begin
  if auth.uid() is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  raise exception 'Verifikasi pembayaran memerlukan nominal mutasi dan referensi bank; perbarui aplikasi admin.';
end $$;
revoke all on function public.admin_review_booking_payment(uuid,text,text) from public,anon,authenticated;

create or replace function public.admin_mark_booking_paid_full_amount(
  p_booking_id uuid,p_received_amount numeric,p_bank_reference text,p_note text default null
)
returns void language plpgsql security definer set search_path=public,auth
as $$
declare admin_id uuid:=auth.uid(); order_row public.booking_orders%rowtype; paid numeric; due numeric; received numeric:=round(p_received_amount,2);
begin
  if admin_id is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  if received is null or received<=0 then raise exception 'Nominal transfer terverifikasi wajib diisi.'; end if;
  if length(trim(coalesce(p_bank_reference,'')))<3 then raise exception 'Referensi mutasi bank wajib dicatat.'; end if;
  select * into order_row from public.booking_orders where id=p_booking_id for update;
  if not found then raise exception 'Booking tidak ditemukan.'; end if;
  if not order_row.payment_enabled then raise exception 'Permintaan booking harus disetujui sebelum pembayaran dapat dicatat.'; end if;
  if order_row.order_status not in('pending_confirmation','confirmed') or order_row.payment_status='paid' or order_row.payment_status='pending' then
    raise exception 'Booking harus aktif, belum lunas, dan tidak sedang menunggu review bukti.';
  end if;
  if not exists(select 1 from public.payment_settings where id=true and is_active) then raise exception 'Instruksi transfer belum aktif.'; end if;
  select coalesce(sum(amount),0) into paid from public.finance_transaction_entries
    where booking_id=p_booking_id and entry_type='payment' and status='posted';
  due:=round(order_row.total_amount,2);
  if paid<>0 or received<>due then raise exception 'Pembayaran harus satu kali tepat 100%% total booking (%). Histori pembayaran lama perlu rekonsiliasi.',due; end if;
  perform public.finance_record_transaction(p_booking_id,'payment',received,'full-transfer:'||p_booking_id::text,
    coalesce(nullif(trim(p_note),''),'Transfer bank penuh diverifikasi melalui mutasi rekening.'),trim(p_bank_reference));
  insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,from_status,to_status,note)
    values(p_booking_id,admin_id,'admin','payment_received_manually',order_row.payment_status,'paid',
      format('Transfer penuh %s diverifikasi dari mutasi bank %s.',received,left(trim(p_bank_reference),160)));
end $$;
revoke all on function public.admin_mark_booking_paid_full_amount(uuid,numeric,text,text) from public,anon;
grant execute on function public.admin_mark_booking_paid_full_amount(uuid,numeric,text,text) to authenticated;

create or replace function public.admin_mark_booking_paid(p_booking_id uuid,p_note text default null)
returns void language plpgsql security definer set search_path=public,auth
as $$
begin
  if auth.uid() is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  raise exception 'Pelunasan memerlukan nominal transfer dan referensi mutasi bank; perbarui aplikasi admin.';
end $$;
revoke all on function public.admin_mark_booking_paid(uuid,text) from public,anon,authenticated;

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
  if p_new_status='confirmed' and pay_status<>'paid' then raise exception 'Booking hanya dapat dikonfirmasi setelah transfer 100%% diverifikasi.'; end if;
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

commit;
