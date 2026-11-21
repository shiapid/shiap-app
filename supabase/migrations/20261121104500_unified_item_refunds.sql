begin;

alter table shiap_private.unified_order_items
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references auth.users(id) on delete restrict,
  add column cancellation_reason text,
  add constraint unified_item_cancellation_audit check (
    (cancelled_at is null and cancelled_by is null and cancellation_reason is null)
    or (cancelled_at is not null and cancelled_by is not null and length(btrim(cancellation_reason)) between 10 and 500)
  );

create table shiap_private.unified_item_refunds (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references shiap_private.unified_order_items(item_id) on delete restrict,
  booking_id uuid not null references shiap_private.unified_orders(booking_id) on delete restrict,
  service text not null check(service in ('stay','trip','experience')),
  vendor_id uuid not null,
  original_idr bigint not null,
  eligible_idr bigint not null,
  requested_idr bigint not null,
  approved_idr bigint,
  paid_idr bigint not null default 0,
  reason text not null check(length(btrim(reason)) between 10 and 500),
  policy_snapshot jsonb not null,
  status text not null default 'REQUESTED' check(status in ('REQUESTED','UNDER_REVIEW','APPROVED','REJECTED','PENDING_PAYMENT','PAID','FAILED')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default clock_timestamp(),
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  reconcile_required boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  check (requested_idr between 1 and eligible_idr and eligible_idr<=original_idr),
  check (approved_idr is null or approved_idr between 1 and requested_idr),
  check ((status in ('APPROVED','PENDING_PAYMENT','PAID','FAILED')) =
    (approved_idr is not null and approved_by is not null and approved_at is not null)),
  check ((status='PAID' and paid_idr=approved_idr) or (status<>'PAID' and paid_idr=0))
);

create table shiap_private.unified_refund_payouts (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null unique references shiap_private.unified_item_refunds(id) on delete restrict,
  incoming_transfer_id uuid not null references shiap_private.bank_receipt_allocations(transfer_id) on delete restrict,
  source_account_key bytea not null,
  source_transaction_id text collate "C" not null check(length(source_transaction_id) between 3 and 160),
  display_reference text check(length(display_reference)<=160),
  occurred_at timestamptz not null,
  amount_idr bigint not null check (amount_idr>0),
  evidence_path text not null unique,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp(),
  unique (source_account_key,source_transaction_id)
);

create table shiap_private.unified_refund_actions (
  request_key uuid primary key,
  booking_id uuid not null references shiap_private.unified_orders(booking_id) on delete restrict,
  item_id uuid not null references shiap_private.unified_order_items(item_id) on delete restrict,
  refund_id uuid references shiap_private.unified_item_refunds(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  input jsonb not null,
  old_status text,
  new_status text,
  occurred_at timestamptz not null default clock_timestamp()
);
create index unified_refunds_item_status_idx on shiap_private.unified_item_refunds(item_id,status);
create index unified_refunds_order_idx on shiap_private.unified_item_refunds(booking_id);
create index unified_refund_actions_history_idx on shiap_private.unified_refund_actions(item_id,occurred_at desc);

alter table shiap_private.unified_item_refunds enable row level security;
alter table shiap_private.unified_refund_payouts enable row level security;
alter table shiap_private.unified_refund_actions enable row level security;
revoke all on shiap_private.unified_item_refunds,shiap_private.unified_refund_payouts,shiap_private.unified_refund_actions
from public,anon,authenticated,service_role;

alter table public.finance_transaction_entries
  add column unified_refund_payout_id uuid unique references shiap_private.unified_refund_payouts(id) on delete restrict,
  add constraint unified_refund_type_check check (unified_refund_payout_id is null or (entry_type='refund' and status='posted'));

create function shiap_private.unified_refund_reserved(p_item uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when r.status='PAID' then r.paid_idr when r.status in
    ('APPROVED','PENDING_PAYMENT','FAILED') then r.approved_idr else r.requested_idr end),0)::bigint
  from shiap_private.unified_item_refunds r where r.item_id=p_item and r.status<>'REJECTED'
$$;

create or replace function shiap_private.guard_unified_cash_receipt() returns trigger
language plpgsql security definer set search_path = '' as $$
declare reason text;
begin
  if not exists(select 1 from shiap_private.unified_orders where booking_id=new.booking_id) then
    if new.unified_refund_payout_id is not null then raise exception 'Alokasi refund tidak cocok.' using errcode='23514'; end if;
    return new;
  end if;

  if new.entry_type='discount' or (new.entry_type='refund' and not exists(
    select 1 from shiap_private.unified_refund_payouts p
    join shiap_private.unified_item_refunds r on r.id=p.refund_id
    join shiap_private.unified_order_items i on i.item_id=r.item_id
    join public.booking_orders b on b.id=r.booking_id
    join public.finance_transaction_entries paid on paid.booking_id=b.id and paid.bank_transfer_id=p.incoming_transfer_id
      and paid.entry_type='payment' and paid.status='posted' and paid.amount=b.total_amount
    where p.id=new.unified_refund_payout_id and r.booking_id=new.booking_id and i.booking_id=r.booking_id
      and b.payment_status='paid' and r.status='PENDING_PAYMENT'
      and new.amount=p.amount_idr and p.amount_idr=r.approved_idr
      and p.recorded_by=auth.uid() and new.actor_user_id=p.recorded_by
      and shiap_private.unified_refund_reserved(i.item_id)<=i.subtotal_idr-i.discount_idr
  )) then
    raise exception 'Refund pesanan gabungan memerlukan alokasi dan bukti transfer per layanan.' using errcode='23514';
  end if;
  if new.entry_type='payment' then
    reason:=shiap_private.unified_payment_error(new.booking_id,new.source_type='booking_payment_proof');
    if reason is not null then raise exception '%',reason using errcode='23514'; end if;
  end if;
  return new;
end $$;

create function shiap_private.protect_unified_refund_ledger() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.unified_refund_payout_id is not null then
    raise exception 'Pencatatan refund per layanan bersifat tetap. Gunakan tinjauan rekonsiliasi.' using errcode='23514';
  end if;
  if tg_op='UPDATE' then
    if new.unified_refund_payout_id is not null then raise exception 'Histori ledger tidak dapat dialokasikan ulang.' using errcode='23514'; end if;
    return new;
  end if;
  return old;
end $$;
create trigger aa_protect_unified_refund_ledger before update or delete on public.finance_transaction_entries
for each row execute function shiap_private.protect_unified_refund_ledger();
revoke all on function shiap_private.unified_refund_reserved(uuid),shiap_private.protect_unified_refund_ledger()
from public,anon,authenticated,service_role;

-- Restoring the original transfer while an item refund is owed or paid would
-- orphan the refund liability or duplicate a return of funds.
create function shiap_private.guard_unified_refund_parent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.payment_status='paid' and new.payment_status<>'paid' and (
    exists(select 1 from shiap_private.unified_item_refunds r where r.booking_id=old.id and r.status<>'REJECTED')
    or exists(select 1 from shiap_private.unified_order_items i where i.booking_id=old.id and i.cancelled_at is not null)
  ) then raise exception 'Tinjau alokasi refund sebelum membalikkan pembayaran asli.' using errcode='23514'; end if;
  return new;
end $$;
create trigger aaa_unified_refund_parent before update of payment_status on public.booking_orders
for each row execute function shiap_private.guard_unified_refund_parent();
revoke all on function shiap_private.guard_unified_refund_parent() from public,anon,authenticated,service_role;

create or replace function shiap_private.unified_all_fulfilled(p_booking uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) between 2 and 3 and count(*)=(select count(*) from public.booking_items where booking_id=p_booking)
    and bool_or(s.cancelled_at is null)
    and bool_and(not s.review_open and case
      when s.cancelled_at is not null then not exists(select 1 from shiap_private.unified_item_refunds r
        where r.item_id=s.item_id and (r.status not in ('PAID','REJECTED') or r.reconcile_required))
      when s.service='stay' then coalesce(f.status='COMPLETED' and not f.operational_hold,false)
      else s.fulfillment='COMPLETED' end)
  from shiap_private.unified_order_items s left join public.stay_partner_fulfillment f on f.item_id=s.item_id
  where s.booking_id=p_booking
$$;

create function shiap_private.unified_cancel_item(p_item uuid,p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s shiap_private.unified_order_items%rowtype;
  i public.booking_items%rowtype;
  f public.stay_partner_fulfillment%rowtype;
  starts timestamptz;
  session_id uuid;
begin
  -- The public operator procedure already holds parent and allocation locks.
  select * into strict s from shiap_private.unified_order_items where item_id=p_item for update;
  if s.cancelled_at is not null then return; end if;
  select * into strict i from public.booking_items where id=p_item for update;
  if s.fulfillment='COMPLETED' then raise exception 'Layanan yang sudah selesai memerlukan koreksi operasional.' using errcode='23514'; end if;
  perform 1 from public.booking_tickets where booking_item_id=p_item for update;
  if exists(select 1 from public.booking_tickets where booking_item_id=p_item and status='checked_in') then
    raise exception 'Voucher yang sudah digunakan tidak dapat dibatalkan melalui alur ini.' using errcode='23514';
  end if;
  if s.service='stay' then
    if not pg_try_advisory_xact_lock(hashtextextended('shiap-calendar:stay',0)) then
      raise exception 'Inventori Stay sedang diperbarui.' using errcode='40001';
    end if;
    select * into strict f from public.stay_partner_fulfillment where item_id=p_item for update;
    if f.status not in ('AWAITING_PAYMENT','CONFIRMED') then
      raise exception 'Stay sudah dipenuhi atau belum dapat dibatalkan.' using errcode='23514';
    end if;
    starts:=f.check_in_at;
  elsif s.service='trip' then
    select (d.departure_date+coalesce(d.departure_time,time '00:00')) at time zone 'Asia/Makassar'
      into starts from public.trip_departures d where d.id=i.departure_id for update nowait;
  else
    select e.session_id into session_id from public.shiap_experience_booking_records e where e.booking_item_id=p_item for update;
    if session_id is null then starts:=i.date_start::timestamp at time zone 'Asia/Makassar';
    else select v.starts_at into starts from public.shiap_experience_sessions v where v.id=session_id for update nowait; end if;
  end if;
  if starts is null or starts<=clock_timestamp() then
    raise exception 'Batas pembatalan sebelum layanan dimulai sudah lewat. Catat kasus untuk tinjauan Finance.' using errcode='23514';
  end if;

  update shiap_private.unified_order_items set cancelled_at=clock_timestamp(),cancelled_by=auth.uid(),cancellation_reason=p_reason
  where item_id=s.item_id;
  update public.booking_tickets set status='revoked' where booking_item_id=s.item_id and status='issued';
  if s.service='stay' then
    update public.stay_partner_fulfillment set status='CANCELLED',updated_at=clock_timestamp() where item_id=s.item_id;
  elsif s.service='trip' then
    perform public.recalculate_trip_departure_inventory(i.departure_id);
  end if;

  if not exists(select 1 from shiap_private.unified_order_items where booking_id=s.booking_id and cancelled_at is null) then
    update public.booking_orders set order_status='cancelled',payment_enabled=false where id=s.booking_id;
  else
    perform shiap_private.unified_complete_parent(s.booking_id);
  end if;
end $$;
revoke all on function shiap_private.unified_cancel_item(uuid,text) from public,anon,authenticated,service_role;

create function public.admin_manage_unified_refund(
  p_request uuid,p_action text,p_item uuid,p_refund uuid,p_input jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid:=auth.uid();
  b public.booking_orders%rowtype;
  s shiap_private.unified_order_items%rowtype;
  r shiap_private.unified_item_refunds%rowtype;
  previous shiap_private.unified_refund_actions%rowtype;
  bank shiap_private.verified_bank_transfers%rowtype;
  result uuid;
  payout uuid;
  status_before text;
  status_after text;
  reason text := nullif(btrim(p_input->>'reason'),'');
  cents_idr bigint;
  bank_id text := nullif(btrim(p_input->>'bank_id'),'');
  reference text := nullif(btrim(p_input->>'reference'),'');
  evidence text := p_input->>'evidence';
  bank_time timestamptz;
  event_kind text;
  original_idr bigint;
  refundable_idr bigint;
begin
  if actor is null or not public.is_shiap_admin() then raise exception 'Akses Finance Admin diperlukan.' using errcode='42501'; end if;
  if p_request is null or p_item is null or p_action is null
    or p_action not in ('request','review','approve','reject','queue','fail','pay','cancel_item','exception_open','exception_resolve')
    or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>8000
    or coalesce(length(reason),0) not between 10 and 500 then
    raise exception 'Periksa tindakan dan alasan Finance (10–500 karakter).' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('unified-refund-action:'||p_request::text,0));
  select * into previous from shiap_private.unified_refund_actions where request_key=p_request;
  if found then
    if previous.actor_id<>actor or previous.item_id<>p_item or previous.action<>p_action
      or previous.input is distinct from p_input
      or (p_action not in ('request','cancel_item') and previous.refund_id is distinct from p_refund) then
      raise exception 'Kunci permintaan sudah digunakan untuk keputusan berbeda.' using errcode='PT409';
    end if;
    return previous.refund_id;
  end if;

  select * into s from shiap_private.unified_order_items where item_id=p_item;
  if not found then raise exception 'Item pesanan gabungan tidak ditemukan.' using errcode='P0002'; end if;
  select * into strict b from public.booking_orders where id=s.booking_id for update;
  select * into strict s from shiap_private.unified_order_items where item_id=p_item for update;
  select v.* into bank from shiap_private.verified_bank_transfers v
  join shiap_private.bank_receipt_allocations a on a.transfer_id=v.id
  join public.finance_transaction_entries f on f.booking_id=b.id and f.bank_transfer_id=a.transfer_id
    and f.entry_type='payment' and f.status='posted' and f.amount=b.total_amount
  where a.booking_id=b.id;
  if b.payment_status<>'paid' or bank.id is null then
    raise exception 'Refund memerlukan pembayaran penuh yang sudah diverifikasi.' using errcode='23514';
  end if;

  if p_action in ('request','approve','pay') then
    if (p_input->>'amount') is null or (p_input->>'amount') !~ '^[1-9][0-9]{0,11}$' then
      raise exception 'Nominal refund harus berupa Rupiah bulat dan positif.' using errcode='22023';
    end if;
    cents_idr:=(p_input->>'amount')::bigint;
  end if;

  if p_action='request' then
    if p_refund is not null then raise exception 'Referensi refund belum diperlukan.' using errcode='22023'; end if;
    original_idr:=s.subtotal_idr-s.discount_idr+s.tax_idr+s.service_fee_idr;
    refundable_idr:=s.subtotal_idr-s.discount_idr;
    if cents_idr>refundable_idr-shiap_private.unified_refund_reserved(s.item_id) then
      raise exception 'Jumlah melebihi sisa alokasi refund layanan ini.' using errcode='23514';
    end if;
    insert into shiap_private.unified_item_refunds(item_id,booking_id,service,vendor_id,original_idr,eligible_idr,
      requested_idr,reason,policy_snapshot,requested_by)
    values(s.item_id,b.id,s.service,s.vendor_id,original_idr,refundable_idr,cents_idr,reason,
      jsonb_build_object('version',1,'service',s.service,'principal_cap',refundable_idr,'service_fee_refundable',false,
        'separate_tax_refundable',false,'discount_idr',s.discount_idr,'tax_idr',s.tax_idr,
        'service_fee_idr',s.service_fee_idr,'agreement_id',s.partner_agreement_id,
        'agreement_version',s.partner_agreement_version,'decision','MANUAL_FINANCE_REVIEW'),actor)
    returning id into result;
    status_after:='REQUESTED'; event_kind:='item_refund_requested';
  elsif p_action='cancel_item' then
    if p_refund is not null or s.cancelled_at is not null then raise exception 'Status pembatalan item sudah berubah.' using errcode='PT409'; end if;
    perform shiap_private.unified_cancel_item(s.item_id,reason);
    status_after:='CANCELLED'; event_kind:='booking_item_cancelled';
  else
    select * into r from shiap_private.unified_item_refunds where id=p_refund and item_id=s.item_id and booking_id=b.id for update;
    if not found then raise exception 'Refund tidak cocok dengan item layanan ini.' using errcode='P0002'; end if;
    result:=r.id;
    status_before:=r.status;
    status_after:=case
      when p_action='review' and r.status='REQUESTED' then 'UNDER_REVIEW'
      when p_action='approve' and r.status='UNDER_REVIEW' then 'APPROVED'
      when p_action='reject' and r.status in ('REQUESTED','UNDER_REVIEW') then 'REJECTED'
      when p_action='queue' and r.status in ('APPROVED','FAILED') then 'PENDING_PAYMENT'
      when p_action='fail' and r.status='PENDING_PAYMENT' then 'FAILED'
      when p_action='pay' and r.status='PENDING_PAYMENT' then 'PAID'
      when p_action='exception_open' and r.status in ('FAILED','PAID') and not r.reconcile_required then r.status
      when p_action='exception_resolve' and r.reconcile_required then r.status
    end;
    if status_after is null or (r.reconcile_required and p_action<>'exception_resolve') then
      raise exception 'Status atau tinjauan rekonsiliasi belum mengizinkan tindakan ini.' using errcode='PT409';
    end if;

    if p_action='approve' and (cents_idr>r.requested_idr or
      shiap_private.unified_refund_reserved(s.item_id)-r.requested_idr+cents_idr>r.eligible_idr) then
      raise exception 'Persetujuan melebihi permintaan atau saldo layanan.' using errcode='23514';
    end if;
    if p_action='pay' then
      bank_time:=nullif(p_input->>'occurred_at','')::timestamptz;
      if p_input->'confirmed' is distinct from 'true'::jsonb or bank_id is null or length(bank_id) not between 3 and 160
        or bank_id ~ '[[:cntrl:]]' or length(reference)>160 or bank_time is null or not isfinite(bank_time)
        or bank_time<r.approved_at or bank_time>clock_timestamp() or cents_idr<>r.approved_idr
        or evidence is distinct from actor::text||'/'||p_request::text
        or not exists(select 1 from storage.objects o where o.bucket_id='finance-bank-evidence' and o.name=evidence and o.owner_id=actor::text)
      then raise exception 'Periksa bukti mutasi keluar, ID transaksi, waktu, dan nominal sesuai persetujuan.' using errcode='22023'; end if;
      if not exists(select 1 from public.payment_settings where id and is_active and
        shiap_private.bank_account_key(account_number)=bank.account_fingerprint
        and lower(btrim(bank_name))=lower(btrim(bank.bank_name))) then
        raise exception 'Perubahan rekening sumber memerlukan rekonsiliasi Finance.' using errcode='PT409';
      end if;
      insert into shiap_private.unified_refund_payouts(refund_id,incoming_transfer_id,source_account_key,source_transaction_id,
        display_reference,occurred_at,amount_idr,evidence_path,recorded_by)
      values(r.id,bank.id,bank.account_fingerprint,bank_id,reference,bank_time,cents_idr,evidence,actor)
      returning id into payout;
      insert into public.finance_transaction_entries(booking_id,entry_type,amount,source_type,source_id,idempotency_key,
        external_reference,note,actor_user_id,unified_refund_payout_id)
      values(b.id,'refund',cents_idr,'admin',r.id::text,'unified-refund:'||r.id,'REFUND:'||payout,
        'Refund layanan gabungan diverifikasi terhadap mutasi bank keluar.',actor,payout);
    end if;

    update shiap_private.unified_item_refunds set status=status_after,
      approved_idr=case when p_action='approve' then cents_idr else approved_idr end,
      approved_by=case when p_action='approve' then actor else approved_by end,
      approved_at=case when p_action='approve' then clock_timestamp() else approved_at end,
      paid_idr=case when p_action='pay' then cents_idr else paid_idr end,
      reconcile_required=case when p_action='exception_open' then true when p_action='exception_resolve' then false else reconcile_required end,
      updated_at=clock_timestamp() where id=r.id;
    event_kind:=case p_action when 'approve' then 'item_refund_approved' when 'reject' then 'item_refund_rejected'
      when 'pay' then 'item_refund_paid' end;
  end if;

  insert into shiap_private.unified_refund_actions(request_key,booking_id,item_id,refund_id,actor_id,action,input,old_status,new_status)
    values(p_request,b.id,s.item_id,result,actor,p_action,p_input,status_before,status_after);
  if event_kind is not null then
    perform shiap_private.enqueue_notification(b.id,event_kind,'unified-refund:'||p_request,s.item_id);
    insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note)
    values(b.id,actor,'admin',event_kind,'Status layanan atau refund diperbarui. Lihat rincian pada pesanan.');
  end if;
  if p_action in ('reject','pay','exception_resolve') then perform shiap_private.unified_complete_parent(b.id); end if;
  return result;
end $$;

revoke all on function public.admin_manage_unified_refund(uuid,text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_manage_unified_refund(uuid,text,uuid,uuid,jsonb) to authenticated;

commit;
