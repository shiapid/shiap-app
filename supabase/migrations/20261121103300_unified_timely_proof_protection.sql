begin;

-- A timely proof reserves the service items until the existing Finance review
-- resolves it. Manual parent cancellation must not discard that reservation.
do $migration$
declare definition text; corrected text;
begin
  definition:=pg_get_functiondef('shiap_private.guard_unified_parent()'::regprocedure);
  corrected:=replace(definition,$old$new.payment_enabled:=false;$old$,
    $new$if old.order_status is distinct from new.order_status and old.payment_status='pending'
        and exists(select 1 from public.booking_payment_records p where p.booking_id=old.id and p.status='pending') then
      raise exception 'Selesaikan pemeriksaan bukti transfer sebelum membatalkan pesanan gabungan.' using errcode='23514';
    end if;
    new.payment_enabled:=false;$new$);
  if corrected=definition then raise exception 'Unified proof protection differs from the audited baseline.'; end if;
  execute corrected;
end $migration$;

commit;
