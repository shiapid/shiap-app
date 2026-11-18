begin;
create function public.admin_save_free_places_listing(p_property_id uuid,p_name text,p_destination_id uuid,p_whatsapp text,p_publish boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); phone text; existing public.places_properties%rowtype; verified timestamptz:=clock_timestamp();
begin
  if actor is null or not exists(select 1 from public.admin_users where user_id=actor) then raise exception 'Akses Admin diperlukan.' using errcode='42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 2 and 160 or p_whatsapp is null or length(p_whatsapp)>40 or p_whatsapp !~ '^[+0-9 ().-]+$' then raise exception 'Data properti tidak valid.' using errcode='22023'; end if;
  phone:=regexp_replace(p_whatsapp,'[^0-9]','','g');
  if left(phone,2)='00' then phone:=substr(phone,3); end if;
  if left(phone,1)='0' then phone:='62'||substr(phone,2); elsif left(phone,1)='8' then phone:='62'||phone; end if;
  if phone !~ '^62[0-9]{8,13}$' or not exists(select 1 from public.places_destinations where id=p_destination_id and is_active) then raise exception 'Destinasi atau WhatsApp tidak valid.' using errcode='22023'; end if;

 select * into existing from public.places_properties where id=p_property_id for update;
 if not found or existing.status='archived' then raise exception 'Properti tidak tersedia.' using errcode='P0002';end if;
 if p_publish and existing.is_demo then raise exception 'Demo tidak dapat diterbitkan.';end if;
 update public.places_properties set name=btrim(p_name),destination_id=p_destination_id,whatsapp_phone=phone,
   status=case when p_publish then 'published' when phone<>existing.whatsapp_phone then 'pending_verification' else existing.status end,
   contact_verified_at=case when p_publish then verified when phone<>existing.whatsapp_phone then null else existing.contact_verified_at end,
   contact_verification_expires_at=case when p_publish then verified+interval '1 year' when phone<>existing.whatsapp_phone then null else existing.contact_verification_expires_at end
 where id=p_property_id;
 if p_publish then
 insert into public.places_property_verifications(property_id,verified_by,channel,evidence_note,verified_at,valid_until)
 values(p_property_id,actor,'whatsapp','Admin memeriksa WhatsApp resmi melalui Verifikasi & Terbitkan.',verified,verified+interval '1 year');
 end if;
end $$;
revoke all on function public.admin_save_free_places_listing(uuid,text,uuid,text,boolean) from public,anon;
grant execute on function public.admin_save_free_places_listing(uuid,text,uuid,text,boolean) to authenticated;
commit;
