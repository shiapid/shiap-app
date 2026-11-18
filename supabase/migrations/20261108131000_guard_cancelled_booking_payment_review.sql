begin;

create or replace function public.admin_review_booking_payment(
  p_payment_record_id uuid,p_decision text,p_rejection_reason text default null
)
returns void language plpgsql security definer set search_path=public,auth
as $$
declare admin_id uuid:=auth.uid(); booking uuid; old_state text; booking_state text;
begin
  if admin_id is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  if p_decision not in('approved','rejected') then raise exception 'Keputusan pembayaran tidak valid.'; end if;
  if p_decision='rejected' and length(trim(coalesce(p_rejection_reason,'')))<3 then raise exception 'Alasan penolakan minimal 3 karakter.'; end if;

  select booking_id,status into booking,old_state
    from public.booking_payment_records where id=p_payment_record_id for update;
  if not found then raise exception 'Bukti pembayaran tidak ditemukan.'; end if;
  if old_state<>'pending' then raise exception 'Bukti pembayaran sudah ditinjau.'; end if;
  select order_status into booking_state from public.booking_orders where id=booking for update;
  if not found then raise exception 'Booking tidak ditemukan.'; end if;
  if p_decision='approved' and booking_state not in('pending_confirmation','confirmed') then
    raise exception 'Pembayaran tidak dapat disetujui karena booking sudah dibatalkan atau kedaluwarsa.';
  end if;

  update public.booking_payment_records
     set status=p_decision,
         rejection_reason=case when p_decision='rejected' then trim(p_rejection_reason) else null end,
         reviewed_at=now(),reviewed_by=admin_id
   where id=p_payment_record_id;

  if p_decision='approved' then
    update public.booking_orders set payment_status='paid' where id=booking;
  elsif not exists(select 1 from public.booking_payment_records where booking_id=booking and id<>p_payment_record_id and status='pending') then
    update public.booking_orders set payment_status='unpaid' where id=booking and payment_status='pending';
    perform public.expire_booking_holds();
  end if;

  insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note)
  values(booking,admin_id,'admin','payment_'||p_decision,
         case when p_decision='rejected' then trim(p_rejection_reason) else 'Bukti pembayaran disetujui.' end);
end $$;
revoke all on function public.admin_review_booking_payment(uuid,text,text) from public,anon;
grant execute on function public.admin_review_booking_payment(uuid,text,text) to authenticated;

commit;
