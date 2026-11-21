begin;

do $migration$
declare d text; c text;
begin
  d:=pg_get_functiondef('shiap_private.notification_eligible(uuid)'::regprocedure);
  c:=replace(d,$old$from public.notification_settings s
      where s.id and s.email_enabled and e.event_type=any(s.email_events)$old$,
    $new$from public.notification_settings settings
      where settings.id and settings.email_enabled and e.event_type=any(settings.email_events)$new$);
  if d=c then raise exception 'Refund notification settings lookup changed.'; end if;
  execute c;

  d:=pg_get_functiondef('public.admin_manage_unified_refund(uuid,text,uuid,uuid,jsonb)'::regprocedure);
  c:=replace(d,$old$bank_id ~ '[[:cntrl:]]' or length(reference)>160$old$,
    $new$bank_id ~ '[[:cntrl:]]' or bank_id=bank.source_transaction_id or length(reference)>160$new$);
  if d=c then raise exception 'Refund bank identity lookup changed.'; end if;
  execute c;

  d:=pg_get_functiondef('public.admin_unified_refund_report(uuid)'::regprocedure);
  c:=replace(d,$old$p.source_transaction_id as bank_id,p.display_reference as bank_reference,p.occurred_at as paid_at,
      a.action as last_action$old$,
    $new$p.source_transaction_id as bank_id,p.display_reference as bank_reference,p.occurred_at as paid_at,p.evidence_path,
      coalesce((select jsonb_agg(to_jsonb(h) order by h.occurred_at desc,h.action) from (
        select v.action,v.actor_id,v.old_status,v.new_status,v.input->>'reason' as reason,v.occurred_at
        from shiap_private.unified_refund_actions v where v.refund_id=r.id order by v.occurred_at desc limit 30
      ) h),'[]'::jsonb) as history,
      a.action as last_action$new$);
  if d=c then raise exception 'Refund history projection changed.'; end if;
  execute c;
end $migration$;

commit;
