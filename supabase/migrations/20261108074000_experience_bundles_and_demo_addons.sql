-- Mark demo documentation bundles and validate that their required service is
-- present in the same booking. Deferred validation preserves atomic inventory
-- holds even when the bundle appears before its Trip/Wahana item in the cart.
begin;

alter table public.shiap_experiences
  add column bundle_requires text not null default 'none'
  check (bundle_requires in ('none','trip_or_activity','snorkeling'));

update public.shiap_experiences set bundle_requires='trip_or_activity'
where slug like 'drone-bundle-%' or slug like 'mirrorless-bundle-%';
update public.shiap_experiences set bundle_requires='snorkeling'
where slug like 'underwater-bundle-%';

update public.shiap_experiences
set addons=jsonb_build_array(
  jsonb_build_object('id','highlight-reel','name','Highlight reel 30 detik','price',case location when 'Pantai Teluk Tamiang' then 250000 when 'Pantai Risalo' then 200000 when 'Pantai Gedambaan' then 175000 else 350000 end),
  jsonb_build_object('id','extra-edited-photos','name','Tambahan 10 foto edit','price',case location when 'Pantai Teluk Tamiang' then 175000 when 'Pantai Risalo' then 150000 when 'Pantai Gedambaan' then 125000 else 250000 end)
)
where experience_type='documentation' and slug not like '%-bundle-%';

create or replace function public.validate_experience_booking_bundles()
returns trigger language plpgsql security definer set search_path=public
as $$
declare bundle record;
begin
 for bundle in
  select i.id,i.date_start,e.bundle_requires,e.location
  from public.booking_items i join public.shiap_experiences e on e.id=i.service_catalog_id
  where i.booking_id=new.id and e.bundle_requires<>'none'
 loop
  if bundle.bundle_requires='trip_or_activity' and not exists(
   select 1 from public.booking_items related
   where related.booking_id=new.id and related.id<>bundle.id and related.date_start=bundle.date_start
    and related.service_type in('trip','activity')
  ) then
   raise exception 'Paket dokumentasi bundling wajib disertai Trip atau Wahana pada tanggal yang sama.';
  elsif bundle.bundle_requires='snorkeling' and not exists(
   select 1 from public.booking_items related
   join public.shiap_experiences activity on activity.id=related.service_catalog_id
   where related.booking_id=new.id and related.id<>bundle.id and related.date_start=bundle.date_start
    and related.service_type='activity' and activity.experience_type='activity'
    and activity.location=bundle.location and activity.slug like 'snorkeling-%'
  ) then
   raise exception 'Paket dokumentasi underwater bundling wajib disertai snorkeling pada lokasi dan tanggal yang sama.';
  end if;
 end loop;
 return new;
end $$;

create constraint trigger booking_orders_validate_experience_bundles
after insert on public.booking_orders deferrable initially deferred
for each row execute function public.validate_experience_booking_bundles();

commit;
