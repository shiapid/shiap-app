-- A booking must have a server-calculated payable price. Reject uncatalogued
-- services until an admin price is available instead of displaying Rp0.
alter table public.booking_items
  add constraint booking_items_positive_unit_price check (unit_price > 0) not valid;

create or replace function public.submit_booking_payment_proof(
  p_booking_id uuid,p_storage_path text,p_file_name text,p_mime_type text,p_file_size bigint
)
returns uuid language plpgsql security definer set search_path=public,auth,storage
as $$
declare uid uuid:=auth.uid(); rec uuid; status_now text; payment_now text;
begin
 if uid is null then raise exception 'Silakan login terlebih dahulu.'; end if;
 if p_mime_type not in('image/jpeg','image/png','image/webp','application/pdf') then raise exception 'Format bukti pembayaran tidak didukung.'; end if;
 if p_file_size is null or p_file_size<=0 or p_file_size>8388608 then raise exception 'Ukuran file maksimal 8 MB.'; end if;
 if split_part(coalesce(p_storage_path,''),'/',1)<>uid::text or split_part(p_storage_path,'/',2)<>p_booking_id::text or split_part(p_storage_path,'/',3)='' then raise exception 'Lokasi file bukti pembayaran tidak valid.'; end if;
 select order_status,payment_status into status_now,payment_now from public.booking_orders where id=p_booking_id and user_id=uid for update;
 if not found then raise exception 'Booking tidak ditemukan atau bukan milik Anda.'; end if;
 if status_now not in('pending_confirmation','confirmed') then raise exception 'Bukti pembayaran hanya dapat dikirim untuk booking yang masih aktif.'; end if;
 if payment_now='paid' then raise exception 'Pembayaran booking ini sudah diverifikasi.'; end if;
 if not exists(select 1 from storage.objects where bucket_id='booking-payment-proofs' and name=p_storage_path) then raise exception 'File bukti pembayaran belum ditemukan di penyimpanan.'; end if;
 insert into public.booking_payment_records(booking_id,user_id,storage_path,original_file_name,mime_type,file_size)
 values(p_booking_id,uid,p_storage_path,left(coalesce(p_file_name,'bukti-pembayaran'),255),p_mime_type,p_file_size) returning id into rec;
 insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note)
 values(p_booking_id,uid,'customer','payment_proof_submitted','Customer mengirim bukti pembayaran.');
 update public.booking_orders set payment_status='pending' where id=p_booking_id;
 return rec;
end $$;
revoke all on function public.submit_booking_payment_proof(uuid,text,text,text,bigint) from public,anon;
grant execute on function public.submit_booking_payment_proof(uuid,text,text,text,bigint) to authenticated;

drop policy booking_proofs_owner_insert on storage.objects;
create policy booking_proofs_owner_insert on storage.objects for insert to authenticated with check(
 bucket_id='booking-payment-proofs'
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.booking_orders b where b.id=((storage.foldername(name))[2])::uuid
   and b.user_id=(select auth.uid()) and b.order_status in('pending_confirmation','confirmed') and b.payment_status<>'paid')
);
