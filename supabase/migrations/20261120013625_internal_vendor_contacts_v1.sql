begin;

create table public.internal_vendor_contacts (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid unique references public.trip_packages(id) on delete cascade,
  stay_id uuid unique references public.stay_properties(id) on delete cascade,
  places_id uuid unique references public.places_properties(id) on delete cascade,
  experience_id uuid unique references public.shiap_experience_products(id) on delete cascade,
  catalog_id uuid unique references public.shiap_experiences(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  whatsapp text not null check (whatsapp ~ '^62[0-9]{8,13}$'),
  notes text not null default '' check (char_length(notes) <= 1000),
  check (num_nonnulls(trip_id, stay_id, places_id, experience_id, catalog_id) = 1)
);

alter table public.internal_vendor_contacts enable row level security;
revoke all on public.internal_vendor_contacts from public, anon, authenticated;
grant select, insert, update on public.internal_vendor_contacts to authenticated;
create policy internal_vendor_admin_only on public.internal_vendor_contacts
  for all to authenticated using ((select public.is_shiap_admin()))
  with check ((select public.is_shiap_admin()));

create function public.admin_booking_vendor_contacts(p_booking_id uuid)
returns table (item_id uuid, name text, whatsapp text)
language sql stable security invoker set search_path = '' as $$
  select item.id, contact.name, contact.whatsapp
  from public.booking_items item
  left join public.shiap_experience_packages package on package.catalog_service_id = item.service_catalog_id
  left join lateral (
    select array_agg(property.id) as ids
    from public.places_properties property
    where property.stay_property_id = item.property_id
      and property.stay_mapping_verified_at is not null
      and property.status <> 'archived'
      and not property.is_demo
  ) places on item.property_id is not null
  join lateral (
    select vendor.name, vendor.whatsapp
    from public.internal_vendor_contacts vendor
    where vendor.trip_id = item.trip_id or vendor.stay_id = item.property_id
       or vendor.catalog_id = item.service_catalog_id or vendor.experience_id = package.product_id
       or (cardinality(places.ids) = 1 and vendor.places_id = places.ids[1])
    order by case when vendor.places_id is not null then 2
                  when vendor.catalog_id is not null and package.product_id is not null then 1
                  else 0 end, vendor.id
    limit 1
  ) contact on true
  where item.booking_id = p_booking_id and (select public.is_shiap_admin());
$$;
revoke execute on function public.admin_booking_vendor_contacts(uuid) from public, anon, authenticated;
grant execute on function public.admin_booking_vendor_contacts(uuid) to authenticated;

commit;
