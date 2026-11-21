begin;

do $migration$
declare old_rule text;
begin
  select pg_get_expr(conbin,conrelid) into strict old_rule from pg_constraint
    where conrelid='public.notification_events'::regclass and conname='notification_events_event_type_check';
  alter table public.notification_events drop constraint notification_events_event_type_check;
  execute format('alter table public.notification_events add constraint notification_events_event_type_check
    check ((%s) or event_type in (''item_refund_requested'',''item_refund_approved'',''item_refund_rejected'',''item_refund_paid'',''booking_item_cancelled''))',old_rule);
end $migration$;

alter table public.notification_deliveries drop constraint notification_deliveries_audience_check;
alter table public.notification_deliveries add constraint notification_deliveries_audience_check
  check(audience in ('admin','customer','partner'));

create function shiap_private.notify_unified_refund_item()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient text;
begin
  if new.event_type not in ('item_refund_requested','item_refund_approved','item_refund_rejected','item_refund_paid','booking_item_cancelled')
    or not exists(select 1 from public.notification_settings s where s.id and s.email_enabled and new.event_type=any(s.email_events)) then
    return new;
  end if;
  -- Send only to a verified Stay operator for this exact item.
  select btrim(u.email) into recipient
  from public.stay_partner_fulfillment f
  join public.stay_partner_booking_config c on c.property_id=f.property_id
  join public.stay_agreement_members m on m.agreement_id=f.agreement_id and m.role='OWNER' and m.status='ACTIVE'
  join public.places_property_members pm on pm.property_id=c.places_id and pm.user_id=m.user_id and pm.role='OWNER' and pm.status='ACTIVE'
  join auth.users u on u.id=m.user_id and u.email_confirmed_at is not null
  where f.item_id=new.booking_item_id and f.order_id=new.booking_id and pm.verified_at is not null
    and length(u.email)<=254 and u.email ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
  order by m.user_id limit 1;
  if recipient is not null then
    insert into public.notification_deliveries(event_id,channel,audience,recipient,state)
    values(new.id,'email','partner',recipient,'queued') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger notification_unified_item_partner after insert on public.notification_events
for each row execute function shiap_private.notify_unified_refund_item();
revoke all on function shiap_private.notify_unified_refund_item() from public,anon,authenticated,service_role;

do $migration$
declare d text; c text;
begin
  d:=pg_get_functiondef('shiap_private.notification_eligible(uuid)'::regprocedure);
  c:=replace(d,$old$if e.event_type not like 'places_%' then return shiap_private.notification_booking_eligible_v1(p_event);end if;$old$,
  $new$if e.event_type in ('item_refund_requested','item_refund_approved','item_refund_rejected','item_refund_paid','booking_item_cancelled') then
    if e.created_at<now()-interval '1 day' or not exists(select 1 from public.notification_settings s
      where s.id and s.email_enabled and e.event_type=any(s.email_events)) then return false; end if;
    if exists (select 1 from public.notification_deliveries d where d.event_id=e.id and d.channel='email'
      and d.audience='customer' and not exists(select 1 from public.booking_orders b where b.id=e.booking_id and btrim(b.customer_email)=d.recipient)) then
      return false;
    end if;
    if exists(select 1 from public.notification_deliveries d where d.event_id=e.id and d.channel='email' and d.audience='partner'
      and not exists(select 1 from public.stay_partner_fulfillment f join public.stay_partner_booking_config c on c.property_id=f.property_id
        join public.stay_agreement_members m on m.agreement_id=f.agreement_id and m.role='OWNER' and m.status='ACTIVE'
        join public.places_property_members pm on pm.property_id=c.places_id and pm.user_id=m.user_id and pm.role='OWNER' and pm.status='ACTIVE'
        join auth.users u on u.id=m.user_id and u.email_confirmed_at is not null
        where f.item_id=e.booking_item_id and f.order_id=e.booking_id and pm.verified_at is not null and btrim(u.email)=d.recipient)) then
      return false;
    end if;
    -- The event namespace ties the message to a single immutable action.
    return exists(select 1 from shiap_private.unified_refund_actions a
      left join shiap_private.unified_item_refunds r on r.id=a.refund_id
      left join shiap_private.unified_refund_payouts p on p.refund_id=r.id
      left join public.finance_transaction_entries f on f.unified_refund_payout_id=p.id and f.status='posted'
      where e.deduplication_key='unified-refund:'||a.request_key and e.booking_id=a.booking_id and e.booking_item_id=a.item_id and (
        (e.event_type='booking_item_cancelled' and a.action='cancel_item')
        or (e.event_type='item_refund_requested' and a.action='request' and r.status in ('REQUESTED','UNDER_REVIEW'))
        or (e.event_type='item_refund_approved' and a.action='approve' and r.status in ('APPROVED','PENDING_PAYMENT','FAILED'))
        or (e.event_type='item_refund_rejected' and a.action='reject' and r.status='REJECTED')
        or (e.event_type='item_refund_paid' and a.action='pay' and r.status='PAID' and f.id is not null and not r.reconcile_required)));
  end if;
  if e.event_type in ('travel_reminder','activity_today','trip_schedule_changed') and e.booking_item_id is not null
    and not shiap_private.unified_item_active(e.booking_item_id) then return false; end if;
  if e.event_type not like 'places_%' then return shiap_private.notification_booking_eligible_v1(p_event);end if;$new$);
  if d=c then raise exception 'Notification dispatch contract changed.'; end if;
  -- The function reads private audit rows and is executable only by service_role.
  c:=replace(c,'SECURITY INVOKER','SECURITY DEFINER');
  c:=replace(c,'LANGUAGE plpgsql\n STABLE','LANGUAGE plpgsql\n STABLE SECURITY DEFINER');
  c:=replace(c,'STABLE SECURITY DEFINER SECURITY DEFINER','STABLE SECURITY DEFINER');
  execute c;
end $migration$;
revoke all on function shiap_private.notification_eligible(uuid) from public,anon,authenticated;
grant execute on function shiap_private.notification_eligible(uuid) to service_role;

commit;
