-- SISAI V1: private source archive, admin-only workflow, and atomic Trip publish.
-- Additive only; no existing booking or inventory objects are changed.
begin;

create table public.sisai_imports (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('processing','draft','review','approved','published','failed')),
  source_files jsonb not null default '[]'::jsonb check (jsonb_typeof(source_files)='array'),
  extracted_data jsonb not null default '{}'::jsonb check (jsonb_typeof(extracted_data)='object'),
  draft_data jsonb not null default '{}'::jsonb check (jsonb_typeof(draft_data)='object'),
  field_provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(field_provenance)='object'),
  duplicate_matches jsonb not null default '[]'::jsonb check (jsonb_typeof(duplicate_matches)='array'),
  model text,
  ai_usage jsonb not null default '{}'::jsonb check (jsonb_typeof(ai_usage)='object'),
  estimated_cost_usd numeric(12,6),
  published_trip_id uuid references public.trip_packages(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  analyzed_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz
);

create index sisai_imports_created_at_idx on public.sisai_imports(created_at desc);
create index sisai_imports_status_idx on public.sisai_imports(status, updated_at desc);
create index sisai_imports_trip_idx on public.sisai_imports(published_trip_id) where published_trip_id is not null;
alter table public.sisai_imports enable row level security;
create policy sisai_imports_admin_all on public.sisai_imports
  for all to authenticated using (public.is_shiap_admin()) with check (public.is_shiap_admin());
grant select, insert, update, delete on public.sisai_imports to authenticated;
revoke all on public.sisai_imports from anon;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('shiap-sisai-sources','shiap-sisai-sources',false,12582912,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

create policy sisai_sources_admin_read on storage.objects for select to authenticated
  using (bucket_id='shiap-sisai-sources' and public.is_shiap_admin());
create policy sisai_sources_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id='shiap-sisai-sources' and public.is_shiap_admin());
create policy sisai_sources_admin_update on storage.objects for update to authenticated
  using (bucket_id='shiap-sisai-sources' and public.is_shiap_admin())
  with check (bucket_id='shiap-sisai-sources' and public.is_shiap_admin());
create policy sisai_sources_admin_delete on storage.objects for delete to authenticated
  using (bucket_id='shiap-sisai-sources' and public.is_shiap_admin());

create or replace function public.publish_sisai_trip(p_import_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  admin_id uuid := auth.uid();
  imp public.sisai_imports%rowtype;
  d jsonb;
  v_trip_id uuid;
  trip_title text;
  trip_slug text;
  trip_location text;
  departure_count integer := 0;
begin
  if admin_id is null or not public.is_shiap_admin() then raise exception 'Akses admin diperlukan.'; end if;
  select * into imp from public.sisai_imports where id=p_import_id for update;
  if not found then raise exception 'Draft SISAI tidak ditemukan.'; end if;
  if imp.status <> 'approved' then raise exception 'Draft harus disetujui sebelum dipublikasikan.'; end if;
  if imp.published_trip_id is not null then raise exception 'Draft ini sudah dipublikasikan.'; end if;

  d := imp.draft_data;
  trip_title := nullif(btrim(d->>'title'),'');
  trip_location := nullif(btrim(d->>'destination'),'');
  if trip_title is null or trip_location is null then raise exception 'Judul dan destinasi wajib dilengkapi.'; end if;
  if coalesce(nullif(d->>'base_price','')::numeric,0) <= 0 then raise exception 'Harga per peserta wajib dilengkapi.'; end if;
  if coalesce(d->>'trip_mode','') not in ('open','private') then raise exception 'Jenis trip wajib dipilih.'; end if;
  if d->>'trip_mode'='open' and (jsonb_typeof(d->'dates') <> 'array' or jsonb_array_length(d->'dates')=0) then raise exception 'Open Trip wajib memiliki jadwal keberangkatan.'; end if;
  if d->>'trip_mode'='private' and (coalesce(nullif(d->>'min_pax','')::integer,0)<1 or coalesce(nullif(d->>'max_pax','')::integer,0)<coalesce(nullif(d->>'min_pax','')::integer,0)) then raise exception 'Batas peserta min/max Private Trip wajib dilengkapi.'; end if;

  trip_slug := trim(both '-' from regexp_replace(lower(trip_title), '[^a-z0-9]+', '-', 'g'));
  if trip_slug='' then trip_slug := 'trip'; end if;
  trip_slug := left(trip_slug,70)||'-sisai-'||left(replace(p_import_id::text,'-',''),8);

  insert into public.trip_packages(
    title,slug,location,categories,trip_modes,duration,short_description,description,
    pricing_model,base_price,min_pax,max_pax,price_tiers,minimum_package_price,status,featured,cover_image_url,gallery_urls,
    highlights,itinerary,included,excluded,meeting_point,preparation,notes,created_by
  ) values (
    trip_title,trip_slug,trip_location,
    case when jsonb_typeof(d->'categories')='array' then array(select jsonb_array_elements_text(d->'categories')) else array['Trip'] end,
    case when d->>'trip_mode'='private' then array['private'] else array['open'] end,
    nullif(btrim(d->>'duration'),''),nullif(btrim(d->>'short_description'),''),nullif(btrim(d->>'description'),''),
    case when d->>'trip_mode'='private' then 'private_tiered' else 'open_per_person' end,(d->>'base_price')::numeric,
    nullif(d->>'min_pax','')::integer,nullif(d->>'max_pax','')::integer,
    case when d->>'trip_mode'='private' then jsonb_build_array(jsonb_build_object('min_pax',(d->>'min_pax')::integer,'max_pax',(d->>'max_pax')::integer,'price_per_person',(d->>'base_price')::numeric)) else '[]'::jsonb end,
    0,'published',false,
    null,null,array[]::text[],coalesce(d->'itinerary','[]'::jsonb),
    case when jsonb_typeof(d->'included')='array' then array(select jsonb_array_elements_text(d->'included')) else array[]::text[] end,
    case when jsonb_typeof(d->'excluded')='array' then array(select jsonb_array_elements_text(d->'excluded')) else array[]::text[] end,
    nullif(btrim(d->>'meeting_point'),''),
    array[]::text[],
    case when jsonb_typeof(d->'terms')='array' then array(select jsonb_array_elements_text(d->'terms')) else array[]::text[] end ||
    case when jsonb_typeof(d->'facilities')='array' then array(select 'Fasilitas: '||jsonb_array_elements_text(d->'facilities')) else array[]::text[] end ||
    case when nullif(btrim(d->>'operator'),'') is not null then array['Operator: '||btrim(d->>'operator')] else array[]::text[] end,
    admin_id
  ) returning id into v_trip_id;

  for d in select value from jsonb_array_elements(coalesce(imp.draft_data->'dates','[]'::jsonb)) loop
    if imp.draft_data->>'trip_mode' <> 'open' then continue; end if;
    if coalesce(d->>'departure_date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Tanggal keberangkatan tidak valid.'; end if;
    if coalesce(nullif(d->>'min_participants','')::integer,0)<1 or coalesce(nullif(d->>'max_participants','')::integer,0)<1 then raise exception 'Batas minimum dan kapasitas peserta wajib dilengkapi.'; end if;
    if (d->>'max_participants')::integer < (d->>'min_participants')::integer then raise exception 'Kapasitas peserta tidak boleh lebih kecil dari batas minimum.'; end if;
    insert into public.trip_departures(trip_id,departure_date,end_date,price_per_person,min_participants,max_participants,status)
    values(v_trip_id,(d->>'departure_date')::date,nullif(d->>'end_date','')::date,
      coalesce(nullif(d->>'price_per_person','')::numeric,(imp.draft_data->>'base_price')::numeric),
      (d->>'min_participants')::integer,(d->>'max_participants')::integer,'open');
    departure_count := departure_count + 1;
  end loop;

  if imp.draft_data->>'trip_mode'='open' and departure_count=0 then raise exception 'Open Trip wajib memiliki jadwal keberangkatan.'; end if;
  update public.sisai_imports set status='published',published_trip_id=v_trip_id,published_at=now(),updated_at=now() where id=p_import_id;
  return v_trip_id;
end;
$$;
revoke all on function public.publish_sisai_trip(uuid) from public,anon;
grant execute on function public.publish_sisai_trip(uuid) to authenticated;

commit;
