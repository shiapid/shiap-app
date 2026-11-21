begin;

-- Refactor the installed cores in place, failing the migration if the audited
-- definitions differ. Public legacy calls always select the legacy mode.
create function pg_temp.unified_replace(p_source text,p_old text,p_new text) returns text
language plpgsql as $$
begin
  if length(p_source)-length(replace(p_source,p_old,''))<>length(p_old) then
    raise exception 'Unified checkout baseline differs near: %',left(p_old,160);
  end if;
  return replace(p_source,p_old,p_new);
end $$;

do $migration$
declare definition text;
begin
  definition:=replace(pg_get_functiondef('public.create_booking_order(text,text,text,text,jsonb)'::regprocedure),chr(13),'');
  definition:=pg_temp.unified_replace(definition,'FUNCTION public.create_booking_order(','FUNCTION shiap_private.create_booking_order_core(');
  definition:=pg_temp.unified_replace(definition,'p_items jsonb)','p_items jsonb, p_mixed boolean)');
  definition:=pg_temp.unified_replace(definition,
    'customer_notes,inventory_hold_expires_at,service_fee_version)',
    'customer_notes,inventory_hold_expires_at,service_fee_version,payment_enabled)');
  definition:=pg_temp.unified_replace(definition,
    $old$clock_timestamp()+interval '15 minutes',1)$old$,
    $new$clock_timestamp()+interval '15 minutes',1,not p_mixed)$new$);
  definition:=pg_temp.unified_replace(definition,
    'for item in select value from jsonb_array_elements(p_items) as e(value) loop',
    $new$if p_mixed then insert into shiap_private.unified_orders(booking_id) values(oid); end if;
  for item in select value from jsonb_array_elements(p_items) with ordinality as e(value,position)
    order by case when p_mixed then case value->>'service_type' when 'stay' then 1 when 'trip' then 2 else 3 end end,position
  loop$new$);
  execute definition;
end $migration$;

create or replace function public.create_booking_order(
  p_customer_name text,p_customer_whatsapp text,p_customer_email text,p_customer_notes text,p_items jsonb
) returns table(id uuid,order_number text)
language sql security definer set search_path = '' as $$
  select * from shiap_private.create_booking_order_core(p_customer_name,p_customer_whatsapp,p_customer_email,p_customer_notes,p_items,false)
$$;
revoke all on function shiap_private.create_booking_order_core(text,text,text,text,jsonb,boolean)
  from public,anon,authenticated,service_role;

do $migration$
declare definition text;
begin
  definition:=replace(pg_get_functiondef('public.create_experience_booking_order(uuid,uuid,date,integer,text,text,text,text,jsonb,jsonb,jsonb,boolean)'::regprocedure),chr(13),'');
  definition:=pg_temp.unified_replace(definition,'FUNCTION public.create_experience_booking_order(','FUNCTION shiap_private.create_experience_booking_core(');
  definition:=pg_temp.unified_replace(definition,'p_safety_consent boolean)','p_safety_consent boolean, p_other_items jsonb)');
  definition:=pg_temp.unified_replace(definition,'from public.create_booking_order(','from shiap_private.create_booking_order_core(');
  definition:=pg_temp.unified_replace(definition,
    $old$jsonb_build_array(jsonb_build_object('service_type','activity','service_catalog_id',k.catalog_service_id,'service_name',p.title,'variant',k.title,'date_start',item_date,'quantity',quantity,'guests',p_guests,'notes',left(coalesce(p_customer_notes,''),1000),'selected_addons',selected_ids))$old$,
    $new$coalesce(p_other_items,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('service_type','activity','service_catalog_id',k.catalog_service_id,'service_name',p.title,'variant',k.title,'date_start',item_date,'quantity',quantity,'guests',p_guests,'notes',left(coalesce(p_customer_notes,''),1000),'selected_addons',selected_ids)),p_other_items is not null$new$);
  definition:=pg_temp.unified_replace(definition,'where booking_id=order_id order by created_at desc limit 1;',
    $new$where booking_id=order_id and service_type='activity' and service_catalog_id=k.catalog_service_id order by id limit 1;$new$);
  definition:=pg_temp.unified_replace(definition,'if manual then update public.booking_orders',
    'if manual and p_other_items is null then update public.booking_orders');
  execute definition;
end $migration$;

create or replace function public.create_experience_booking_order(
  p_package_id uuid,p_session_id uuid,p_date date,p_guests integer,
  p_customer_name text,p_customer_whatsapp text,p_customer_email text,p_customer_notes text,
  p_participants jsonb,p_addon_slugs jsonb,p_request_details jsonb,p_safety_consent boolean
) returns table(id uuid,order_number text)
language sql security definer set search_path = '' as $$
  select * from shiap_private.create_experience_booking_core(p_package_id,p_session_id,p_date,p_guests,p_customer_name,
    p_customer_whatsapp,p_customer_email,p_customer_notes,p_participants,p_addon_slugs,p_request_details,p_safety_consent,null)
$$;
revoke all on function shiap_private.create_experience_booking_core(uuid,uuid,date,integer,text,text,text,text,jsonb,jsonb,jsonb,boolean,jsonb)
  from public,anon,authenticated,service_role;

-- Scope the existing prohibition to legacy parents. Only the private core
-- above can create the marker that identifies a secure mixed checkout.
do $migration$
declare definition text;
begin
  definition:=pg_get_functiondef('shiap_private.guard_stay_partner_item_scope()'::regprocedure);
  execute pg_temp.unified_replace(definition,
    'if exists(select 1 from public.stay_partner_fulfillment p where p.order_id=new.booking_id) then',
    'if exists(select 1 from public.stay_partner_fulfillment p where p.order_id=new.booking_id) and
      not exists(select 1 from shiap_private.unified_orders where booking_id=new.booking_id and sealed_at is null) then');

  definition:=pg_get_functiondef('shiap_private.prepare_stay_partner_item()'::regprocedure);
  definition:=pg_temp.unified_replace(definition,
    'if exists(select 1 from public.stay_partner_fulfillment where order_id=new.booking_id) then',
    'if exists(select 1 from public.stay_partner_fulfillment where order_id=new.booking_id) and
      not exists(select 1 from shiap_private.unified_orders where booking_id=new.booking_id and sealed_at is null) then');
  definition:=pg_temp.unified_replace(definition,
    'if exists(select 1 from public.booking_items where booking_id=new.booking_id and id<>new.id) then',
    'if exists(select 1 from public.booking_items where booking_id=new.booking_id and id<>new.id) and
      not exists(select 1 from shiap_private.unified_orders where booking_id=new.booking_id and sealed_at is null) then');
  execute definition;
end $migration$;

create function shiap_private.seal_unified_checkout(p_booking uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  b public.booking_orders%rowtype;
  item record;
  vendor uuid;
  vendor_kind text;
  cat text;
  subtotal bigint;
  fee bigint;
  n integer:=0;
  requires_review boolean:=false;
  unavailable text;
begin
  select * into strict b from public.booking_orders where id=p_booking for update;
  for item in
    select i.*, f.mode,f.agreement_id,f.agreement_version,f.status as stay_status,f.check_in_at,
      c.places_id,e.product_id as exp_product,e.request_status,e.session_id
    from public.booking_items i
    left join public.stay_partner_fulfillment f on f.item_id=i.id
    left join public.stay_partner_booking_config c on c.property_id=f.property_id
    left join public.shiap_experience_booking_records e on e.booking_item_id=i.id
    where i.booking_id=b.id order by i.id
  loop
    n:=n+1;
    if item.service_type='stay' then
      if item.places_id is null or item.check_in_at<=clock_timestamp() then
        raise exception 'Pilih properti Stay Partner aktif dengan tanggal check-in mendatang.';
      end if;
      vendor:=item.places_id; vendor_kind:='places_property';
      requires_review:=requires_review or item.stay_status='REQUESTED';
    elsif item.service_type='trip' then
      if not exists(select 1 from public.trip_departures d where d.id=item.departure_id
        and d.trip_id=item.trip_id and d.departure_date=item.date_start and d.removed_at is null
        and (d.departure_date+coalesce(d.departure_time,time '00:00')) at time zone 'Asia/Makassar'>clock_timestamp()) then
        raise exception 'Jadwal Trip untuk checkout gabungan harus memiliki tanggal keberangkatan yang valid.';
      end if;
      select v.id into vendor from public.internal_vendor_contacts v where v.trip_id=item.trip_id;
      vendor_kind:=case when vendor is null then 'shiap' else 'catalog_vendor' end;
    elsif item.service_type='activity' and item.exp_product is not null then
      select v.id into vendor from public.internal_vendor_contacts v where v.experience_id=item.exp_product or v.catalog_id=item.service_catalog_id
        order by v.experience_id nulls last, v.id limit 1;
      vendor_kind:=case when vendor is null then 'shiap' else 'catalog_vendor' end;
      requires_review:=requires_review or item.request_status='pending';
    else
      raise exception 'Checkout gabungan hanya mendukung Stay Partner, Trip, dan Experience.';
    end if;
    cat:=case when coalesce(item.service_category,'other')='other' then item.service_type else item.service_category end;
    subtotal:=round(case when item.service_type='trip' or item.price_basis='per_person' then item.unit_price*item.guests*item.quantity
          when item.service_type='stay' then item.unit_price*greatest(item.date_end-item.date_start,1)*item.quantity
          else item.unit_price*item.quantity end)::bigint;
    select (f->>'fee')::bigint into fee from jsonb_array_elements(b.service_fee_snapshot) f where f->>'category'=cat;
    if fee is null then raise exception 'Snapshot biaya layanan tidak tersedia.'; end if;
    insert into shiap_private.unified_order_items(item_id,booking_id,service,product_id,vendor_kind,vendor_id,unit_price,
        subtotal_idr,service_fee_idr,commission_bps,partner_agreement_id,partner_agreement_version)
    values(item.id,b.id,case when item.service_type='activity' then 'experience' else item.service_type end,
      coalesce(item.trip_id,item.property_id,item.exp_product),vendor_kind,coalesce(vendor,'00000000-0000-0000-0000-000000000000'),
      item.unit_price,subtotal,fee,case when item.service_type='stay' then 1500 else 0 end,item.agreement_id,item.agreement_version);
  end loop;
  if n not between 2 and 3 then raise exception 'Pilih dua atau tiga layanan berbeda.'; end if;
  if requires_review then
    update public.booking_orders set inventory_hold_expires_at=clock_timestamp()+interval '24 hours'
    where id=b.id;
  end if;
  update shiap_private.unified_orders set sealed_at=clock_timestamp() where booking_id=b.id;
  unavailable:=shiap_private.unified_payment_error(b.id,false);
  if unavailable is not null and not (requires_review and unavailable='Persetujuan semua layanan diperlukan sebelum pembayaran.') then
    raise exception '%',unavailable using errcode='23514';
  end if;
  perform shiap_private.unified_refresh_payment(b.id);
end $$;

create function shiap_private.create_unified_booking(p_payload jsonb) returns table(id uuid,order_number text)
language plpgsql security definer set search_path = '' as $$
declare
  source jsonb := coalesce(p_payload->'p_items','[]'::jsonb);
  e jsonb := p_payload->'experience';
  normalized jsonb := '[]'::jsonb;
  i jsonb;
  kind text;
  launch_id uuid;
  launch_code text;
  product_name text;
  customer text:=p_payload->>'p_customer_name';
  phone text:=p_payload->>'p_customer_whatsapp';
  email text:=p_payload->>'p_customer_email';
  notes text:=p_payload->>'p_customer_notes';
begin
  if auth.uid() is null then raise exception 'Masuk ke akun untuk checkout gabungan.' using errcode='42501'; end if;
  if jsonb_typeof(source)<>'array' or (e is not null and jsonb_typeof(e)<>'object') then
    raise exception 'Daftar layanan tidak valid.';
  end if;
  if jsonb_array_length(source)+(e is not null)::integer not between 2 and 3
    or (select count(distinct x->>'service_type') from jsonb_array_elements(source) x)<>jsonb_array_length(source) then
    raise exception 'Pilih dua atau tiga layanan berbeda.';
  end if;
  if length(customer)>120 or length(phone)>32 or length(email)>200 or length(notes)>1000 then
    raise exception 'Data pemesan terlalu panjang.';
  end if;
  for i in select value from jsonb_array_elements(source) loop
    kind:=i->>'service_type';
    if kind='stay' then
      select p.name into product_name from public.stay_properties p where p.id=(i->>'property_id')::uuid;
      normalized:=normalized||jsonb_build_array(jsonb_build_object('service_type','stay','service_name',product_name,
        'property_id',i->>'property_id','room_type_id',i->>'room_type_id','date_start',i->>'date_start',
        'date_end',i->>'date_end','quantity',i->>'quantity','guests',i->>'guests','selected_addons',i->'selected_addons'));
    elsif kind='trip' then
      select p.title into product_name from public.trip_packages p where p.id=(i->>'trip_id')::uuid;
      if i->>'departure_id' is null then raise exception 'Pilih jadwal Trip.'; end if;
      normalized:=normalized||jsonb_build_array(jsonb_build_object('service_type','trip','service_name',product_name,
        'trip_id',i->>'trip_id','departure_id',i->>'departure_id','date_start',i->>'date_start','quantity',1,'guests',i->>'guests'));
    else
      raise exception 'Jenis layanan belum didukung checkout gabungan.';
    end if;
  end loop;
  if e is not null then
    select x.id,x.order_number into strict launch_id,launch_code from shiap_private.create_experience_booking_core(
      (e->>'p_package_id')::uuid,nullif(e->>'p_session_id','')::uuid,(e->>'p_date')::date,(e->>'p_guests')::integer,
      customer,phone,email,notes,e->'p_participants',e->'p_addon_slugs',e->'p_request_details',(e->>'p_safety_consent')::boolean,normalized
    ) x;
  else
    select x.id,x.order_number into strict launch_id,launch_code from shiap_private.create_booking_order_core(
      customer,phone,email,notes,normalized,true
    ) x;
  end if;
  perform shiap_private.seal_unified_checkout(launch_id);
  return query select launch_id,launch_code;
end $$;
revoke all on function shiap_private.seal_unified_checkout(uuid),shiap_private.create_unified_booking(jsonb)
from public,anon,authenticated,service_role;

do $migration$
declare definition text;
begin
  definition:=replace(pg_get_functiondef('public.checkout_booking(uuid,text,uuid,jsonb,text)'::regprocedure),chr(13),'');
  definition:=pg_temp.unified_replace(definition,$old$p_kind not in ('booking','experience')$old$,$new$p_kind not in ('booking','experience','unified')$new$);
  definition:=pg_temp.unified_replace(definition,$old$  else
    select x.id,x.order_number into created_id,created_code from public.create_experience_booking_order($old$,$new$  elsif p_kind='unified' then
    select x.id,x.order_number into created_id,created_code from shiap_private.create_unified_booking(p_payload) x;
  else
    select x.id,x.order_number into created_id,created_code from public.create_experience_booking_order($new$);
  execute definition;
end $migration$;

create or replace function public.admin_review_experience_request(p_record_id uuid,p_decision text,p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.shiap_experience_booking_records%rowtype; b public.booking_orders%rowtype; mixed boolean;
begin
  if auth.uid() is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.' using errcode='42501'; end if;
  if p_decision is null or p_decision not in ('approve','reject') then raise exception 'Keputusan tidak valid.'; end if;
  select * into r from public.shiap_experience_booking_records where id=p_record_id;
  if not found then raise exception 'Permintaan tidak ditemukan.'; end if;
  select * into strict b from public.booking_orders where id=r.booking_id for update;
  select * into strict r from public.shiap_experience_booking_records where id=p_record_id for update;
  if r.request_status<>'pending' then raise exception 'Permintaan sudah diproses.'; end if;
  if b.order_status not in ('pending_confirmation','confirmed') then raise exception 'Status booking tidak dapat ditinjau.'; end if;
  mixed:=exists(select 1 from shiap_private.unified_orders where booking_id=b.id);
  if p_decision='approve' and (b.inventory_hold_expires_at is null or b.inventory_hold_expires_at<=clock_timestamp()
    or (mixed and (b.payment_status<>'unpaid' or b.order_status<>'pending_confirmation'))) then
    raise exception 'Hold permintaan Experience sudah kedaluwarsa atau tidak valid.' using errcode='23514';
  end if;
  update public.shiap_experience_booking_records set request_status=case when p_decision='approve' then 'approved' else 'rejected' end,
    reviewed_at=now(),reviewed_by=auth.uid(),review_note=nullif(left(coalesce(p_note,''),1000),'') where id=r.id;
  if p_decision='reject' then
    update public.booking_orders set order_status='rejected',payment_enabled=false,inventory_hold_expires_at=null where id=b.id;
  elsif mixed then
    perform shiap_private.unified_refresh_payment(b.id);
  else
    update public.booking_orders set payment_enabled=true,inventory_hold_expires_at=clock_timestamp()+interval '15 minutes' where id=b.id;
  end if;
  insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,from_status,to_status,note)
  values(b.id,auth.uid(),'admin','experience_request_'||p_decision,b.order_status,
    case when p_decision='reject' then 'rejected' else b.order_status end,left(coalesce(p_note,'Permintaan Experience ditinjau admin.'),1000));
end $$;

do $migration$
declare definition text;
begin
  definition:=replace(pg_get_functiondef('public.manage_stay_partner_item(uuid,text,text,uuid[])'::regprocedure),chr(13),'');
  definition:=pg_temp.unified_replace(definition,'v_status text; v_room uuid; v_quantity integer;',
    'v_status text; v_room uuid; v_quantity integer; mixed boolean;');
  definition:=pg_temp.unified_replace(definition,
    'select * into b from public.booking_orders where id=item.order_id for update;',
    'select * into b from public.booking_orders where id=item.order_id for update;
  mixed:=exists(select 1 from shiap_private.unified_orders where booking_id=b.id);');
  definition:=pg_temp.unified_replace(definition,
    $old$update public.booking_orders set payment_enabled=true,inventory_hold_expires_at=clock_timestamp()+interval '15 minutes' where id=b.id;$old$,
    $new$if mixed then
          perform shiap_private.unified_refresh_payment(b.id);
        else
          update public.booking_orders set payment_enabled=true,inventory_hold_expires_at=clock_timestamp()+interval '15 minutes' where id=b.id;
        end if;$new$);
  definition:=pg_temp.unified_replace(definition,
    $old$when 'COMPLETED' then update public.booking_orders set order_status='completed' where id=b.id;$old$,
    $new$when 'COMPLETED' then
        if mixed then perform shiap_private.unified_complete_parent(b.id);
        else update public.booking_orders set order_status='completed' where id=b.id; end if;$new$);
  definition:=pg_temp.unified_replace(definition,
    $old$where item_id=p_item;
  else
    case p_action$old$,
    $new$where item_id=p_item;
    if mixed and b.payment_status='unpaid' then perform shiap_private.unified_refresh_payment(b.id); end if;
  else
    case p_action$new$);
  execute definition;
end $migration$;

create function public.admin_complete_unified_service(p_item uuid,p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s shiap_private.unified_order_items%rowtype;
  b public.booking_orders%rowtype;
  end_service timestamptz;
begin
  if auth.uid() is null or not public.is_shiap_admin() then raise exception 'Akses Admin diperlukan.' using errcode='42501'; end if;
  if coalesce(length(btrim(p_note)),0) not between 10 and 500 then
    raise exception 'Catat bukti layanan terpenuhi (10–500 karakter).' using errcode='22023';
  end if;
  select * into s from shiap_private.unified_order_items where item_id=p_item;
  if not found or s.service='stay' then raise exception 'Gunakan alur operasional Stay untuk layanan ini.' using errcode='22023'; end if;
  select * into strict b from public.booking_orders where id=s.booking_id for update;
  select * into strict s from shiap_private.unified_order_items where item_id=p_item for update;
  if s.fulfillment='COMPLETED' then return; end if;
  if b.order_status<>'confirmed' or b.payment_status<>'paid' then
    raise exception 'Konfirmasi booking dan pembayaran penuh terlebih dahulu.' using errcode='23514';
  end if;
  if s.service='trip' then
    select ((greatest(i.date_start,coalesce(d.end_date,i.date_start))+1)::timestamp at time zone 'Asia/Makassar')
      into end_service from public.booking_items i join public.trip_departures d on d.id=i.departure_id
      where i.id=p_item and d.status<>'cancelled' and d.removed_at is null;
  else
    select coalesce(v.ends_at,((i.date_start+1)::timestamp at time zone 'Asia/Makassar')) into end_service
      from public.booking_items i join public.shiap_experience_booking_records e on e.booking_item_id=i.id
      left join public.shiap_experience_sessions v on v.id=e.session_id
      where i.id=p_item and e.request_status in ('approved','not_required')
        and (e.session_id is null or (v.status<>'cancelled' and v.weather_status<>'blocked'));
  end if;
  if end_service is null or end_service>clock_timestamp() then
    raise exception 'Jadwal layanan belum selesai atau tidak berlaku.' using errcode='23514';
  end if;
  update shiap_private.unified_order_items set fulfillment='COMPLETED',completed_at=clock_timestamp(),
    completed_by=auth.uid(),completion_note=btrim(p_note) where item_id=p_item;
  insert into public.booking_order_events(booking_id,actor_user_id,actor_role,event_type,note)
    values(b.id,auth.uid(),'admin','unified_service_completed','Pemenuhan layanan telah diperiksa Admin.');
  perform shiap_private.unified_complete_parent(b.id);
end $$;
revoke all on function public.admin_complete_unified_service(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_complete_unified_service(uuid,text) to authenticated;

-- Kept off the public Data API. The Next.js handler already checks exact order ownership.
create function public.server_unified_booking_view(p_booking uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.booking_orders%rowtype; available boolean := false; lines jsonb;
begin
  if not exists(select 1 from shiap_private.unified_orders where booking_id=p_booking) then return null; end if;
  select * into strict b from public.booking_orders where id=p_booking for update;
  if b.payment_enabled and b.order_status='pending_confirmation' and b.payment_status='unpaid' then
    available:=shiap_private.unified_payment_error(p_booking,false) is null;
  end if;
  select jsonb_agg(jsonb_build_object(
    'item_id',s.item_id,'service',s.service,'subtotal',s.subtotal_idr,'fee',s.service_fee_idr,
    'approval',case when s.service='stay' then case f.status when 'REQUESTED' then 'pending'
        when 'REJECTED' then 'rejected' when 'CANCELLED' then 'cancelled' else 'approved' end
      when s.service='experience' then e.request_status else 'not_required' end,
    'fulfillment',coalesce(f.status,s.fulfillment),
    'reservation',case when b.order_status='expired' or (b.payment_status='unpaid' and b.inventory_hold_expires_at<=clock_timestamp()) then 'expired'
      when b.order_status in ('cancelled','rejected') then 'released'
      when b.payment_status='paid' then 'reserved' else 'held' end
  ) order by s.service) into lines
  from shiap_private.unified_order_items s
  left join public.stay_partner_fulfillment f on f.item_id=s.item_id
  left join public.shiap_experience_booking_records e on e.booking_item_id=s.item_id where s.booking_id=b.id;
  return jsonb_build_object('payment_available',available,'items',coalesce(lines,'[]'::jsonb));
end $$;
revoke all on function public.server_unified_booking_view(uuid) from public,anon,authenticated,service_role;
grant execute on function public.server_unified_booking_view(uuid) to service_role;


-- Check inventory even while an item is still awaiting approval.
do $migration$
declare definition text;
begin
  definition:=pg_get_functiondef('shiap_private.unified_payment_error(uuid,boolean)'::regprocedure);
  definition:=pg_temp.unified_replace(definition,$early$  if exists (
    select 1 from shiap_private.unified_order_items s
    left join public.stay_partner_fulfillment f on f.item_id=s.item_id
    left join public.shiap_experience_booking_records e on e.booking_item_id=s.item_id
    where s.booking_id=b.id and (
      (s.service='stay' and (f.status is distinct from 'AWAITING_PAYMENT' or f.operational_hold)) or
      (s.service='experience' and (e.request_status is null or e.request_status not in ('approved','not_required')))
    )
  ) then return 'Persetujuan semua layanan diperlukan sebelum pembayaran.'; end if;
$early$,'');
  definition:=pg_temp.unified_replace(definition,$tail$  return null;
end$tail$,$last$  if exists (
    select 1 from shiap_private.unified_order_items s
    left join public.stay_partner_fulfillment f on f.item_id=s.item_id
    left join public.shiap_experience_booking_records e on e.booking_item_id=s.item_id
    where s.booking_id=b.id and (
      (s.service='stay' and (f.status is distinct from 'AWAITING_PAYMENT' or f.operational_hold)) or
      (s.service='experience' and (e.request_status is null or e.request_status not in ('approved','not_required')))
    )
  ) then return 'Persetujuan semua layanan diperlukan sebelum pembayaran.'; end if;

  return null;
end$last$);
  execute definition;
end $migration$;

commit;
