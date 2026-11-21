begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('finance-bank-evidence', 'finance-bank-evidence', false, 5242880, array['application/pdf','image/png','image/jpeg']);

create policy finance_bank_evidence_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'finance-bank-evidence' and public.is_shiap_admin()
  and owner_id = auth.uid()::text and split_part(name, '/', 1) = auth.uid()::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$'
);
create policy finance_bank_evidence_read on storage.objects for select to authenticated using (
  bucket_id = 'finance-bank-evidence' and public.is_shiap_admin()
);

create table shiap_private.verified_bank_transfers (
  id uuid primary key default gen_random_uuid(),
  account_fingerprint bytea not null,
  account_last_four text not null,
  bank_name text not null,
  source_transaction_id text collate "C" not null,
  bank_reference text,
  occurred_at timestamptz not null,
  amount_idr bigint not null check (amount_idr between 1 and 999999999999),
  currency text not null default 'IDR' check (currency = 'IDR'),
  evidence_path text not null unique,
  verified_by uuid not null,
  verified_at timestamptz not null default now(),
  unique (account_fingerprint, source_transaction_id)
);

create table shiap_private.bank_receipt_allocations (
  transfer_id uuid primary key references shiap_private.verified_bank_transfers(id) on delete restrict,
  booking_id uuid unique references public.booking_orders(id) on delete restrict,
  invoice_id uuid unique references public.places_billing_invoices(id) on delete restrict,
  proof_id uuid,
  allocated_at timestamptz not null default now(),
  actor_id uuid not null,
  check (num_nonnulls(booking_id, invoice_id) = 1)
);

create table shiap_private.bank_payment_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid unique,
  actor_id uuid not null,
  action text not null check (action in ('ALLOCATED','NEEDS_RECONCILIATION','RECONCILED','REVERSAL_REVIEW_REQUIRED')),
  transfer_id uuid references shiap_private.verified_bank_transfers(id) on delete restrict,
  target_kind text not null check (target_kind in ('booking','invoice')),
  target_id uuid not null,
  occurred_at timestamptz not null default now(),
  previous_state jsonb not null,
  new_state jsonb not null,
  reason text
);

alter table shiap_private.verified_bank_transfers enable row level security;
alter table shiap_private.bank_receipt_allocations enable row level security;
alter table shiap_private.bank_payment_audit enable row level security;
revoke all on shiap_private.verified_bank_transfers, shiap_private.bank_receipt_allocations, shiap_private.bank_payment_audit
from public, anon, authenticated, service_role;

alter table public.finance_transaction_entries add column bank_transfer_id uuid unique
  references shiap_private.bank_receipt_allocations(transfer_id) on delete restrict;
alter table public.places_platform_cash_entries add column bank_transfer_id uuid unique
  references shiap_private.bank_receipt_allocations(transfer_id) on delete restrict;

create function shiap_private.guard_bank_receipt() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  settlement record;
  target uuid;
  amount numeric;
begin
  if tg_table_name = 'finance_transaction_entries' then
    if new.entry_type <> 'payment' then
      if new.bank_transfer_id is not null then raise exception 'Bank receipt required.' using errcode='23514'; end if;
      return new;
    end if;
    target := new.booking_id;
    amount := new.amount;
    select a.transfer_id, b.amount_idr into settlement
    from shiap_private.bank_receipt_allocations a join shiap_private.verified_bank_transfers b on b.id=a.transfer_id
    where a.booking_id=target and a.actor_id=auth.uid();
  else
    if new.entry_type <> 'RECEIPT' then
      if new.bank_transfer_id is not null then raise exception 'Bank receipt required.' using errcode='23514'; end if;
      return new;
    end if;
    target := new.invoice_id;
    amount := new.amount_idr;
    select a.transfer_id, b.amount_idr into settlement
    from shiap_private.bank_receipt_allocations a join shiap_private.verified_bank_transfers b on b.id=a.transfer_id
    where a.invoice_id=target and a.actor_id=auth.uid();
  end if;
  if not found or settlement.amount_idr is distinct from amount
    or (new.bank_transfer_id is not null and new.bank_transfer_id is distinct from settlement.transfer_id) then
    raise exception 'Gunakan verifikasi mutasi bank Finance sebelum mencatat penerimaan.' using errcode='23514';
  end if;
  new.bank_transfer_id := settlement.transfer_id;
  return new;
end $$;

create trigger finance_require_verified_bank before insert on public.finance_transaction_entries
for each row execute function shiap_private.guard_bank_receipt();
create trigger places_require_verified_bank before insert on public.places_platform_cash_entries
for each row execute function shiap_private.guard_bank_receipt();

create function shiap_private.guard_bank_paid() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'booking_orders' then
    if new.payment_status <> 'paid' then return new; end if;
    if tg_op = 'UPDATE' and old.payment_status = 'paid' then return new; end if;
    if not exists (select 1 from public.finance_transaction_entries f
      where f.booking_id=new.id and f.bank_transfer_id is not null
        and f.entry_type='payment' and f.status='posted' and f.amount=new.total_amount) then
      raise exception 'Booking Paid memerlukan penerimaan bank teralokasi.' using errcode='23514';
    end if;
  else
    if new.status <> 'SETTLED' then return new; end if;
    if tg_op = 'UPDATE' and old.status = 'SETTLED' then return new; end if;
    if not exists (select 1 from public.places_platform_cash_entries f
      where f.invoice_id=new.id and f.bank_transfer_id is not null
        and f.entry_type='RECEIPT' and f.amount_idr=new.amount_idr) then
      raise exception 'Invoice lunas memerlukan penerimaan bank teralokasi.' using errcode='23514';
    end if;
  end if;
  return new;
end $$;

create trigger finance_require_bank_for_paid before insert or update of payment_status on public.booking_orders
for each row execute function shiap_private.guard_bank_paid();
create trigger places_require_bank_for_settlement before insert or update of status, payment_status on public.places_billing_invoices
for each row execute function shiap_private.guard_bank_paid();

-- Bank account digits are stable across changes to the configured bank display name.
-- An identical account number and transaction ID at a different bank is a conservative
-- conflict requiring Finance review, not an excuse to allocate the same deposit twice.
create function shiap_private.bank_account_key(p_account text) returns bytea
language sql immutable strict set search_path = '' as $$
  select extensions.digest(regexp_replace(p_account, '[^0-9]', '', 'g'), 'sha256')
$$;

create function public.finance_verify_bank_transfer(
  p_kind text, p_target uuid, p_proof uuid, p_amount bigint, p_source_id text,
  p_reference text, p_occurred_at timestamptz, p_evidence text, p_note text, p_request uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  source_id text := nullif(btrim(p_source_id), '');
  reference text := nullif(btrim(p_reference), '');
  note text := nullif(btrim(p_note), '');
  bank public.payment_settings%rowtype;
  account_key bytea;
  transfer shiap_private.verified_bank_transfers%rowtype;
  allocation shiap_private.bank_receipt_allocations%rowtype;
  previous_request shiap_private.bank_payment_audit%rowtype;
  booking public.booking_orders%rowtype;
  invoice public.places_billing_invoices%rowtype;
  before_state text;
  receipt_id uuid;
  snapshot_bank text;
begin
  if actor is null or not public.is_shiap_admin() then
    raise exception 'Akses Finance Admin diperlukan.' using errcode='42501';
  end if;
  if p_kind is null or p_kind not in ('booking','invoice') or p_target is null or p_request is null
      or p_amount is null or p_amount not between 1 and 999999999999
      or p_occurred_at is null or not isfinite(p_occurred_at) or p_occurred_at > clock_timestamp()
      or length(reference) > 160 or length(note) > 2000
      or (source_id is not null and (length(source_id) not between 3 and 160 or source_id ~ '[[:cntrl:]]'))
      or (p_kind='invoice' and (p_proof is null or coalesce(length(note), 0)<10))
      or (source_id is null and coalesce(length(note), 0)<10) then
    raise exception 'Periksa nominal, waktu bank, ID mutasi, dan catatan verifikasi.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('bank-payment-request:' || p_request::text, 0));
  select * into previous_request from shiap_private.bank_payment_audit where request_id=p_request;
  if found then
    if previous_request.actor_id is distinct from actor or previous_request.target_kind is distinct from p_kind
      or previous_request.target_id is distinct from p_target
      or previous_request.new_state->'request' is distinct from jsonb_build_array(p_proof,p_amount,source_id,reference,p_occurred_at,p_evidence,note) then
      raise exception 'Permintaan verifikasi sudah dipakai untuk keputusan berbeda.' using errcode='PT409';
    end if;
    return jsonb_build_object('status', previous_request.action, 'transfer_id', previous_request.transfer_id);
  end if;

  select * into bank from public.payment_settings where id and is_active for share;
  if not found or length(regexp_replace(bank.account_number,'[^0-9]','','g')) < 4 or btrim(bank.bank_name) = '' then
    raise exception 'Rekening penerima resmi belum tersedia.' using errcode='22023';
  end if;
  account_key := shiap_private.bank_account_key(bank.account_number);
  if p_evidence is null or not exists (
    select 1 from storage.objects o where o.bucket_id='finance-bank-evidence'
      and o.name=p_evidence and o.owner_id=actor::text and o.name=actor::text||'/'||p_request::text
  ) then
    raise exception 'Unggah bukti mutasi resmi dari rekening penerima SHIAP.' using errcode='22023';
  end if;

  if p_kind='booking' then
    select * into booking from public.booking_orders where id=p_target;
    if not found then raise exception 'Booking tidak ditemukan.' using errcode='P0002'; end if;
    before_state := booking.payment_status;
  else
    select * into invoice from public.places_billing_invoices where id=p_target;
    if not found then raise exception 'Invoice tidak ditemukan.' using errcode='P0002'; end if;
    before_state := invoice.payment_status;
    snapshot_bank := invoice.bank_snapshot->>'account_number';
    if shiap_private.bank_account_key(snapshot_bank) is distinct from account_key
      or lower(btrim(invoice.bank_snapshot->>'bank_name')) is distinct from lower(btrim(bank.bank_name)) then
      raise exception 'Rekening invoice berbeda dari konfigurasi saat ini. Rekonsiliasi manual diperlukan.' using errcode='PT409';
    end if;
  end if;

  if source_id is null then
    insert into shiap_private.bank_payment_audit
      (request_id,actor_id,action,target_kind,target_id,previous_state,new_state,reason)
    values (p_request,actor,'NEEDS_RECONCILIATION',p_kind,p_target,jsonb_build_object('payment_status',before_state),
      jsonb_build_object('payment_status',before_state,'account_last_four',right(regexp_replace(bank.account_number,'[^0-9]','','g'),4),
        'bank',bank.bank_name,'request',jsonb_build_array(p_proof,p_amount,source_id,reference,p_occurred_at,p_evidence,note)),note);
    return jsonb_build_object('status','NEEDS_RECONCILIATION');
  end if;

  insert into shiap_private.verified_bank_transfers
    (account_fingerprint,account_last_four,bank_name,source_transaction_id,bank_reference,occurred_at,amount_idr,evidence_path,verified_by)
  values (account_key,right(regexp_replace(bank.account_number,'[^0-9]','','g'),4),bank.bank_name,source_id,reference,p_occurred_at,p_amount,p_evidence,actor)
  on conflict (account_fingerprint,source_transaction_id) do nothing;

  select * into strict transfer from shiap_private.verified_bank_transfers
    where account_fingerprint=account_key and source_transaction_id=source_id for update;
  if transfer.amount_idr is distinct from p_amount or transfer.occurred_at is distinct from p_occurred_at
    or lower(btrim(transfer.bank_name)) is distinct from lower(btrim(bank.bank_name)) then
    raise exception 'Identitas mutasi bertentangan dengan data bank yang sudah tercatat.' using errcode='PT409';
  end if;

  select * into allocation from shiap_private.bank_receipt_allocations where transfer_id=transfer.id;
  if found then
    if (case when p_kind='booking' then allocation.booking_id else allocation.invoice_id end) is distinct from p_target
        or allocation.proof_id is distinct from p_proof then
      raise exception 'Mutasi bank ini sudah dialokasikan.' using errcode='PT409';
    end if;
    return jsonb_build_object('status','ALLOCATED','transfer_id',transfer.id);
  end if;

  insert into shiap_private.bank_receipt_allocations (transfer_id,booking_id,invoice_id,proof_id,actor_id)
  values (transfer.id,case when p_kind='booking' then p_target end,case when p_kind='invoice' then p_target end,p_proof,actor);

  if p_kind='invoice' then
    -- Internal token prevents the old global free-text uniqueness rule from
    -- treating two independently identified bank lines as the same receipt.
    perform public.admin_review_places_invoice(p_target,p_proof,true,p_amount,'BANK:'||transfer.id,note,true,p_request);
    select id into strict receipt_id from public.places_platform_cash_entries where bank_transfer_id=transfer.id;
  elsif p_proof is not null then
    if not exists (select 1 from public.booking_payment_records where id=p_proof and booking_id=p_target) then
      raise exception 'Bukti bukan milik booking tersebut.' using errcode='22023';
    end if;
    perform public.admin_review_booking_payment_full_amount(p_proof,'approved',p_amount,'BANK:'||transfer.id,null);
    select id into strict receipt_id from public.finance_transaction_entries where bank_transfer_id=transfer.id;
  else
    perform public.admin_mark_booking_paid_full_amount(p_target,p_amount,'BANK:'||transfer.id,note);
    select id into strict receipt_id from public.finance_transaction_entries where bank_transfer_id=transfer.id;
  end if;

  insert into shiap_private.bank_payment_audit
    (request_id,actor_id,action,transfer_id,target_kind,target_id,previous_state,new_state,reason)
  values (p_request,actor,'ALLOCATED',transfer.id,p_kind,p_target,jsonb_build_object('payment_status',before_state),
    jsonb_build_object('payment_status',case when p_kind='invoice' then 'PAID' else 'paid' end,'receipt_id',receipt_id,
      'request',jsonb_build_array(p_proof,p_amount,source_id,reference,p_occurred_at,p_evidence,note)),note);
  return jsonb_build_object('status','ALLOCATED','transfer_id',transfer.id);
end $$;

-- A reversed receipt never frees its deposit for an unrelated target.
create function public.finance_reconcile_bank_payment(
  p_kind text, p_target uuid, p_action text, p_reason text, p_request uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  allocation shiap_private.bank_receipt_allocations%rowtype;
  booking public.booking_orders%rowtype;
  prior shiap_private.bank_payment_audit%rowtype;
  reason text := btrim(p_reason);
begin
  if actor is null or not public.is_shiap_admin() then
    raise exception 'Akses Finance Admin diperlukan.' using errcode='42501';
  end if;
  if p_kind is null or p_kind not in ('booking','invoice') or p_target is null
    or p_action is null or p_action not in ('review_reversal','record_review')
    or p_request is null or reason is null or length(reason) not between 10 and 2000 then
    raise exception 'Catat hasil dan alasan rekonsiliasi Finance.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('bank-payment-request:' || p_request::text, 0));
  select * into prior from shiap_private.bank_payment_audit where request_id=p_request;
  if found then
    if prior.actor_id=actor and prior.target_kind=p_kind and prior.target_id=p_target
      and prior.reason=reason and prior.new_state->>'decision'=p_action then return; end if;
    raise exception 'Permintaan rekonsiliasi bertentangan.' using errcode='PT409';
  end if;

  select * into allocation from shiap_private.bank_receipt_allocations
  where (p_kind='booking' and booking_id=p_target) or (p_kind='invoice' and invoice_id=p_target) for update;
  if allocation.transfer_id is null and not exists (
    select 1 from shiap_private.bank_payment_audit a
    where a.target_kind=p_kind and a.target_id=p_target and a.action='NEEDS_RECONCILIATION'
    union all
    select 1 from public.finance_transaction_entries f
    where p_kind='booking' and f.booking_id=p_target and f.entry_type='payment'
    union all
    select 1 from public.places_platform_cash_entries f
    where p_kind='invoice' and f.invoice_id=p_target and f.entry_type='RECEIPT'
    union all
    select 1 from public.booking_orders b where p_kind='booking' and b.id=p_target and b.payment_status='paid'
    union all
    select 1 from public.places_billing_invoices i where p_kind='invoice' and i.id=p_target and i.status='SETTLED'
  ) then raise exception 'Tidak ada penerimaan atau kasus bank untuk ditinjau.' using errcode='P0002'; end if;

  -- Never infer a refund or invalidate fulfilled entitlements from a bank report.
  -- The review record keeps both historical evidence and the allocation intact.
  if p_action='review_reversal' and p_kind='booking' and allocation.transfer_id is not null then
    select * into booking from public.booking_orders where id=p_target for update;
    if booking.order_status='pending_confirmation' and booking.payment_status='paid'
      and not exists (select 1 from public.booking_tickets t where t.booking_id=p_target and t.status='checked_in')
      and not exists (select 1 from public.finance_transaction_entries f
        where f.booking_id=p_target and f.entry_type='refund' and f.status='posted') then
      update public.finance_transaction_entries set status='reversed',reversed_at=now(),reversed_by=actor
      where bank_transfer_id=allocation.transfer_id and status='posted';
      if not found then raise exception 'Penerimaan aktif tidak ditemukan.' using errcode='PT409'; end if;
      update public.booking_orders set payment_status='unpaid',order_status='cancelled',payment_enabled=false
      where id=p_target;
      insert into shiap_private.bank_payment_audit
        (request_id,actor_id,action,transfer_id,target_kind,target_id,previous_state,new_state,reason)
      values(p_request,actor,'RECONCILED',allocation.transfer_id,p_kind,p_target,
        jsonb_build_object('payment_status','paid','order_status',booking.order_status,'receipt_status','posted'),
        jsonb_build_object('decision',p_action,'payment_status','unpaid','order_status','cancelled','receipt_status','reversed'),reason);
      return;
    end if;
  end if;
  insert into shiap_private.bank_payment_audit
    (request_id,actor_id,action,transfer_id,target_kind,target_id,previous_state,new_state,reason)
  values(p_request,actor,case when p_action='review_reversal' then 'REVERSAL_REVIEW_REQUIRED' else 'RECONCILED' end,
    allocation.transfer_id,p_kind,p_target,jsonb_build_object('allocation_retained',allocation.transfer_id is not null),
    jsonb_build_object('decision',p_action,'financial_change',false),reason);
end $$;

create function public.finance_bank_reconciliation(p_limit integer default 100)
returns table (target_kind text,target_id uuid,status text,observed_at timestamptz,case_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_shiap_admin() then
    raise exception 'Akses Finance Admin diperlukan.' using errcode='42501';
  end if;
  return query
  select q.kind,q.target,q.state,q.at,q.event_id from (
    select 'booking'::text kind, b.id target, 'HISTORICAL_UNMATCHED'::text state, b.created_at at, null::uuid event_id
    from public.booking_orders b where (b.payment_status='paid' or exists (
      select 1 from public.finance_transaction_entries f where f.booking_id=b.id and f.entry_type='payment'
    )) and not exists (select 1 from shiap_private.bank_receipt_allocations a where a.booking_id=b.id)
    union all
    select 'invoice',i.id,'HISTORICAL_UNMATCHED',coalesce(i.settled_at,i.created_at),null::uuid
    from public.places_billing_invoices i where i.status='SETTLED'
      and not exists (select 1 from shiap_private.bank_receipt_allocations a where a.invoice_id=i.id)
    union all
    select a.target_kind,a.target_id,a.action,a.occurred_at,a.id
    from shiap_private.bank_payment_audit a where a.action <> 'ALLOCATED'
  ) q order by q.at desc, q.target limit greatest(1,least(coalesce(p_limit,100),500));
end $$;

revoke all on function shiap_private.guard_bank_receipt(), shiap_private.guard_bank_paid(), shiap_private.bank_account_key(text)
from public, anon, authenticated, service_role;
revoke all on function public.finance_verify_bank_transfer(text,uuid,uuid,bigint,text,text,timestamptz,text,text,uuid),
  public.finance_reconcile_bank_payment(text,uuid,text,text,uuid), public.finance_bank_reconciliation(integer)
from public, anon, authenticated, service_role;
grant execute on function public.finance_verify_bank_transfer(text,uuid,uuid,bigint,text,text,timestamptz,text,text,uuid),
  public.finance_reconcile_bank_payment(text,uuid,text,text,uuid), public.finance_bank_reconciliation(integer) to authenticated;

commit;
