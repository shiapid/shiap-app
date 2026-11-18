begin;

alter table public.profiles add column avatar_path text
  check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}[.]webp$'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shiap-profile-avatars', 'shiap-profile-avatars', false, 2097152, array['image/webp']);

create policy profile_avatar_read on storage.objects for select to authenticated
using (bucket_id = 'shiap-profile-avatars' and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}[.]webp$'));

create policy profile_avatar_insert on storage.objects for insert to authenticated
with check (bucket_id = 'shiap-profile-avatars' and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}[.]webp$'));

create policy profile_avatar_delete on storage.objects for delete to authenticated
using (bucket_id = 'shiap-profile-avatars' and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}[.]webp$'));

-- Covers both booking RPCs before an item can affect inventory or finance.
-- An exception rolls back the entire order, including preceding items.
create function public.reject_preview_experience_booking()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1
    from public.shiap_experience_packages k
    join public.shiap_experience_products p on p.id = k.product_id
    where k.catalog_service_id = new.service_catalog_id and (p.is_demo or k.is_demo)
  ) then
    raise exception 'Experience demo hanya tersedia sebagai pratinjau.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_preview_experience_booking() from public, anon, authenticated;

create trigger a_reject_preview_experience_booking
before insert or update of service_catalog_id on public.booking_items
for each row when (new.service_catalog_id is not null)
execute function public.reject_preview_experience_booking();

insert into public.shiap_experience_categories (slug, name)
values ('ocean-academy', 'Ocean Academy'),
       ('beach-dining', 'Beach Dining'),
       ('ocean-adventure', 'Ocean Adventure'),
       ('outdoor-adventure', 'Outdoor Adventure'),
       ('private-special-moments', 'Private & Special Moments')
on conflict (slug) do nothing;

-- Reuse existing slugs. New previews have no booking packages or inventory.
insert into public.shiap_experience_products
  (category_id, slug, title, description, location_label, cover_image_url, status, is_demo, sort_order)
select category.id, preview.slug, preview.title, preview.description,
       'Lokasi belum ditentukan', '/demo/shiap-demo-experience.svg', 'published', true, preview.sort_order
from (values
  ('ocean-academy', 'freediving-class', 'Freediving Class', 'Konsep kelas pengenalan freediving dan keselamatan di air.', 1),
  ('beach-dining', 'beach-private-dinner', 'Beach Private Dinner', 'Konsep makan malam privat di tepi pantai untuk momen spesial.', 2),
  ('ocean-adventure', 'spearfishing-experience', 'Spearfishing Experience', 'Konsep workshop keselamatan dan tanggung jawab di laut, tanpa aktivitas berburu.', 3),
  ('outdoor-adventure', 'outdoor-survival-experience', 'Outdoor Survival', 'Konsep workshop navigasi dasar dan kesiapsiagaan di alam terbuka.', 4),
  ('private-special-moments', 'special-moment-setup', 'Special Moment Setup', 'Konsep dekorasi untuk ulang tahun, perayaan, atau lamaran.', 5)
) as preview(category_slug, slug, title, description, sort_order)
join public.shiap_experience_categories category on category.slug = preview.category_slug
on conflict (slug) do nothing;

commit;
