-- Run with psql on the isolated Phase 4B QA database.
begin;
do $$
declare
  owner_id uuid := gen_random_uuid();
  mixed uuid := gen_random_uuid();
  legacy uuid := gen_random_uuid();
begin
  insert into auth.users(id,email) values(owner_id,owner_id||'@unified.invalid');
  insert into public.booking_orders(id,order_number,user_id,customer_name,customer_whatsapp,payment_enabled,inventory_hold_expires_at)
  values(mixed,'QA-UNIFIED-'||mixed,owner_id,'Synthetic','620000000000',false,clock_timestamp()+interval '5 minutes'),
        (legacy,'QA-LEGACY-'||legacy,owner_id,'Synthetic','620000000000',false,clock_timestamp()+interval '5 minutes');
  insert into shiap_private.unified_orders(booking_id,sealed_at) values(mixed,clock_timestamp());
  update public.booking_orders set payment_enabled=true where id=legacy;
  begin
    update public.booking_orders set payment_enabled=true where id=mixed;
    raise exception 'Unchecked direct payment activation succeeded';
  exception when check_violation then
    if sqlerrm not like '%Snapshot harga%' then raise; end if;
  end;
  begin
    update public.booking_orders set order_status='completed' where id=mixed;
    raise exception 'Unchecked direct completion succeeded';
  exception when check_violation then
    if sqlerrm not like '%Seluruh layanan%' then raise; end if;
  end;
  begin
    update public.booking_orders set payment_status='paid' where id=mixed;
    raise exception 'Unchecked direct settlement succeeded';
  exception when check_violation then
    if sqlerrm not like '%belum dibuka%' then raise; end if;
  end;
  begin
    insert into public.booking_payment_records(booking_id,user_id,storage_path,original_file_name,mime_type,file_size)
    values(mixed,owner_id,'synthetic/no-proof.pdf','no-proof.pdf','application/pdf',100);
    raise exception 'Unchecked payment proof succeeded';
  exception when check_violation then null; end;
  begin
    update public.booking_orders set inventory_hold_expires_at=clock_timestamp()+interval '1 month' where id=mixed;
    raise exception 'Unchecked hold extension succeeded';
  exception when check_violation then null; end;
  if has_table_privilege('authenticated','shiap_private.unified_orders','INSERT') or
     has_table_privilege('service_role','shiap_private.unified_order_items','UPDATE') then
    raise exception 'Private gate state exposed';
  end if;
end $$;
rollback;
