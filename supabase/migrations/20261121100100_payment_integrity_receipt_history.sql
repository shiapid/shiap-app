begin;

create function shiap_private.guard_bank_receipt_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='DELETE' then
    if old.bank_transfer_id is not null then
      raise exception 'Riwayat penerimaan bank tidak boleh dihapus.' using errcode='23514';
    end if;
    return old;
  end if;

  if new.bank_transfer_id is distinct from old.bank_transfer_id
    or new.entry_type is distinct from old.entry_type then
    raise exception 'Identitas penerimaan bank tidak boleh diubah.' using errcode='23514';
  end if;
  if old.bank_transfer_id is null then return new; end if;

  if tg_table_name='places_platform_cash_entries' then
    raise exception 'Gunakan penyesuaian Finance untuk invoice yang sudah tercatat.' using errcode='23514';
  end if;
  if new.booking_id is distinct from old.booking_id or new.amount is distinct from old.amount
    or new.source_type is distinct from old.source_type or new.source_id is distinct from old.source_id
    or new.idempotency_key is distinct from old.idempotency_key or new.external_reference is distinct from old.external_reference
    or new.actor_user_id is distinct from old.actor_user_id or new.note is distinct from old.note
    or new.status <> 'reversed' or old.status <> 'posted' or new.reversed_by is distinct from auth.uid()
    or new.reversed_at is null or not public.is_shiap_admin() then
    raise exception 'Penerimaan bank hanya dapat dikoreksi melalui rekonsiliasi Finance.' using errcode='23514';
  end if;
  return new;
end $$;

-- SQL clients use the authorized function; Data API roles cannot rewrite ledger rows.
revoke update, delete on public.finance_transaction_entries from anon, authenticated, service_role;
revoke update, delete on public.places_platform_cash_entries from anon, authenticated, service_role;

create trigger finance_preserve_bank_receipt before update or delete on public.finance_transaction_entries
for each row execute function shiap_private.guard_bank_receipt_history();
create trigger places_preserve_bank_receipt before update or delete on public.places_platform_cash_entries
for each row execute function shiap_private.guard_bank_receipt_history();
revoke all on function shiap_private.guard_bank_receipt_history() from public, anon, authenticated, service_role;

commit;
