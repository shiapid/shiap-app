drop policy booking_proofs_owner_delete on storage.objects;
create policy booking_proofs_owner_delete on storage.objects for delete to authenticated using(
 bucket_id='booking-payment-proofs'
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and not exists(select 1 from public.booking_payment_records r where r.storage_path=name and r.user_id=(select auth.uid()))
);
