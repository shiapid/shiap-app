-- Local-only finance contract check. Fixtures are removed before the statement commits.
do $$
declare
  v_admin_id uuid:=gen_random_uuid();
  v_booking_id uuid:=gen_random_uuid();
  v_first_item uuid:=gen_random_uuid();
  v_second_item uuid:=gen_random_uuid();
  v_third_item uuid:=gen_random_uuid();
  v_payment_id uuid;
  v_duplicate_payment_id uuid;
  v_service_expense_id uuid;
  v_cost_total numeric;
  v_recognized numeric;
  v_gross_sales numeric;
  v_discount numeric;
  v_net_sales numeric;
  v_estimated_cost numeric;
  v_actual_cost numeric;
  v_profit_margin numeric;
  v_contribution numeric;
  v_service_cost_before numeric;
  v_service_cost_after numeric;
  v_received numeric;
  v_refunded numeric;
  v_payment_enabled boolean;
begin
  if (select relrowsecurity from pg_class where oid='public.finance_cost_templates'::regclass) is distinct from true then
    raise exception 'Finance cost template RLS is disabled.';
  end if;
  if (select public from storage.buckets where id='shiap-finance-receipts') is distinct from false then
    raise exception 'Finance receipt bucket must remain private.';
  end if;
  if has_table_privilege('anon','public.finance_cost_templates','select') then
    raise exception 'Anonymous role can read finance cost templates.';
  end if;
  if has_function_privilege('anon','public.finance_record_transaction(uuid,text,numeric,text,text,text)','execute') then
    raise exception 'Anonymous role can write finance transactions.';
  end if;

  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(v_admin_id,'authenticated','authenticated',v_admin_id::text||'@finance.local.test','',now(),'{}','{}',now(),now());
  insert into public.admin_users(user_id) values(v_admin_id);
  select is_active into v_payment_enabled from public.payment_settings where id=true;
  update public.payment_settings set is_active=true where id=true;
  insert into public.finance_cost_templates(name,service_type,cost_basis,amount,created_by)
  values('Finance Smoke Fixed','trip','fixed_per_booking',10,v_admin_id),
        ('Finance Smoke Participant','trip','per_participant',5,v_admin_id),
        ('Finance Smoke Hourly','other','per_hour',3,v_admin_id);
  insert into public.booking_orders(id,order_number,user_id,customer_name,customer_whatsapp,order_status,payment_status,total_amount)
  values(v_booking_id,'SH-FINANCE-SMOKE-'||replace(v_booking_id::text,'-',''),v_admin_id,'Synthetic Finance Customer','+620000000000','confirmed','unpaid',300);
  insert into public.booking_items(id,booking_id,service_type,service_name,date_start,quantity,guests,unit_price,price_basis,variant)
  values(v_first_item,v_booking_id,'trip','Synthetic Trip',(current_date+30),1,2,100,'per_person','Open Trip'),
        (v_second_item,v_booking_id,'trip','Synthetic Trip 2',(current_date+31),1,1,100,'per_person','Open Trip'),
        (v_third_item,v_booking_id,'other','Synthetic Hourly',(current_date+32),1,1,100,'per_unit','2 jam');
  select sum(s.estimated_cost) into v_cost_total from public.finance_booking_cost_snapshots s where s.booking_id=v_booking_id;
  if v_cost_total<>31 then raise exception 'Cost snapshot expected 31 including the 2-hour basis, got %.',v_cost_total; end if;

  perform set_config('request.jwt.claim.sub',v_admin_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform public.finance_record_transaction(v_booking_id,'discount',50,'finance-smoke-discount-1','Synthetic discount for ledger QA',null);
  select gross_sales,discount_amount,net_sales into v_gross_sales,v_discount,v_net_sales from public.finance_booking_profit_v where id=v_booking_id;
  if v_gross_sales<>350 or v_discount<>50 or v_net_sales<>300 then raise exception 'Gross sales, discount, or net sales reconciliation is incorrect.'; end if;
  begin
    perform public.finance_record_transaction(v_booking_id,'payment',125,'finance-smoke-partial-1','Partial payment','SMOKE-PARTIAL-REF');
    raise exception 'Partial payment was accepted under the full-payment policy.';
  exception when others then
    if sqlerrm not like '%tepat 100%% total booking%' then raise; end if;
  end;
  v_payment_id:=public.finance_record_transaction(v_booking_id,'payment',300,'finance-smoke-payment-1','Full payment','SMOKE-FULL-REF');
  v_duplicate_payment_id:=public.finance_record_transaction(v_booking_id,'payment',300,'finance-smoke-payment-1','Retry duplicate','SMOKE-FULL-REF');
  if v_payment_id<>v_duplicate_payment_id then raise exception 'Idempotency key did not return the original entry.'; end if;
  if (select payment_status from public.booking_orders where id=v_booking_id)<>'paid' then raise exception 'Fully paid ledger did not synchronize booking payment status.'; end if;
  begin
    perform public.finance_record_transaction(v_booking_id,'payment',1,'finance-smoke-overpay','Must reject','SMOKE-OVERPAY-REF');
    raise exception 'Overpayment was accepted.';
  exception when others then
    if sqlerrm not like '%histori pembayaran sebelumnya%' then raise; end if;
  end;

  update public.booking_orders set order_status='cancelled' where id=v_booking_id;
  select recognized_revenue into v_recognized from public.finance_booking_profit_v where id=v_booking_id;
  if v_recognized<>0 then raise exception 'Cancelled booking was counted as recognized revenue.'; end if;
  update public.booking_orders set order_status='completed' where id=v_booking_id;
  insert into public.finance_expenses(booking_id,booking_item_id,service_type,category_id,description,amount,status,created_by,reviewed_by,reviewed_at)
  values(v_booking_id,v_first_item,'trip','operations','Synthetic actual cost',400,'pending',v_admin_id,null,null);
  select estimated_direct_cost,actual_direct_cost into v_estimated_cost,v_actual_cost from public.finance_booking_profit_v where id=v_booking_id;
  if v_estimated_cost<>31 or v_actual_cost<>0 then raise exception 'Pending actual expense was recognized or estimated cost changed.'; end if;
  update public.finance_expenses set status='approved',reviewed_by=v_admin_id,reviewed_at=now() where booking_id=v_booking_id;
  perform public.finance_record_transaction(v_booking_id,'refund',30,'finance-smoke-refund-1','Partial refund',null);
  select recognized_revenue,contribution_profit,estimated_direct_cost,actual_direct_cost,profit_margin
    into v_recognized,v_contribution,v_estimated_cost,v_actual_cost,v_profit_margin
    from public.finance_booking_profit_v where id=v_booking_id;
  if v_recognized<>270 then raise exception 'Refund was not deducted from recognized sales; got %.',v_recognized; end if;
  if v_contribution<>-130 then raise exception 'Negative contribution margin was not preserved; got %.',v_contribution; end if;
  if v_estimated_cost<>31 or v_actual_cost<>400 or v_profit_margin<>-48.15 then raise exception 'Estimated/actual profit or margin reconciliation is incorrect.'; end if;
  select cash_received,refunds into v_received,v_refunded from public.finance_booking_profit_v where id=v_booking_id;
  if v_received<>300 or v_refunded<>30 then raise exception 'Cashflow ledger totals are incorrect.'; end if;
  if (select receivable from public.finance_booking_profit_v where id=v_booking_id)<>0 then
    raise exception 'Refund incorrectly created a customer receivable.';
  end if;
  select actual_direct_cost into v_service_cost_before from public.finance_service_profit_v where service_type='other';
  insert into public.finance_expenses(service_type,category_id,description,amount,status,created_by)
  values('other','operations','Synthetic service scoped cost',47,'pending',v_admin_id) returning id into v_service_expense_id;
  update public.finance_expenses set status='approved',reviewed_by=v_admin_id,reviewed_at=now() where id=v_service_expense_id;
  select actual_direct_cost into v_service_cost_after from public.finance_service_profit_v where service_type='other';
  if coalesce(v_service_cost_after,0)-coalesce(v_service_cost_before,0)<>47 then
    raise exception 'Approved service-scoped expense was not included in service profit.';
  end if;
  if not exists(select 1 from public.finance_expense_audit a join public.finance_expenses e on e.id=a.expense_id where e.booking_id=v_booking_id) then
    raise exception 'Expense audit history was not recorded.';
  end if;

  delete from public.finance_expense_audit where expense_id in(select id from public.finance_expenses where booking_id=v_booking_id);
  delete from public.finance_expense_audit where expense_id=v_service_expense_id;
  delete from public.finance_cost_recalculation_audit where booking_id=v_booking_id;
  delete from public.finance_transaction_entries where booking_id=v_booking_id;
  delete from public.finance_expenses where booking_id=v_booking_id;
  delete from public.finance_expenses where id=v_service_expense_id;
  delete from public.finance_booking_cost_snapshots where booking_id=v_booking_id;
  delete from public.booking_items where booking_id=v_booking_id;
  delete from public.booking_orders where id=v_booking_id;
  delete from public.finance_cost_templates where name like 'Finance Smoke %';
  delete from public.admin_users where user_id=v_admin_id;
  delete from auth.users where id=v_admin_id;
  update public.payment_settings set is_active=v_payment_enabled where id=true;
  raise notice 'Finance local smoke passed: gross sales, discounts, estimated vs actual costs, contribution profit and margin, full-only payment, idempotency, duplicate-payment guard, cancellations, refunds, expense audit, RLS, private receipt bucket.';
end $$;
