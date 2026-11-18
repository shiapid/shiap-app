begin;

create table public.admin_customer_contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check(length(trim(full_name)) between 2 and 160),
  whatsapp text not null check(length(trim(whatsapp)) between 5 and 40),
  email text check(email is null or length(email)<=254),
  notes text check(notes is null or length(notes)<=1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_customer_contacts enable row level security;
revoke all on public.admin_customer_contacts from anon,authenticated;
grant select,insert,update,delete on public.admin_customer_contacts to authenticated;
grant all on public.admin_customer_contacts to service_role;
create policy admin_customer_contacts_admin_all on public.admin_customer_contacts
  for all to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());

create or replace function public.admin_update_customer_bookings(
  p_user_id uuid, p_name text, p_whatsapp text, p_email text default null
) returns void language plpgsql security definer set search_path=public,auth
as $$
declare admin_id uuid:=auth.uid(); old_name text; old_phone text; old_email text;
begin
  if admin_id is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  if nullif(trim(p_name),'') is null or length(trim(p_name))>160 or nullif(trim(p_whatsapp),'') is null or length(trim(p_whatsapp))>40 or length(coalesce(trim(p_email),''))>254 then
    raise exception 'Nama, WhatsApp, atau email pelanggan tidak valid.';
  end if;
  select customer_name,customer_whatsapp,customer_email into old_name,old_phone,old_email
    from public.booking_orders where user_id=p_user_id order by created_at desc limit 1;
  if not found then raise exception 'Pelanggan dengan booking tidak ditemukan.'; end if;
  update public.profiles set full_name=trim(p_name),whatsapp=trim(p_whatsapp),updated_at=now() where id=p_user_id;
  update public.booking_orders set customer_name=trim(p_name),customer_whatsapp=trim(p_whatsapp),customer_email=nullif(trim(p_email),'')
    where user_id=p_user_id;
  insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note)
    select id,admin_id,'admin','customer_details_updated',format('Data pelanggan diperbarui: %s / %s%s',old_name,old_phone,case when old_email is null then '' else ' / '||old_email end)
    from public.booking_orders where user_id=p_user_id;
end $$;
revoke all on function public.admin_update_customer_bookings(uuid,text,text,text) from public,anon;
grant execute on function public.admin_update_customer_bookings(uuid,text,text,text) to authenticated;

create or replace function public.admin_mark_booking_paid(p_booking_id uuid,p_note text default null)
returns void language plpgsql security definer set search_path=public,auth
as $$
declare admin_id uuid:=auth.uid(); old_payment text; order_state text;
begin
  if admin_id is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  select payment_status,order_status into old_payment,order_state from public.booking_orders where id=p_booking_id for update;
  if not found then raise exception 'Booking tidak ditemukan.'; end if;
  if order_state not in ('confirmed','completed') then raise exception 'Booking harus dikonfirmasi sebelum pembayaran dicatat.'; end if;
  if old_payment='paid' then raise exception 'Pembayaran booking ini sudah dikonfirmasi.'; end if;
  update public.booking_orders set payment_status='paid' where id=p_booking_id;
  insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,from_status,to_status,note)
    values(p_booking_id,admin_id,'admin','payment_received_manually',old_payment,'paid',coalesce(nullif(trim(p_note),''),'Pembayaran diterima admin tanpa bukti unggahan pelanggan.'));
end $$;
revoke all on function public.admin_mark_booking_paid(uuid,text) from public,anon;
grant execute on function public.admin_mark_booking_paid(uuid,text) to authenticated;

create or replace function public.admin_update_booking_customer(
  p_booking_id uuid,p_name text,p_whatsapp text,p_email text default null,p_notes text default null
) returns void language plpgsql security definer set search_path=public,auth
as $$
declare admin_id uuid:=auth.uid(); old_name text; old_phone text;
begin
  if admin_id is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  if nullif(trim(p_name),'') is null or length(trim(p_name))>160 or nullif(trim(p_whatsapp),'') is null or length(trim(p_whatsapp))>40 or length(coalesce(trim(p_email),''))>254 or length(coalesce(p_notes,''))>2000 then
    raise exception 'Data pemesan tidak valid.';
  end if;
  update public.booking_orders set customer_name=trim(p_name),customer_whatsapp=trim(p_whatsapp),customer_email=nullif(trim(p_email),''),customer_notes=nullif(trim(p_notes),'')
    where id=p_booking_id returning customer_name,customer_whatsapp into old_name,old_phone;
  if not found then raise exception 'Booking tidak ditemukan.'; end if;
  insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note)
    values(p_booking_id,admin_id,'admin','booking_customer_details_updated',format('Data pemesan diperbarui menjadi %s / %s.',old_name,old_phone));
end $$;
revoke all on function public.admin_update_booking_customer(uuid,text,text,text,text) from public,anon;
grant execute on function public.admin_update_booking_customer(uuid,text,text,text,text) to authenticated;

create or replace function public.admin_delete_unpaid_booking(p_booking_id uuid)
returns void language plpgsql security definer set search_path=public,auth
as $$
declare admin_id uuid:=auth.uid(); row_booking public.booking_orders%rowtype; x record;
begin
  if admin_id is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  select * into row_booking from public.booking_orders where id=p_booking_id for update;
  if not found then raise exception 'Booking tidak ditemukan.'; end if;
  if row_booking.payment_status='paid' or row_booking.order_status in('completed') then raise exception 'Booking lunas atau selesai tidak dapat dihapus.'; end if;
  if exists(select 1 from public.booking_payment_records where booking_id=p_booking_id) then raise exception 'Booking dengan riwayat bukti pembayaran tidak dapat dihapus.'; end if;
  if row_booking.order_status in('pending_confirmation','confirmed') then
    for x in select departure_id,guests from public.booking_items where booking_id=p_booking_id and departure_id is not null loop
      update public.trip_departures set booked_seats=greatest(0,booked_seats-x.guests),status=case when status='full' then 'open' else status end where id=x.departure_id;
    end loop;
  end if;
  delete from public.booking_orders where id=p_booking_id;
end $$;
revoke all on function public.admin_delete_unpaid_booking(uuid) from public,anon;
grant execute on function public.admin_delete_unpaid_booking(uuid) to authenticated;

commit;
