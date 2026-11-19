begin;
set local lock_timeout='5s';set local statement_timeout='90s';
alter table public.notification_events add column places_invoice_id uuid references public.places_billing_invoices(id) on delete restrict,add column places_subscription_id uuid references public.places_subscriptions(id) on delete restrict;
create index notification_places_invoice_idx on public.notification_events(places_invoice_id);create index notification_places_subscription_idx on public.notification_events(places_subscription_id);
-- Preserve the exact deployed booking event allowlist; append only Places events.
do $$declare old_rule text;begin select pg_get_expr(conbin,conrelid) into old_rule from pg_constraint where conrelid='public.notification_events'::regclass and conname='notification_events_event_type_check';if old_rule is null then raise exception 'Notification type constraint missing';end if;
 alter table public.notification_events drop constraint notification_events_event_type_check;
 execute format('alter table public.notification_events add constraint notification_events_event_type_check check ((%s) or event_type=any(array[''places_trial_started'',''places_subscription_expiring'',''places_subscription_expired'',''places_invoice_created'',''places_proof_received'',''places_payment_verified'',''places_payment_rejected'']))',old_rule);end$$;
alter table public.notification_events add constraint notification_places_subject check(event_type not like 'places_%' or booking_id is null and num_nonnulls(places_invoice_id,places_subscription_id)=1);
create function shiap_private.enqueue_places_notification(p_type text,p_key text,p_invoice uuid default null,p_subscription uuid default null) returns uuid language plpgsql security definer set search_path='' as $$declare result uuid;property uuid;recipient text;s public.notification_settings%rowtype;begin
 if p_type not in('places_trial_started','places_subscription_expiring','places_subscription_expired','places_invoice_created','places_proof_received','places_payment_verified','places_payment_rejected') or num_nonnulls(p_invoice,p_subscription)<>1 then raise exception 'Invalid Places event';end if;
 insert into public.notification_events(event_type,deduplication_key,places_invoice_id,places_subscription_id,priority) values(p_type,p_key,p_invoice,p_subscription,case when p_type='places_proof_received' then 'high' else 'normal' end) on conflict(deduplication_key) do nothing returning id into result;if result is null then return null;end if;
 insert into public.notification_deliveries(event_id,channel,audience,state) values(result,'admin','admin','available');
 select * into s from public.notification_settings where id;if not s.email_enabled or not(p_type=any(s.email_events)) then return result;end if;
 if p_invoice is not null then select u.email into recipient from public.places_billing_invoices i join auth.users u on u.id=i.payer_id where i.id=p_invoice and u.email_confirmed_at is not null;
 else select sub.property_id into property from public.places_subscriptions sub where sub.id=p_subscription;select u.email into recipient from public.places_property_members m join auth.users u on u.id=m.user_id where m.property_id=property and m.role='OWNER' and m.status='ACTIVE' and u.email_confirmed_at is not null order by m.verified_at,m.user_id limit 1;end if;
 if recipient is not null and length(recipient)<=254 and recipient ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' then insert into public.notification_deliveries(event_id,channel,audience,recipient,state) values(result,'email','customer',btrim(recipient),'queued');end if;return result;end$$;
revoke all on function shiap_private.enqueue_places_notification(text,text,uuid,uuid) from public,anon,authenticated;grant execute on function shiap_private.enqueue_places_notification(text,text,uuid,uuid) to service_role;
create function shiap_private.places_billing_notification_trigger() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_table_name='places_subscriptions' then if new.origin='TRIAL' and new.status='TRIALING' then perform shiap_private.enqueue_places_notification('places_trial_started','places-trial:'||new.id,null,new.id);end if;
 elsif tg_table_name='places_billing_invoices' then
 if tg_op='INSERT' then perform shiap_private.enqueue_places_notification('places_invoice_created','places-invoice:'||new.id,new.id);
 elsif old.payment_status is distinct from new.payment_status and new.payment_status='PAID' then perform shiap_private.enqueue_places_notification('places_payment_verified','places-paid:'||new.id,new.id);end if;
 elsif tg_table_name='places_billing_proofs' then
 if tg_op='INSERT' then perform shiap_private.enqueue_places_notification('places_proof_received','places-proof:'||new.id,new.invoice_id);
 elsif new.status='REJECTED' and old.status is distinct from new.status then perform shiap_private.enqueue_places_notification('places_payment_rejected','places-rejected:'||new.id,new.invoice_id);end if;end if;return new;end$$;
revoke all on function shiap_private.places_billing_notification_trigger() from public,anon,authenticated;
create trigger places_subscription_notify after insert on public.places_subscriptions for each row execute function shiap_private.places_billing_notification_trigger();
create trigger places_invoice_notify after insert or update on public.places_billing_invoices for each row execute function shiap_private.places_billing_notification_trigger();
create trigger places_proof_notify after insert or update on public.places_billing_proofs for each row execute function shiap_private.places_billing_notification_trigger();
-- Keep original booking eligibility and scheduling intact behind thin domain dispatch wrappers.
alter function shiap_private.notification_eligible(uuid) rename to notification_booking_eligible_v1;
create function shiap_private.notification_eligible(p_event uuid) returns boolean language plpgsql stable security invoker set search_path='' as $$declare e public.notification_events%rowtype;i public.places_billing_invoices%rowtype;s public.places_subscriptions%rowtype;property uuid;begin
 select * into e from public.notification_events where id=p_event;if not found then return false;end if;
 if e.event_type not like 'places_%' then return shiap_private.notification_booking_eligible_v1(p_event);end if;
 if e.created_at<now()-interval '1 day' then return false;end if;
 if e.places_invoice_id is not null then select * into i from public.places_billing_invoices where id=e.places_invoice_id;property:=i.property_id;
 else select * into s from public.places_subscriptions where id=e.places_subscription_id;property:=s.property_id;end if;
 if not exists(select 1 from public.places_property_members m where m.property_id=property and m.role='OWNER' and m.status='ACTIVE') then return false;end if;
 if exists(select 1 from public.notification_deliveries d where d.event_id=e.id and d.channel='email' and not exists(select 1 from public.places_property_members m join auth.users u on u.id=m.user_id where m.property_id=property and m.role='OWNER' and m.status='ACTIVE' and u.email_confirmed_at is not null and btrim(u.email)=d.recipient and (e.places_invoice_id is null or m.user_id=i.payer_id))) then return false;end if;
 return coalesce(case e.event_type
 when 'places_invoice_created' then i.status='OPEN' and i.payment_status='UNPAID' and i.deadline_at>now()
 when 'places_proof_received' then i.status='OPEN' and i.payment_status='PENDING_VERIFICATION'
 when 'places_payment_verified' then i.status='SETTLED' and i.payment_status='PAID'
 when 'places_payment_rejected' then i.status='OPEN' and i.payment_status='REQUIRES_ACTION'
 when 'places_trial_started' then s.status='TRIALING' and s.starts_at<=now() and s.ends_at>now()
 when 'places_subscription_expiring' then s.status in('TRIALING','ACTIVE','SCHEDULED') and s.starts_at<=now() and s.ends_at>now() and s.ends_at<=now()+interval '3 days' and not exists(select 1 from public.places_subscriptions n where n.property_id=s.property_id and n.id<>s.id and n.status in('ACTIVE','SCHEDULED') and n.ends_at>s.ends_at)
 when 'places_subscription_expired' then s.ends_at<=now() and s.ends_at>now()-interval '1 day' and s.status='EXPIRED' and not shiap_private.places_premium_visible(property) else false end,false);end$$;
revoke all on function shiap_private.notification_eligible(uuid) from public,anon,authenticated;grant execute on function shiap_private.notification_eligible(uuid) to service_role;
alter function public.notification_schedule() set schema shiap_private;
alter function shiap_private.notification_schedule() rename to notification_booking_schedule_v1;
create function public.notification_schedule() returns void language plpgsql security invoker set search_path='' as $$declare s record;begin
 perform shiap_private.notification_booking_schedule_v1();
 for s in select id,ends_at from public.places_subscriptions where status in('TRIALING','ACTIVE','SCHEDULED') and starts_at<=now() and ends_at>now() and ends_at<=now()+interval '3 days' loop perform shiap_private.enqueue_places_notification('places_subscription_expiring','places-expiring:'||s.id,null,s.id);end loop;
 for s in update public.places_subscriptions set status='EXPIRED',updated_at=now() where status in('TRIALING','ACTIVE','SCHEDULED') and ends_at<=now() returning id,ends_at loop
 if s.ends_at>now()-interval '1 day' then perform shiap_private.enqueue_places_notification('places_subscription_expired','places-expired:'||s.id,null,s.id);end if;end loop;
 update public.places_billing_invoices set status='EXPIRED',updated_at=now() where status='OPEN' and payment_status in('UNPAID','REQUIRES_ACTION') and deadline_at<=now();
end$$;
revoke all on function public.notification_schedule() from public,anon,authenticated;grant execute on function public.notification_schedule() to service_role;
-- New email types are intentionally NOT appended to email_events: Admin opts in after review.
commit;
