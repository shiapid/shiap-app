begin;

-- The generic verifier can be invoked before the expiry job updates order_status.
-- Recheck the Partner deadline before a verified receipt can commit. Evidence
-- submitted on time remains eligible during Admin review.
create function shiap_private.guard_stay_partner_payment_deadline() returns trigger
language plpgsql security definer set search_path = '' as $$
declare state text;
begin
  select f.status into state from public.stay_partner_fulfillment f where f.order_id=old.id;
  if not found then return new; end if;
  if state<>'AWAITING_PAYMENT' or not old.payment_enabled then
    raise exception 'Reservasi Partner belum siap menerima pembayaran.' using errcode='23514';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('shiap-calendar:stay',0)) then
    raise exception 'Inventori Stay sedang diperbarui. Coba verifikasi lagi.' using errcode='40001';
  end if;
  if (old.inventory_hold_expires_at is null or old.inventory_hold_expires_at<=clock_timestamp())
    and not exists (
      select 1 from public.booking_payment_records p where p.booking_id=old.id and p.status='approved'
        and p.submitted_at<=old.inventory_hold_expires_at
    ) then
    raise exception 'Hold Stay Partner kedaluwarsa. Tangani transfer atau refund melalui Finance.' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function shiap_private.guard_stay_partner_payment_deadline() from public,anon,authenticated;
create trigger stay_partner_payment_deadline before update of payment_status on public.booking_orders
for each row when (old.payment_status is distinct from new.payment_status and new.payment_status='paid')
execute function shiap_private.guard_stay_partner_payment_deadline();

commit;
