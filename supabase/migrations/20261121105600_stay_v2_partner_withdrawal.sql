begin;

create table shiap_private.stay_payout_control (
  id boolean primary key default true check (id),
  enabled boolean not null default false
);
insert into shiap_private.stay_payout_control default values;

create table shiap_private.stay_payout_operators (
  user_id uuid primary key references public.admin_users(user_id) on delete cascade
);

create table shiap_private.stay_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  places_id uuid not null references public.places_properties(id) on delete restrict,
  bank_name text not null,
  fingerprint bytea not null,
  last4 text not null check (last4 ~ '^[0-9]{4}$'),
  evidence_path text not null unique,
  verified_by uuid not null,
  verified_at timestamptz not null default clock_timestamp(),
  retired_at timestamptz
);
create unique index stay_payout_account_current_idx
  on shiap_private.stay_payout_accounts(places_id) where retired_at is null;

create table shiap_private.stay_withdrawals (
  id uuid primary key,
  item_id uuid not null references shiap_private.unified_order_items(item_id) on delete restrict,
  account_id uuid not null references shiap_private.stay_payout_accounts(id) on delete restrict,
  requested_by uuid not null,
  amount_idr bigint not null check (amount_idr between 1 and 999999999999),
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','PROCESSING','PAID','REJECTED','FAILED')),
  created_at timestamptz not null default clock_timestamp(),
  processing_at timestamptz,
  check ((status in ('PROCESSING','PAID','FAILED')) = (processing_at is not null))
);
create index stay_withdrawals_item_status_idx on shiap_private.stay_withdrawals(item_id,status);

create table shiap_private.stay_withdrawal_transfers (
  withdrawal_id uuid primary key references shiap_private.stay_withdrawals(id) on delete restrict,
  source_fingerprint bytea not null,
  statement_id text collate "C" not null,
  occurred_at timestamptz not null,
  evidence_path text not null unique,
  unique (source_fingerprint,statement_id)
);
create table shiap_private.stay_withdrawal_actions (
  id uuid primary key,
  withdrawal_id uuid not null references shiap_private.stay_withdrawals(id) on delete restrict,
  actor_id uuid not null,
  action text not null,
  old_status text,
  new_status text not null,
  reason text,
  argument jsonb,
  occurred_at timestamptz not null default clock_timestamp()
);

alter table shiap_private.stay_payout_control enable row level security;
alter table shiap_private.stay_payout_operators enable row level security;
alter table shiap_private.stay_payout_accounts enable row level security;
alter table shiap_private.stay_withdrawals enable row level security;
alter table shiap_private.stay_withdrawal_transfers enable row level security;
alter table shiap_private.stay_withdrawal_actions enable row level security;
revoke all on shiap_private.stay_payout_control,shiap_private.stay_payout_operators,shiap_private.stay_payout_accounts,
  shiap_private.stay_withdrawals,shiap_private.stay_withdrawal_transfers,shiap_private.stay_withdrawal_actions from public,anon,authenticated,service_role;

create trigger stay_payout_actions_immutable before update or delete or truncate on shiap_private.stay_withdrawal_actions
for each statement execute function shiap_private.guard_stay_finance_history();
create trigger stay_payout_transfers_immutable before update or delete or truncate on shiap_private.stay_withdrawal_transfers
for each statement execute function shiap_private.guard_stay_finance_history();

create function shiap_private.require_stay_payout_operator() returns void
language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from shiap_private.stay_payout_operators p where p.user_id=auth.uid()) or not public.is_shiap_admin() then
    raise exception 'Akses Finance payout diperlukan.' using errcode='42501';
  end if;
end $$;

create function shiap_private.require_stay_payout_enabled() returns void
language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from shiap_private.stay_payout_control where id and enabled) then
    raise exception 'Pencairan Stay belum tersedia.' using errcode='PT409';
  end if;
end $$;

create function shiap_private.lock_stay_wallet_property(p_places uuid) returns void
language plpgsql set search_path='' as $$
begin
  if not pg_try_advisory_xact_lock(hashtextextended('stay-wallet:'||p_places::text,0)) then
    raise exception 'Saldo sedang diproses. Coba lagi.' using errcode='40001';
  end if;
end $$;

create function shiap_private.guard_stay_wallet_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare places uuid;
begin
  if tg_table_name='unified_item_refunds' then
    select s.vendor_id into places from shiap_private.unified_order_items s where s.item_id=new.item_id and s.service='stay';
  else
    select s.vendor_id into places from shiap_private.stay_finance_lines l join shiap_private.unified_order_items s on s.item_id=l.item_id
      where l.journal_id=new.original_journal_id and s.service='stay' limit 1;
  end if;
  if places is not null then perform shiap_private.lock_stay_wallet_property(places); end if;
  return new;
end $$;

create trigger lock_wallet_refund before insert or update on shiap_private.unified_item_refunds
for each row execute function shiap_private.guard_stay_wallet_change();
create trigger lock_wallet_bank_return before insert on shiap_private.stay_finance_bank_returns
for each row execute function shiap_private.guard_stay_wallet_change();

create function public.admin_verify_stay_payout_account(p_places uuid,p_bank text,p_account text,p_evidence text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; account_digits text:=regexp_replace(p_account,'[^0-9]','','g');
begin
  perform shiap_private.require_stay_payout_operator();
  perform shiap_private.lock_stay_wallet_property(p_places);
  if not exists(select 1 from public.stay_partner_booking_config c where c.places_id=p_places and c.bank_verified_at is not null
    and lower(btrim(c.bank_name))=lower(btrim(p_bank)) and c.bank_last4=right(account_digits,4))
    or length(account_digits) not between 6 and 34 or not exists(select 1 from storage.objects o
      where o.bucket_id='finance-bank-evidence' and o.name=p_evidence and o.owner_id=auth.uid()::text) then
    raise exception 'Rekening harus cocok dengan verifikasi Partner dan bukti privat.' using errcode='22023';
  end if;
  if exists(select 1 from shiap_private.stay_withdrawals w join shiap_private.stay_payout_accounts a on a.id=w.account_id
    where a.places_id=p_places and w.status in ('PENDING','APPROVED','PROCESSING')) then
    raise exception 'Selesaikan permintaan aktif sebelum mengganti rekening.' using errcode='PT409';
  end if;
  update shiap_private.stay_payout_accounts set retired_at=clock_timestamp() where places_id=p_places and retired_at is null;
  insert into shiap_private.stay_payout_accounts(places_id,bank_name,fingerprint,last4,evidence_path,verified_by)
    values(p_places,btrim(p_bank),shiap_private.bank_account_key(account_digits),right(account_digits,4),p_evidence,auth.uid())
    returning id into result;
  return result;
end $$;

create function shiap_private.stay_wallet_withdrawable(p_item uuid,p_ignore uuid default null) returns bigint
language sql stable set search_path='' as $$
  select coalesce((
    select case when v.eligibility in ('EARLY','FINAL') and not exists (
      select 1 from shiap_private.stay_wallet_item_balances other
      where other.places_id=v.places_id and other.net_idr<0
    ) then greatest(case when v.eligibility='EARLY' then
      (v.net_idr+used.paid_idr)/2-used.paid_idr-used.reserved_idr
      else v.net_idr-used.reserved_idr end,0) else 0 end
    from shiap_private.stay_wallet_item_balances v
    cross join lateral (
      select coalesce(sum(w.amount_idr) filter(where w.status='PAID'),0)::bigint as paid_idr,
        coalesce(sum(w.amount_idr) filter(where w.status in ('PENDING','APPROVED','PROCESSING')),0)::bigint as reserved_idr
      from shiap_private.stay_withdrawals w where w.item_id=p_item and w.id is distinct from p_ignore
    ) used where v.item_id=p_item
  ),0)
$$;

create function public.partner_request_stay_withdrawal(p_id uuid,p_item uuid,p_account uuid,p_amount bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare s shiap_private.unified_order_items%rowtype; prior shiap_private.stay_withdrawals%rowtype;
begin
  perform shiap_private.require_stay_payout_enabled();
  select * into strict s from shiap_private.unified_order_items where item_id=p_item and service='stay';
  if auth.uid() is null or public.is_shiap_admin() or not shiap_private.stay_partner_can_manage(s.partner_agreement_id,s.vendor_id) then
    raise exception 'Akses pemilik properti diperlukan.' using errcode='42501';
  end if;
  if p_id is null or p_amount is null or p_amount<=0 then raise exception 'Nominal tidak valid.' using errcode='22023'; end if;
  perform 1 from public.booking_orders where id=s.booking_id for update;
  perform shiap_private.lock_stay_wallet_property(s.vendor_id);
  select * into prior from shiap_private.stay_withdrawals where id=p_id;
  if found then
    if prior.item_id=p_item and prior.account_id=p_account and prior.amount_idr=p_amount and prior.requested_by=auth.uid()
      then return p_id; end if;
    raise exception 'Kunci pencairan bertentangan.' using errcode='23505';
  end if;
  if p_amount>shiap_private.stay_wallet_withdrawable(p_item) or not exists(select 1 from shiap_private.stay_payout_accounts a
    where a.id=p_account and a.places_id=s.vendor_id and a.retired_at is null) then
    raise exception 'Saldo tersedia atau rekening terverifikasi tidak memenuhi syarat.' using errcode='23514';
  end if;
  insert into shiap_private.stay_withdrawals(id,item_id,account_id,requested_by,amount_idr)
    values(p_id,p_item,p_account,auth.uid(),p_amount);
  insert into shiap_private.stay_withdrawal_actions(id,withdrawal_id,actor_id,action,new_status)
    values(p_id,p_id,auth.uid(),'REQUEST','PENDING');
  return p_id;
end $$;

create function public.admin_manage_stay_withdrawal(p_event uuid,p_id uuid,p_action text,p_reason text,p_transfer jsonb default null)
returns text language plpgsql security definer set search_path='' as $$
declare
  w shiap_private.stay_withdrawals%rowtype;
  s shiap_private.unified_order_items%rowtype;
  a shiap_private.stay_payout_accounts%rowtype;
  last_action shiap_private.stay_withdrawal_actions%rowtype;
  next_status text;
  source_key bytea;
  bank_id text:=nullif(btrim(p_transfer->>'bank_id'),'');
  bank_time timestamptz:=nullif(p_transfer->>'occurred_at','')::timestamptz;
  path text:=p_transfer->>'evidence';
  statement_details jsonb:=case when p_transfer is not null then jsonb_build_object(
    'bank_id',bank_id,'occurred_at',bank_time,'evidence',path,'amount',p_transfer->>'amount',
    'beneficiary_key',encode(shiap_private.bank_account_key(p_transfer->>'beneficiary_account'),'hex'),
    'source_key',encode(shiap_private.bank_account_key(p_transfer->>'source_account'),'hex')
  ) end;
begin
  perform shiap_private.require_stay_payout_operator();
  if p_action in ('APPROVE','START') then perform shiap_private.require_stay_payout_enabled(); end if;
  if p_event is null or coalesce(length(btrim(p_reason)),0) not between 10 and 500 then
    raise exception 'Alasan Finance diperlukan.' using errcode='22023';
  end if;
  select * into strict w from shiap_private.stay_withdrawals where id=p_id;
  select * into strict s from shiap_private.unified_order_items where item_id=w.item_id;
  perform 1 from public.booking_orders where id=s.booking_id for update;
  perform shiap_private.lock_stay_wallet_property(s.vendor_id);
  select * into strict w from shiap_private.stay_withdrawals where id=p_id for update;
  if w.requested_by=auth.uid() then raise exception 'Pemisahan pemohon dan Finance diperlukan.' using errcode='42501'; end if;
  select * into last_action from shiap_private.stay_withdrawal_actions where id=p_event;
  if found then
    if last_action.withdrawal_id=p_id and last_action.action=p_action and last_action.actor_id=auth.uid()
      and last_action.reason=btrim(p_reason) and last_action.argument is not distinct from statement_details
    then return last_action.new_status; end if;
    raise exception 'Kunci tindakan pencairan bertentangan.' using errcode='23505';
  end if;
  next_status:=case
    when p_action='APPROVE' and w.status='PENDING' then 'APPROVED'
    when p_action='START' and w.status='APPROVED' then 'PROCESSING'
    when p_action='REJECT' and w.status in ('PENDING','APPROVED') then 'REJECTED'
    when p_action='FAIL' and w.status='PROCESSING' then 'FAILED'
    when p_action='PAY' and w.status='PROCESSING' then 'PAID' end;
  if next_status is null then raise exception 'Perubahan status payout tidak valid.' using errcode='PT409'; end if;
  select * into strict a from shiap_private.stay_payout_accounts where id=w.account_id and places_id=s.vendor_id;
  if p_action in ('APPROVE','START') and (a.retired_at is not null
    or w.amount_idr>shiap_private.stay_wallet_withdrawable(s.item_id,w.id)) then
    raise exception 'Saldo atau rekening berubah. Tinjau kembali pencairan.' using errcode='23514';
  end if;
  if p_action in ('FAIL','PAY') and (path is distinct from auth.uid()::text||'/'||p_event::text
    or not exists(select 1 from storage.objects o where o.bucket_id='finance-bank-evidence' and o.name=path and o.owner_id=auth.uid()::text)) then
    raise exception 'Bukti mutasi privat diperlukan.' using errcode='22023';
  end if;
  if p_action='PAY' then
    select shiap_private.bank_account_key(p.account_number) into source_key from public.payment_settings p where p.id and p.is_active;
    if source_key is null or shiap_private.bank_account_key(p_transfer->>'source_account') is distinct from source_key
      or bank_id is null or length(bank_id) not between 3 and 160 or bank_id ~ '[[:cntrl:]]'
      or bank_time is null or not isfinite(bank_time) or bank_time<w.processing_at or bank_time>clock_timestamp()
      or (p_transfer->>'amount')::bigint is distinct from w.amount_idr
      or shiap_private.bank_account_key(p_transfer->>'beneficiary_account') is distinct from a.fingerprint then
      raise exception 'Mutasi keluar harus sesuai rekening, nominal, dan waktu pencairan.' using errcode='22023';
    end if;
    perform shiap_private.lock_stay_finance_statement(source_key,bank_id);
    if exists(select 1 from shiap_private.verified_bank_transfers t where t.account_fingerprint=source_key and t.source_transaction_id=bank_id)
      or exists(select 1 from shiap_private.unified_refund_payouts t where t.source_account_key=source_key and t.source_transaction_id=bank_id)
      or exists(select 1 from shiap_private.stay_finance_bank_returns t where t.account_fingerprint=source_key and t.statement_id=bank_id) then
      raise exception 'Mutasi ini sudah dibukukan.' using errcode='23505';
    end if;
    insert into shiap_private.stay_withdrawal_transfers(withdrawal_id,source_fingerprint,statement_id,occurred_at,evidence_path)
      values(w.id,source_key,bank_id,bank_time,path);
    perform shiap_private.post_stay_finance('PAYOUT_PAID',w.id,s.booking_id,auth.uid(),btrim(p_reason),
      jsonb_build_array(jsonb_build_object('item_id',w.item_id,'account','PARTNER_PAYABLE','delta_idr',w.amount_idr),
        jsonb_build_object('item_id',w.item_id,'account','BANK','delta_idr',-w.amount_idr)));
  end if;
  update shiap_private.stay_withdrawals set status=next_status,processing_at=case when p_action='START'
    then clock_timestamp() else w.processing_at end where id=w.id;
  insert into shiap_private.stay_withdrawal_actions(id,withdrawal_id,actor_id,action,old_status,new_status,reason,argument)
    values(p_event,w.id,auth.uid(),p_action,w.status,next_status,btrim(p_reason),statement_details);
  return next_status;
end $$;

-- Check payout statement identities for incoming, refund and return recordings as well.
create function shiap_private.guard_used_stay_payout_statement() returns trigger
language plpgsql security definer set search_path='' as $$
declare account_key bytea; bank_id text;
begin
  if tg_table_name='verified_bank_transfers' then account_key:=new.account_fingerprint; bank_id:=new.source_transaction_id;
  elsif tg_table_name='unified_refund_payouts' then account_key:=new.source_account_key; bank_id:=new.source_transaction_id;
  else account_key:=new.account_fingerprint; bank_id:=new.statement_id; end if;
  if exists(select 1 from shiap_private.stay_withdrawal_transfers t where t.source_fingerprint=account_key and t.statement_id=bank_id) then
    raise exception 'Mutasi ini sudah dicatat sebagai payout Partner.' using errcode='23505';
  end if;
  return new;
end $$;
create trigger zz_stay_payout_statement before insert on shiap_private.verified_bank_transfers
for each row execute function shiap_private.guard_used_stay_payout_statement();
create trigger zz_stay_payout_statement before insert on shiap_private.unified_refund_payouts
for each row execute function shiap_private.guard_used_stay_payout_statement();
create trigger zz_stay_payout_statement before insert on shiap_private.stay_finance_bank_returns
for each row execute function shiap_private.guard_used_stay_payout_statement();

revoke all on function shiap_private.require_stay_payout_operator(),shiap_private.require_stay_payout_enabled(),
  shiap_private.lock_stay_wallet_property(uuid),shiap_private.guard_stay_wallet_change(),
  shiap_private.stay_wallet_withdrawable(uuid,uuid),shiap_private.guard_used_stay_payout_statement(),
  public.admin_verify_stay_payout_account(uuid,text,text,text),public.partner_request_stay_withdrawal(uuid,uuid,uuid,bigint),
  public.admin_manage_stay_withdrawal(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_verify_stay_payout_account(uuid,text,text,text),
  public.partner_request_stay_withdrawal(uuid,uuid,uuid,bigint),public.admin_manage_stay_withdrawal(uuid,uuid,text,text,jsonb) to authenticated;
do $migration$
declare d text; c text;
begin
  d:=pg_get_functiondef('public.read_stay_partner_wallet(uuid)'::regprocedure);
  c:=replace(d,$old$select v.*,e.name,case v.eligibility when 'EARLY' then greatest(v.net_idr,0)/2
      when 'FINAL' then greatest(v.net_idr,0) else 0 end as eligibility_idr$old$,
    $new$select v.*,e.name,shiap_private.stay_wallet_withdrawable(v.item_id) as eligibility_idr,
      coalesce((select sum(w.amount_idr) from shiap_private.stay_withdrawals w where w.item_id=v.item_id and w.status='PAID'),0) paid_idr,
      coalesce((select sum(w.amount_idr) from shiap_private.stay_withdrawals w where w.item_id=v.item_id
        and w.status in ('PENDING','APPROVED','PROCESSING')),0) reserved_idr$new$);
  if d=c then raise exception 'Wallet balance projection changed'; end if;
  d:=c;
  c:=replace(d,$old$(select sum(net_idr) from balances),0)::text,$old$,
    $new$(select sum(net_idr+paid_idr) from balances),0)::text,
      'payout_paid_idr',coalesce((select sum(paid_idr) from balances),0)::text,
      'reserved_idr',coalesce((select sum(reserved_idr) from balances),0)::text,
      'refund_exposure_idr',coalesce((select sum(-net_idr) from balances where net_idr<0),0)::text,$new$);
  if d=c then raise exception 'Wallet earnings projection changed'; end if;
  d:=c;
  c:=replace(d,$old$(select sum(net_idr-eligibility_idr) from balances where eligibility<>'HELD')$old$,
    $new$(select sum(greatest(net_idr-eligibility_idr-reserved_idr,0)) from balances where eligibility<>'HELD')$new$);
  if d=c then raise exception 'Wallet pending projection changed'; end if;
  d:=c;
  c:=replace(d,$old$'truncated',(select count(*)>100 from balances)$old$,
    $new$'withdrawals',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'status',x.status,
      'amount_idr',x.amount_idr::text,'created_at',x.created_at,'account_last4',x.last4,'order_number',x.order_number)
      order by x.created_at desc,x.id) from (
        select w.id,w.status,w.amount_idr,w.created_at,a.last4,b.order_number
        from balances b join shiap_private.stay_withdrawals w on w.item_id=b.item_id
        join shiap_private.stay_payout_accounts a on a.id=w.account_id
        order by w.created_at desc,w.id limit 100
      ) x),'[]'::jsonb),
    'truncated',(select count(*)>100 from balances)$new$);
  if d=c then raise exception 'Wallet payout history projection changed'; end if;
  execute c;
end $migration$;
commit;
