begin;

-- Signed integer rupiah: positive is debit, negative is credit.
create table shiap_private.stay_finance_journals (
  id uuid primary key,
  source_kind text not null check (source_kind in ('RECEIPT','REFUND_APPROVED','REFUND_PAID','BANK_RETURN','PAYOUT_PAID','COMMISSION_EARNED')),
  source_id uuid not null,
  booking_id uuid not null references shiap_private.unified_orders(booking_id) on delete restrict,
  actor_id uuid not null,
  description text not null check (length(description) between 1 and 500),
  posted_at timestamptz not null default clock_timestamp(),
  unique (source_kind, source_id)
);

create table shiap_private.stay_finance_lines (
  journal_id uuid not null references shiap_private.stay_finance_journals(id) on delete restrict deferrable initially deferred,
  item_id uuid not null references shiap_private.unified_order_items(item_id) on delete restrict,
  account text not null check (account in ('BANK','PARTNER_PAYABLE','COMMISSION_DEFERRED','COMMISSION_REVENUE',
    'SERVICE_CLEARING','SERVICE_FEE_CLEARING','TAX_CLEARING','REFUND_PAYABLE')),
  delta_idr bigint not null check (delta_idr <> 0),
  primary key (journal_id,item_id,account)
);

create index stay_finance_lines_item_account_idx on shiap_private.stay_finance_lines(item_id,account);
create index stay_finance_journals_booking_idx on shiap_private.stay_finance_journals(booking_id,posted_at);

alter table shiap_private.stay_finance_journals enable row level security;
alter table shiap_private.stay_finance_lines enable row level security;
revoke all on shiap_private.stay_finance_journals,shiap_private.stay_finance_lines from public,anon,authenticated,service_role;

create function shiap_private.guard_stay_finance_history() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Financial journals are immutable.' using errcode='23514';
  end if;
  if tg_table_name = 'stay_finance_lines' then
    perform pg_advisory_xact_lock(hashtextextended('stay-finance-journal:' || new.journal_id::text,0));
    if exists(select 1 from shiap_private.stay_finance_journals j where j.id=new.journal_id) then
      raise exception 'The journal is already posted.' using errcode='23514';
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended('stay-finance-journal:' || new.id::text,0));
    if not exists(select 1 from shiap_private.stay_finance_lines l where l.journal_id=new.id) or exists(
      select 1 from shiap_private.stay_finance_lines l
      join shiap_private.unified_order_items i on i.item_id=l.item_id
      where l.journal_id=new.id group by l.item_id
      having sum(l.delta_idr) <> 0 or count(*) < 2 or not bool_and(i.booking_id=new.booking_id)
    ) then
      raise exception 'A journal must reconcile separately for each item.' using errcode='23514';
    end if;
  end if;
  return new;
end $$;

create trigger guard_stay_finance_journals before insert or update or delete on shiap_private.stay_finance_journals
for each row execute function shiap_private.guard_stay_finance_history();
create trigger guard_stay_finance_lines before insert or update or delete on shiap_private.stay_finance_lines
for each row execute function shiap_private.guard_stay_finance_history();
create trigger guard_stay_finance_journals_truncate before truncate on shiap_private.stay_finance_journals
for each statement execute function shiap_private.guard_stay_finance_history();
create trigger guard_stay_finance_lines_truncate before truncate on shiap_private.stay_finance_lines
for each statement execute function shiap_private.guard_stay_finance_history();

create function shiap_private.post_stay_finance(
  p_kind text,p_source uuid,p_booking uuid,p_actor uuid,p_description text,p_lines jsonb
) returns uuid language plpgsql set search_path = '' as $$
declare
  journal uuid;
  prior shiap_private.stay_finance_journals%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('stay-finance-source:' || p_kind || ':' || p_source::text,0));
  select * into prior from shiap_private.stay_finance_journals where source_kind=p_kind and source_id=p_source;
  if found then
    if prior.booking_id=p_booking and prior.actor_id=p_actor and prior.description=p_description and
      (select jsonb_agg(to_jsonb(x) order by x.item_id,x.account) from
        (select l.item_id,l.account,l.delta_idr from shiap_private.stay_finance_lines l where l.journal_id=prior.id) x)
      is not distinct from
      (select jsonb_agg(to_jsonb(x) order by x.item_id,x.account)
        from jsonb_to_recordset(p_lines) x(item_id uuid,account text,delta_idr bigint) where x.delta_idr<>0)
    then return prior.id; end if;
    raise exception 'Financial source is already posted with different details.' using errcode='23505';
  end if;

  journal:=gen_random_uuid();
  insert into shiap_private.stay_finance_lines(journal_id,item_id,account,delta_idr)
    select journal,x.item_id,x.account,x.delta_idr
    from jsonb_to_recordset(p_lines) x(item_id uuid,account text,delta_idr bigint) where x.delta_idr<>0;
  insert into shiap_private.stay_finance_journals(id,source_kind,source_id,booking_id,actor_id,description)
    values(journal,p_kind,p_source,p_booking,p_actor,p_description);
  return journal;
end $$;

create function shiap_private.stay_finance_cash_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  lines jsonb;
  amount_total bigint;
  request_row shiap_private.unified_item_refunds%rowtype;
begin
  if new.entry_type='payment' and new.bank_transfer_id is not null and
    exists(select 1 from shiap_private.unified_orders u where u.booking_id=new.booking_id) then
    select sum(s.subtotal_idr-s.discount_idr+s.tax_idr+s.service_fee_idr) into amount_total
      from shiap_private.unified_order_items s where s.booking_id=new.booking_id;
    if new.status<>'posted' or amount_total is null or new.amount<>amount_total or not exists (
      select 1 from shiap_private.bank_receipt_allocations a join shiap_private.verified_bank_transfers t on t.id=a.transfer_id
      where a.booking_id=new.booking_id and a.transfer_id=new.bank_transfer_id and t.amount_idr=amount_total
    ) then
      raise exception 'Receipt does not reconcile to verified bank allocation and item snapshots.' using errcode='23514';
    end if;
    select jsonb_agg(jsonb_build_object('item_id',s.item_id,'account',v.account,'delta_idr',v.delta))
    into lines from shiap_private.unified_order_items s
    cross join lateral (select s.subtotal_idr-s.discount_idr as principal) p
    cross join lateral (select p.principal*s.commission_bps/10000 as commission) c
    cross join lateral (values
      ('BANK',p.principal+s.tax_idr+s.service_fee_idr),
      ('PARTNER_PAYABLE',case when s.service='stay' then c.commission-p.principal else 0 end),
      ('COMMISSION_DEFERRED',-c.commission),
      ('SERVICE_CLEARING',case when s.service<>'stay' then -p.principal else 0 end),
      ('SERVICE_FEE_CLEARING',-s.service_fee_idr),
      ('TAX_CLEARING',-s.tax_idr)
    ) v(account,delta) where s.booking_id=new.booking_id;
    perform shiap_private.post_stay_finance('RECEIPT',new.id,new.booking_id,new.actor_user_id,'Verified customer bank transfer',lines);
  elsif new.unified_refund_payout_id is not null then
    select r.* into strict request_row from shiap_private.unified_item_refunds r
      join shiap_private.unified_refund_payouts p on p.refund_id=r.id where p.id=new.unified_refund_payout_id;
    if not exists(select 1 from shiap_private.stay_finance_journals j
      where j.source_kind='REFUND_APPROVED' and j.source_id=request_row.id) then
      raise exception 'Refund liability requires a reconciled opening entry.' using errcode='23514';
    end if;
    perform shiap_private.post_stay_finance('REFUND_PAID',new.unified_refund_payout_id,new.booking_id,new.actor_user_id,
      'Verified outbound item refund',jsonb_build_array(
        jsonb_build_object('item_id',request_row.item_id,'account','REFUND_PAYABLE','delta_idr',new.amount::bigint),
        jsonb_build_object('item_id',request_row.item_id,'account','BANK','delta_idr',-new.amount::bigint)
      ));
  end if;
  return new;
end $$;

create trigger stay_finance_cash_event after insert on public.finance_transaction_entries
for each row execute function shiap_private.stay_finance_cash_event();

create function shiap_private.stay_finance_refund_approval() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  item shiap_private.unified_order_items%rowtype;
  previous_liability bigint;
  principal bigint;
  commission_reduction bigint;
  lines jsonb;
begin
  select * into strict item from shiap_private.unified_order_items where item_id=new.item_id for update;
  if not exists(select 1 from shiap_private.stay_finance_journals j
    where j.booking_id=new.booking_id and j.source_kind='RECEIPT') then
    raise exception 'The original receipt requires financial reconciliation.' using errcode='23514';
  end if;
  select coalesce(sum(r.approved_idr),0) into previous_liability from shiap_private.unified_item_refunds r
    where r.item_id=item.item_id and r.id<>new.id and r.approved_idr is not null;
  principal:=item.subtotal_idr-item.discount_idr;
  if previous_liability+new.approved_idr>principal then
    raise exception 'Refund liabilities exceed this item principal.' using errcode='23514';
  end if;
  commission_reduction:=(principal-previous_liability)*item.commission_bps/10000
    -(principal-previous_liability-new.approved_idr)*item.commission_bps/10000;
  select jsonb_agg(jsonb_build_object('item_id',item.item_id,'account',v.account,'delta_idr',v.amount)) into lines
    from (values ('REFUND_PAYABLE',-new.approved_idr),
      ('PARTNER_PAYABLE',case when item.service='stay' then new.approved_idr-commission_reduction else 0 end),
      ('COMMISSION_DEFERRED',commission_reduction),
      ('SERVICE_CLEARING',case when item.service<>'stay' then new.approved_idr else 0 end)
    ) v(account,amount);
  perform shiap_private.post_stay_finance('REFUND_APPROVED',new.id,new.booking_id,new.approved_by,
    'Approved item refund liability',lines);
  return new;
end $$;

create trigger stay_finance_refund_approval after update of approved_idr on shiap_private.unified_item_refunds
for each row when (old.approved_idr is null and new.approved_idr is not null)
execute function shiap_private.stay_finance_refund_approval();

revoke all on function shiap_private.guard_stay_finance_history(),
  shiap_private.post_stay_finance(text,uuid,uuid,uuid,text,jsonb),
  shiap_private.stay_finance_cash_event(),shiap_private.stay_finance_refund_approval() from public,anon,authenticated,service_role;

-- Legacy payment reports and Phase 4C records remain available alongside
-- the item ledger. Flag openings that need separate, evidence-backed review.
create function public.admin_stay_finance_reconciliation(p_limit integer default 100)
returns table(booking_id uuid,receipt_id uuid,state text,observed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_shiap_admin() then
    raise exception 'Finance Admin access required.' using errcode='42501';
  end if;
  return query select f.booking_id,f.id,case when f.status='reversed' then 'REVERSED_RECEIPT_REVIEW'
    when f.bank_transfer_id is null then 'BANK_IDENTITY_REQUIRED' else 'OPENING_RECONCILIATION_REQUIRED' end,f.created_at
  from public.finance_transaction_entries f
  join shiap_private.unified_orders u on u.booking_id=f.booking_id
  left join shiap_private.stay_finance_journals j on j.source_kind='RECEIPT' and j.source_id=f.id
  where f.entry_type='payment' and (j.id is null or f.status='reversed')
  order by f.created_at desc,f.id limit greatest(1,least(coalesce(p_limit,100),500));
end $$;
revoke all on function public.admin_stay_finance_reconciliation(integer) from public,anon,authenticated,service_role;
grant execute on function public.admin_stay_finance_reconciliation(integer) to authenticated;
commit;
