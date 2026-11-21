begin;

alter table shiap_private.stay_finance_lines drop constraint stay_finance_lines_account_check;
alter table shiap_private.stay_finance_lines add constraint stay_finance_lines_account_check
  check (account in ('BANK','PARTNER_PAYABLE','COMMISSION_DEFERRED','COMMISSION_REVENUE',
    'SERVICE_CLEARING','SERVICE_FEE_CLEARING','TAX_CLEARING','REFUND_PAYABLE','BANK_RETURN_SUSPENSE'));

create table shiap_private.stay_finance_bank_returns (
  id uuid primary key,
  original_journal_id uuid not null unique references shiap_private.stay_finance_journals(id) on delete restrict,
  account_fingerprint bytea not null,
  statement_id text collate "C" not null,
  occurred_at timestamptz not null,
  amount_idr bigint not null check (amount_idr>0),
  evidence_path text not null unique,
  recorded_by uuid not null,
  reason text not null,
  unique (account_fingerprint,statement_id)
);

alter table shiap_private.stay_finance_bank_returns enable row level security;
revoke all on shiap_private.stay_finance_bank_returns from public,anon,authenticated,service_role;
create trigger guard_stay_finance_returns before update or delete or truncate on shiap_private.stay_finance_bank_returns
for each statement execute function shiap_private.guard_stay_finance_history();

create function shiap_private.lock_stay_finance_statement(p_account bytea,p_statement text) returns void
language plpgsql set search_path = '' as $$
begin
  if not pg_try_advisory_xact_lock(hashtextextended(
    'stay-bank-statement:'||encode(p_account,'hex')||':'||p_statement,0)) then
    raise exception 'Mutasi ini sedang diproses. Coba lagi.' using errcode='40001';
  end if;
end $$;

create function shiap_private.guard_stay_finance_statement() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  account_key bytea;
  v_statement_id text := new.source_transaction_id;
begin
  if tg_table_name='verified_bank_transfers' then
    account_key:=new.account_fingerprint;
    -- Incoming verification keeps its existing wait-and-check idempotency.
    -- Refund and return callers already hold a booking lock and try-lock.
    perform pg_advisory_xact_lock(hashtextextended(
      'stay-bank-statement:'||encode(account_key,'hex')||':'||v_statement_id,0));
    if exists(select 1 from shiap_private.unified_refund_payouts p
      where p.source_account_key=account_key and p.source_transaction_id=v_statement_id) then
      raise exception 'Bank statement is already recorded as an outgoing refund.' using errcode='23505';
    end if;
  else
    account_key:=new.source_account_key;
    perform shiap_private.lock_stay_finance_statement(account_key,v_statement_id);
    if exists(select 1 from shiap_private.verified_bank_transfers t
      where t.account_fingerprint=account_key and t.source_transaction_id=v_statement_id) then
      raise exception 'Bank statement is already recorded as an incoming payment.' using errcode='23505';
    end if;
  end if;
  if exists(select 1 from shiap_private.stay_finance_bank_returns r
    where r.account_fingerprint=account_key and r.statement_id=v_statement_id) then
    raise exception 'Bank statement is already recorded as a return.' using errcode='23505';
  end if;
  return new;
end $$;

create trigger stay_finance_incoming_statement before insert on shiap_private.verified_bank_transfers
for each row execute function shiap_private.guard_stay_finance_statement();
create trigger stay_finance_refund_statement before insert on shiap_private.unified_refund_payouts
for each row execute function shiap_private.guard_stay_finance_statement();

create function shiap_private.protect_stay_finance_cash_source() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from shiap_private.stay_finance_journals j where j.source_kind='RECEIPT' and j.source_id=old.id)
    and (tg_op='DELETE' or new is distinct from old) then
    raise exception 'Penerimaan sudah dibukukan. Rekam mutasi bank pada alur kompensasi Finance.' using errcode='23514';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

create trigger stay_finance_receipt_history before update or delete on public.finance_transaction_entries
for each row execute function shiap_private.protect_stay_finance_cash_source();

create function public.admin_record_stay_finance_bank_return(
  p_journal uuid,p_request uuid,p_statement text,p_amount bigint,p_occurred_at timestamptz,p_evidence text,p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  source shiap_private.stay_finance_journals%rowtype;
  prior shiap_private.stay_finance_bank_returns%rowtype;
  account_key bytea;
  original_time timestamptz;
  original_amount bigint;
  v_statement_id text := nullif(btrim(p_statement),'');
  reason text := nullif(btrim(p_reason),'');
  lines jsonb;
begin
  if actor is null or not public.is_shiap_admin() then
    raise exception 'Finance Admin access required.' using errcode='42501';
  end if;
  if p_request is null or v_statement_id is null or length(v_statement_id) not between 3 and 160
    or v_statement_id ~ '[[:cntrl:]]' or reason is null or length(reason) not between 10 and 500
    or p_amount is null or p_amount<=0 or p_occurred_at is null or not isfinite(p_occurred_at)
    or p_occurred_at>clock_timestamp() or p_evidence is distinct from actor::text||'/'||p_request::text
    or not exists(select 1 from storage.objects o where o.bucket_id='finance-bank-evidence' and o.name=p_evidence and o.owner_id=actor::text) then
    raise exception 'Gunakan bukti mutasi bank resmi, ID mutasi, tanggal, nominal, dan alasan.' using errcode='22023';
  end if;

  select * into strict source from shiap_private.stay_finance_journals
    where id=p_journal and source_kind in ('RECEIPT','REFUND_PAID');
  perform 1 from public.booking_orders where id=source.booking_id for update;

  if source.source_kind='RECEIPT' then
    select t.account_fingerprint,t.occurred_at,t.amount_idr into strict account_key,original_time,original_amount
      from public.finance_transaction_entries f
      join shiap_private.verified_bank_transfers t on t.id=f.bank_transfer_id where f.id=source.source_id;
  else
    select p.source_account_key,p.occurred_at,p.amount_idr into strict account_key,original_time,original_amount
      from shiap_private.unified_refund_payouts p where p.id=source.source_id;
  end if;
  if p_amount<>original_amount or p_occurred_at<original_time then
    raise exception 'Nominal atau tanggal pengembalian tidak cocok dengan mutasi awal.' using errcode='23514';
  end if;
  perform shiap_private.lock_stay_finance_statement(account_key,v_statement_id);

  select * into prior from shiap_private.stay_finance_bank_returns where id=p_request;
  if found then
    if prior.original_journal_id=p_journal and prior.statement_id=v_statement_id and prior.amount_idr=p_amount
      and prior.occurred_at=p_occurred_at and prior.evidence_path=p_evidence
      and prior.recorded_by=actor and prior.reason=reason then
      return (select j.id from shiap_private.stay_finance_journals j where j.source_kind='BANK_RETURN' and j.source_id=p_request);
    end if;
    raise exception 'Bank return request is already recorded with different details.' using errcode='23505';
  end if;
  if exists(select 1 from shiap_private.verified_bank_transfers t
      where t.account_fingerprint=account_key and t.source_transaction_id=v_statement_id)
    or exists(select 1 from shiap_private.unified_refund_payouts p
      where p.source_account_key=account_key and p.source_transaction_id=v_statement_id) then
    raise exception 'Mutasi bank sudah dipakai.' using errcode='23505';
  end if;
  insert into shiap_private.stay_finance_bank_returns(id,original_journal_id,account_fingerprint,statement_id,
    occurred_at,amount_idr,evidence_path,recorded_by,reason)
  values(p_request,p_journal,account_key,v_statement_id,p_occurred_at,p_amount,p_evidence,actor,reason);

  -- Incoming receipt debits remain in suspense until Finance resolves the
  -- customer's obligations. A returned refund restores the original liability.
  select jsonb_agg(jsonb_build_object('item_id',l.item_id,'account',v.account,'delta_idr',v.delta)) into lines
  from shiap_private.stay_finance_lines l cross join lateral (values
    ('BANK',-l.delta_idr),
    (case when source.source_kind='RECEIPT' then 'BANK_RETURN_SUSPENSE' else 'REFUND_PAYABLE' end,l.delta_idr)
  ) v(account,delta) where l.journal_id=source.id and l.account='BANK';

  if source.source_kind='REFUND_PAID' then
    update shiap_private.unified_item_refunds r set reconcile_required=true,updated_at=clock_timestamp()
    from shiap_private.unified_refund_payouts p where p.id=source.source_id and p.refund_id=r.id;
  end if;
  return shiap_private.post_stay_finance('BANK_RETURN',p_request,source.booking_id,actor,reason,lines);
end $$;

revoke all on function shiap_private.lock_stay_finance_statement(bytea,text),shiap_private.guard_stay_finance_statement(),
  shiap_private.protect_stay_finance_cash_source(),public.admin_record_stay_finance_bank_return(uuid,uuid,text,bigint,timestamptz,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_record_stay_finance_bank_return(uuid,uuid,text,bigint,timestamptz,text,text) to authenticated;
commit;
