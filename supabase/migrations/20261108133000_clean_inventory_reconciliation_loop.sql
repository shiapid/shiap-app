begin;

create or replace function public.admin_delete_unpaid_booking(p_booking_id uuid)
returns void language plpgsql security definer set search_path=public,auth
as $$
declare admin_id uuid:=auth.uid(); row_booking public.booking_orders%rowtype; departure_ids uuid[]; departure_id uuid;
begin
  if admin_id is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  perform public.expire_booking_holds();
  select * into row_booking from public.booking_orders where id=p_booking_id for update;
  if not found then raise exception 'Booking tidak ditemukan.'; end if;
  if row_booking.payment_status='paid' or row_booking.order_status in('completed') then raise exception 'Booking lunas atau selesai tidak dapat dihapus.'; end if;
  if exists(select 1 from public.booking_payment_records where booking_id=p_booking_id) then raise exception 'Booking dengan riwayat bukti pembayaran tidak dapat dihapus.'; end if;
  select array_agg(distinct departure_id) into departure_ids
    from public.booking_items where booking_id=p_booking_id and departure_id is not null;
  delete from public.booking_orders where id=p_booking_id;
  if departure_ids is not null then
    foreach departure_id in array departure_ids loop
      perform public.recalculate_trip_departure_inventory(departure_id);
    end loop;
  end if;
end $$;
revoke all on function public.admin_delete_unpaid_booking(uuid) from public,anon;
grant execute on function public.admin_delete_unpaid_booking(uuid) to authenticated;

commit;
