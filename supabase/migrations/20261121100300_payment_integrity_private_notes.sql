begin;

-- Booking events are customer-readable. Keep Finance notes and canonical
-- references in the private bank audit and Finance receipt.
create function shiap_private.hide_bank_details_from_booking_events() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.note := 'Pembayaran penuh telah diverifikasi melalui mutasi rekening resmi SHIAP.';
  return new;
end $$;

create trigger booking_events_public_payment_note before insert on public.booking_order_events
for each row when (new.event_type in ('finance_payment','payment_approved','payment_received_manually'))
execute function shiap_private.hide_bank_details_from_booking_events();
revoke all on function shiap_private.hide_bank_details_from_booking_events() from public, anon, authenticated, service_role;

commit;
