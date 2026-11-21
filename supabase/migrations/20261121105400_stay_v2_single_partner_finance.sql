begin;

-- Newly created single-service Partner orders share the same receipt and
-- refund controls. Existing single-service orders keep their existing records.
do $migration$
declare definition text; patched text;
begin
  definition:=pg_get_functiondef('shiap_private.seal_unified_checkout(uuid)'::regprocedure);
  patched:=replace(definition,
    'if n not between 2 and 3 then',
    $new$if n not between 1 and 3 or (n=1 and not exists (
    select 1 from shiap_private.unified_order_items s where s.booking_id=b.id and s.service='stay'
  )) then$new$);
  if patched=definition then raise exception 'Unified seal item limit changed'; end if;
  execute patched;

  definition:=pg_get_functiondef('shiap_private.unified_payment_error(uuid,boolean)'::regprocedure);
  patched:=replace(definition,
    'if lines not between 2 and 3 or lines<>',
    $new$if lines not between 1 and 3 or (lines=1 and not exists (
    select 1 from shiap_private.unified_order_items s where s.booking_id=b.id and s.service='stay'
  )) or lines<>$new$);
  if patched=definition then raise exception 'Unified payment item limit changed'; end if;
  execute patched;
  definition:=pg_get_functiondef('shiap_private.unified_all_fulfilled(uuid)'::regprocedure);
  patched:=replace(definition,'count(*) between 2 and 3 and count(*)=',
    $new$count(*) between 1 and 3 and (count(*)>1 or bool_and(s.service='stay')) and count(*)=$new$);
  if patched=definition then raise exception 'Unified fulfillment item limit changed'; end if;
  execute patched;
end $migration$;

create or replace function public.create_booking_order(
  p_customer_name text,p_customer_whatsapp text,p_customer_email text,p_customer_notes text,p_items jsonb
) returns table(id uuid,order_number text)
language plpgsql security definer set search_path = '' as $$
declare
  booking_id uuid;
  booking_code text;
  uses_partner_ledger boolean := false;
begin
  if jsonb_typeof(p_items)='array' then
    if jsonb_array_length(p_items)=1 and p_items->0->>'service_type'='stay' and p_items->0->>'property_id' is not null
      and (auth.uid() is not null or shiap_private.booking_guest_id() is not null) then
      perform pg_advisory_xact_lock(hashtextextended('shiap-calendar:stay',0));
      uses_partner_ledger:=coalesce(shiap_private.stay_partner_public_mode((p_items->0->>'property_id')::uuid)
        in ('REQUEST_TO_BOOK','INSTANT'),false);
    end if;
  end if;
  select c.id,c.order_number into strict booking_id,booking_code
    from shiap_private.create_booking_order_core(p_customer_name,p_customer_whatsapp,p_customer_email,p_customer_notes,p_items,uses_partner_ledger) c;
  if uses_partner_ledger then
    perform shiap_private.seal_unified_checkout(booking_id);
  end if;
  return query select booking_id,booking_code;
end $$;
create function shiap_private.stay_finance_recognize_commission() returns trigger
language plpgsql security definer set search_path='' as $$
declare commission bigint;
begin
  if auth.uid() is null or exists(select 1 from shiap_private.stay_finance_bank_returns r
    join shiap_private.stay_finance_journals j on j.id=r.original_journal_id
    where j.booking_id=new.order_id) then
    return new;
  end if;

  select coalesce(-sum(l.delta_idr),0) into commission from shiap_private.stay_finance_lines l
    where l.item_id=new.item_id and l.account='COMMISSION_DEFERRED';
  if commission>0 then
    perform shiap_private.post_stay_finance('COMMISSION_EARNED',new.item_id,new.order_id,auth.uid(),
      'Stay commission earned after validated fulfillment',jsonb_build_array(
        jsonb_build_object('item_id',new.item_id,'account','COMMISSION_DEFERRED','delta_idr',commission),
        jsonb_build_object('item_id',new.item_id,'account','COMMISSION_REVENUE','delta_idr',-commission)
      ));
  end if;
  return new;
end $$;

create trigger stay_finance_commission_recognition after update of status on public.stay_partner_fulfillment
for each row when (old.status<>'COMPLETED' and new.status='COMPLETED')
execute function shiap_private.stay_finance_recognize_commission();

revoke all on function shiap_private.stay_finance_recognize_commission() from public,anon,authenticated,service_role;

do $migration$
declare definition text; patched text;
begin
  definition:=pg_get_functiondef('shiap_private.stay_finance_refund_approval()'::regprocedure);
  patched:=replace(definition,$old$('COMMISSION_DEFERRED',commission_reduction)$old$,
    $new$(case when exists(select 1 from shiap_private.stay_finance_journals j
      where j.source_kind='COMMISSION_EARNED' and j.source_id=item.item_id)
      then 'COMMISSION_REVENUE' else 'COMMISSION_DEFERRED' end,commission_reduction)$new$);
  if patched=definition then raise exception 'Refund approval commission posting changed'; end if;
  execute patched;
end $migration$;
create or replace function shiap_private.finance_unified_recognition(p_booking uuid,p_item uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select case when public.is_shiap_admin() and count(*)>0 then jsonb_build_object(
    'principal',sum(case when a.service='stay' then c.earned else a.recognized_principal end),
    'fee',sum(a.recognized_fee),'fee_cash',sum(case when a.customer_payment>0 then a.service_fee else 0 end)
  ) end
  from shiap_private.unified_item_accounting a
  cross join lateral (
    select coalesce(-sum(l.delta_idr),0) as earned from shiap_private.stay_finance_lines l
    where a.service='stay' and l.item_id=a.item_id and l.account='COMMISSION_REVENUE'
  ) c
  where (p_booking is not null and a.booking_id=p_booking) or (p_item is not null and a.item_id=p_item)
$$;
commit;
