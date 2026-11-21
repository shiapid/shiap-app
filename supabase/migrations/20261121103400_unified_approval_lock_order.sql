begin;

-- Both mixed approval paths lock the parent before the inventory resources.
-- Keep the legacy Stay order unchanged.
do $migration$
declare definition text; corrected text;
begin
  definition:=pg_get_functiondef('public.manage_stay_partner_item(uuid,text,text,uuid[])'::regprocedure);
  corrected:=replace(definition,$old$  if p_action in ('APPROVE','CHECK_IN') then$old$,
    $new$  mixed:=exists(select 1 from shiap_private.unified_orders where booking_id=item.order_id);
  if p_action in ('APPROVE','CHECK_IN') and not mixed then$new$);
  if corrected=definition then raise exception 'Stay approval lock baseline differs.'; end if;
  definition:=corrected;
  corrected:=replace(definition,$old$  mixed:=exists(select 1 from shiap_private.unified_orders where booking_id=b.id);$old$,
    $new$  if mixed and p_action in ('APPROVE','CHECK_IN') then
    if not pg_try_advisory_xact_lock(hashtextextended('shiap-calendar:stay',0)) then
      raise exception 'Inventori Stay sedang diperbarui. Coba lagi.' using errcode='40001';
    end if;
    select * into c from public.stay_partner_booking_config where property_id=item.property_id;
  end if;$new$);
  if corrected=definition then raise exception 'Unified Stay parent lock baseline differs.'; end if;
  execute corrected;
end $migration$;

commit;
