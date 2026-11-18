begin;
create function public.admin_create_free_places_listing(p_name text,p_destination_id uuid,p_whatsapp text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); phone text; property_id uuid:=gen_random_uuid(); base_slug text; verified timestamptz:=clock_timestamp();
begin
  if actor is null or not exists(select 1 from public.admin_users where user_id=actor) then raise exception 'Akses Admin diperlukan.' using errcode='42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 2 and 160 or p_whatsapp is null or length(p_whatsapp)>40 or p_whatsapp !~ '^[+0-9 ().-]+$' then raise exception 'Data properti tidak valid.' using errcode='22023'; end if;
  phone:=regexp_replace(p_whatsapp,'[^0-9]','','g');
  if left(phone,2)='00' then phone:=substr(phone,3); end if;
  if left(phone,1)='0' then phone:='62'||substr(phone,2); elsif left(phone,1)='8' then phone:='62'||phone; end if;
  if phone !~ '^62[0-9]{8,13}$' or not exists(select 1 from public.places_destinations where id=p_destination_id and is_active) then raise exception 'Destinasi atau WhatsApp tidak valid.' using errcode='22023'; end if;
  base_slug:=trim(both '-' from regexp_replace(lower(btrim(p_name)),'[^a-z0-9]+','-','g'));
  base_slug:=coalesce(nullif(left(base_slug,80),''),'penginapan');
  insert into public.places_properties(id,slug,name,destination_id,accommodation_type,whatsapp_phone,status,is_demo,created_by,contact_verified_at,contact_verification_expires_at)
  values(property_id,base_slug||'-'||replace(property_id::text,'-',''),btrim(p_name),p_destination_id,'other',phone,'published',false,actor,verified,verified+interval '1 year');
  insert into public.places_property_verifications(property_id,verified_by,channel,evidence_note,verified_at,valid_until)
  values(property_id,actor,'whatsapp','Admin memeriksa kepemilikan dan kebenaran WhatsApp resmi melalui Verifikasi & Terbitkan.',verified,verified+interval '1 year');
  return property_id;
end $$;
revoke all on function public.admin_create_free_places_listing(text,uuid,text) from public,anon;
grant execute on function public.admin_create_free_places_listing(text,uuid,text) to authenticated;
create function public.admin_revoke_places_contact(p_property_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.admin_users where user_id=auth.uid()) then raise exception 'Akses Admin diperlukan.' using errcode='42501'; end if;
  update public.places_properties set status='suspended',contact_verified_at=null,contact_verification_expires_at=null where id=p_property_id;
  if not found then raise exception 'Properti tidak ditemukan.'; end if;
end $$;
revoke all on function public.admin_revoke_places_contact(uuid) from public,anon;
grant execute on function public.admin_revoke_places_contact(uuid) to authenticated;
commit;
