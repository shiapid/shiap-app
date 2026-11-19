begin;
create table public.places_whatsapp_settings (
 id boolean primary key default true check(id),
 template text not null check(length(template) between 1 and 2000 and position('{nama_properti}' in template)>0 and position('{kode_referensi}' in template)>0 and regexp_replace(template,'\{(nama_properti|kode_referensi)\}','','g') !~ '[{}]'),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null
);
insert into public.places_whatsapp_settings(id,template) values(true,$template$Halo Kak 👋

Saya tertarik dengan *{nama_properti}* yang saya temukan melalui SHIAP Places.

Boleh minta informasi harga dan ketersediaan penginapannya?

Terima kasih! 😊

*Ref. SHIAP:* {kode_referensi}$template$);
alter table public.places_whatsapp_settings enable row level security;
revoke all on public.places_whatsapp_settings from public,anon,authenticated;
grant select(id,template) on public.places_whatsapp_settings to anon,authenticated;
grant update(template) on public.places_whatsapp_settings to authenticated;
grant all on public.places_whatsapp_settings to service_role;
create policy places_whatsapp_public_read on public.places_whatsapp_settings for select to anon,authenticated using(true);
create policy places_whatsapp_admin_update on public.places_whatsapp_settings for update to authenticated using(public.is_shiap_admin()) with check(public.is_shiap_admin());
create function public.places_whatsapp_settings_actor() returns trigger language plpgsql set search_path='' as $$ begin new.updated_by:=auth.uid();new.updated_at:=clock_timestamp();return new;end $$;
revoke all on function public.places_whatsapp_settings_actor() from public,anon,authenticated;
create trigger places_whatsapp_settings_before_update before update on public.places_whatsapp_settings for each row execute function public.places_whatsapp_settings_actor();
commit;
