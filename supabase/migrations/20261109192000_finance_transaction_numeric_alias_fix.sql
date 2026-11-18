-- Qualify ledger columns because the argument `p_amount` is normalized into a local amount variable.
create or replace function public.finance_record_transaction(
  p_booking_id uuid,p_entry_type text,p_amount numeric,p_idempotency_key text,
  p_note text default null,p_external_reference text default null
)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare admin_id uuid:=auth.uid(); order_row public.booking_orders%rowtype;
  entry_id uuid; existing public.finance_transaction_entries%rowtype; paid numeric; refunded numeric; amount numeric:=round(p_amount,2);
begin
  if admin_id is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  if p_entry_type not in('payment','refund','processing_fee','discount') then raise exception 'Jenis transaksi tidak valid.'; end if;
  if amount is null or amount<=0 or amount>999999999999.99 then raise exception 'Nominal transaksi tidak valid.'; end if;
  if length(trim(coalesce(p_idempotency_key,'')))<8 or length(p_idempotency_key)>180 then raise exception 'Kunci idempotensi tidak valid.'; end if;
  select * into order_row from public.booking_orders b where b.id=p_booking_id for update;
  if not found then raise exception 'Booking tidak ditemukan.'; end if;
  select * into existing from public.finance_transaction_entries e where e.idempotency_key=p_idempotency_key;
  if found then
    if existing.booking_id<>p_booking_id or existing.entry_type<>p_entry_type or existing.amount<>amount then
      raise exception 'Kunci idempotensi sudah digunakan untuk nominal atau transaksi berbeda.';
    end if;
    return existing.id;
  end if;
  select coalesce(sum(e.amount),0) into paid from public.finance_transaction_entries e
    where e.booking_id=p_booking_id and e.entry_type='payment' and e.status='posted';
  select coalesce(sum(e.amount),0) into refunded from public.finance_transaction_entries e
    where e.booking_id=p_booking_id and e.entry_type='refund' and e.status='posted';
  if p_entry_type='payment' and amount>greatest(order_row.total_amount-paid,0) then raise exception 'Pembayaran melebihi sisa tagihan booking.'; end if;
  if p_entry_type='refund' and amount>greatest(paid-refunded,0) then raise exception 'Refund melebihi pembayaran bersih yang tercatat.'; end if;
  if p_entry_type='payment' and order_row.order_status in('cancelled','rejected','expired') then raise exception 'Booking tidak aktif tidak dapat menerima pembayaran baru.'; end if;
  insert into public.finance_transaction_entries(booking_id,entry_type,amount,source_type,source_id,idempotency_key,external_reference,note,actor_user_id)
  values(p_booking_id,p_entry_type,amount,'admin',p_idempotency_key,p_idempotency_key,nullif(trim(p_external_reference),''),nullif(trim(p_note),''),admin_id)
  returning id into entry_id;
  if p_entry_type='payment' then
    if paid+amount>=order_row.total_amount then update public.booking_orders set payment_status='paid' where id=p_booking_id;
    else update public.booking_orders set payment_status='pending' where id=p_booking_id; end if;
  end if;
  insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note)
  values(p_booking_id,admin_id,'admin','finance_'||p_entry_type,coalesce(nullif(trim(p_note),''),'Entri keuangan admin dicatat.'));
  return entry_id;
end $$;
