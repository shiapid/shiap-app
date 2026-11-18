-- Synthetic SHIAP demo catalog. Safe to re-run: existing catalog edits are kept.
-- No customer, booking, or payment transaction rows are seeded.
begin;

insert into public.trip_packages(
  id,title,slug,location,categories,trip_modes,duration,short_description,description,
  pricing_model,base_price,min_pax,max_pax,price_tiers,minimum_package_price,status,featured,cover_image_url,gallery_urls,
  highlights,itinerary,included,excluded,meeting_point,preparation,notes
) values
(
  '10000000-0000-4000-8000-000000000001','DEMO — Open Trip Pulau Laut','demo-open-trip-pulau-laut',
  'Kotabaru, Kalimantan Selatan (DEMO)',array['Open Trip','Snorkeling','Island Hopping'],array['open'],
  '3 Hari 2 Malam','Paket contoh untuk menguji jadwal, harga per peserta, dan inventory hold.',
  'DATA DEMO SHIAP. Bukan penawaran perjalanan aktual. Contoh perjalanan laut dengan snorkeling dan island hopping.',
  'open_per_person',850000,2,10,'[]',850000,'published',true,'/demo/shiap-demo-trip.svg',array['/demo/shiap-demo-trip.svg'],
  array['Contoh jadwal keberangkatan','Harga dihitung per peserta','Kapasitas jadwal diuji saat checkout'],
  '[{"day":"Hari 1","time":"08:00","title":"DEMO — Titik kumpul dan briefing","description":"Agenda contoh untuk pengujian lokal."},{"day":"Hari 2","time":"09:00","title":"DEMO — Snorkeling","description":"Aktivitas dummy; detail perjalanan sebenarnya dikonfirmasi oleh admin."},{"day":"Hari 3","time":"10:00","title":"DEMO — Kembali ke pelabuhan","description":"Agenda contoh untuk pengujian lokal."}]',
  array['Perahu (contoh)','Perlengkapan snorkeling (contoh)'],array['Transport menuju titik kumpul (contoh)'],
  'DEMO — Titik kumpul akan dikonfirmasi admin.',array['Bawa pakaian ganti (contoh)'],array['Listing dummy untuk Supabase lokal.']
),
(
  '10000000-0000-4000-8000-000000000002','DEMO — Private Trip Teluk Tamiang','demo-private-trip-teluk-tamiang',
  'Kotabaru, Kalimantan Selatan (DEMO)',array['Private Trip','Snorkeling'],array['private'],
  '2 Hari 1 Malam','Paket contoh private dengan harga bertingkat dan minimum harga paket.',
  'DATA DEMO SHIAP. Bukan penawaran perjalanan aktual. Harga hanya untuk mengetes kalkulator tier private.',
  'private_tiered',null,2,12,
  '[{"min_pax":2,"max_pax":4,"price_per_person":1250000},{"min_pax":5,"max_pax":8,"price_per_person":1050000},{"min_pax":9,"max_pax":12,"price_per_person":925000}]',
  5000000,'published',false,'/demo/shiap-demo-trip.svg',array['/demo/shiap-demo-trip.svg'],array['Harga private dihitung dari jumlah peserta','Minimum pembayaran paket Rp5.000.000 (dummy)'],
  '[{"day":"Hari 1","time":"08:00","title":"DEMO — Keberangkatan privat","description":"Rencana perjalanan contoh."},{"day":"Hari 2","time":"09:00","title":"DEMO — Kembali","description":"Rencana perjalanan contoh."}]',
  array['Kendaraan lokal (contoh)','Pemandu (contoh)'],array['Pengeluaran pribadi (contoh)'],
  'DEMO — Titik temu ditentukan setelah booking.',array['Konfirmasi jumlah peserta (contoh)'],array['Harga dan jadwal dummy lokal; jangan gunakan untuk transaksi nyata.']
)
on conflict (id) do nothing;

-- Attach only missing placeholder assets to existing demo rows; preserve any
-- image already chosen by an admin in either local or an approved Cloud seed.
update public.trip_packages set cover_image_url='/demo/shiap-demo-trip.svg',gallery_urls=array['/demo/shiap-demo-trip.svg']
where slug in ('demo-open-trip-pulau-laut','demo-private-trip-teluk-tamiang') and cover_image_url is null;
update public.trip_packages set minimum_package_price=base_price
where slug='demo-open-trip-pulau-laut' and minimum_package_price=0 and base_price>0;

insert into public.trip_departures(id,trip_id,departure_date,end_date,price_per_person,min_participants,max_participants,booked_seats,status,notes)
select v.id,p.id,current_date+v.day_offset,current_date+v.day_offset+2,850000,2,10,0,'open','DATA DUMMY — jadwal lokal untuk uji booking.'
from (values
 ('10000000-0000-4000-8000-000000000101'::uuid,45),
 ('10000000-0000-4000-8000-000000000102'::uuid,75)
) v(id,day_offset) cross join public.trip_packages p where p.slug='demo-open-trip-pulau-laut'
on conflict (id) do nothing;

update public.stay_properties set cover_image_url='/demo/shiap-demo-stay.svg',gallery_urls=array['/demo/shiap-demo-stay.svg']
where slug in ('demo-villa-bahari','demo-homestay-pesisir') and cover_image_url is null;

insert into public.stay_properties(
  id,name,slug,property_type,location,address,short_description,description,facilities,cover_image_url,gallery_urls,
 check_in_time,check_out_time,featured,status
) values
 ('20000000-0000-4000-8000-000000000001','DEMO — Villa Bahari','demo-villa-bahari','villa',
  'Kotabaru, Kalimantan Selatan (data dummy)','Alamat dummy — bukan alamat properti aktual.',
  'Properti contoh untuk menguji harga weekday/weekend dan kapasitas kamar.',
  'DATA DEMO SHIAP. Villa contoh dengan dua tipe kamar; bukan listing penginapan aktual.',
  array['Wi-Fi (contoh)','Parkir (contoh)'],'/demo/shiap-demo-stay.svg',array['/demo/shiap-demo-stay.svg'],'14:00','12:00',true,'published'),
 ('20000000-0000-4000-8000-000000000002','DEMO — Homestay Pesisir','demo-homestay-pesisir','homestay',
  'Kotabaru, Kalimantan Selatan (data dummy)','Alamat dummy — bukan alamat properti aktual.',
  'Listing homestay contoh dengan kamar standar.',
  'DATA DEMO SHIAP. Listing untuk mencoba pencarian, detail stay, dan booking kamar.',
  array['Area bersama (contoh)'],'/demo/shiap-demo-stay.svg',array['/demo/shiap-demo-stay.svg'],'14:00','12:00',false,'published')
on conflict (id) do nothing;

-- Payment settings remain inactive while these are demo products. Preserve the
-- current bank details for later admin review, but never expose them to guests.
update public.payment_settings set is_active=false,updated_at=now() where id=true;

-- Keep existing admin-edited custom-trip/home content. Fill only empty lists.
update public.custom_trip_settings set
 destinations=case when cardinality(destinations)=0 then array['Pantai Teluk Tamiang','Pantai Risalo','Pantai Gedambaan','Pulau Kerayaan'] else destinations end,
 durations_days=case when cardinality(durations_days)=0 then array[1,2,3,4,5] else durations_days end,
 activities=case when cardinality(activities)=0 then array['Snorkeling','Jetski','Banana Boat','Kano','Paddleboard','Island Hopping'] else activities end,
 stays=case when cardinality(stays)=0 then array['Homestay Pesisir','Villa Bahari','Belum ditentukan'] else stays end,
 documentation_services=case when cardinality(documentation_services)=0 then array['Drone','Camera','Underwater'] else documentation_services end,
 documentation_deliverables=case when cardinality(documentation_deliverables)=0 then array['Foto','Video','Editing'] else documentation_deliverables end
where id=true and (cardinality(destinations)=0 or cardinality(activities)=0 or cardinality(stays)=0
  or cardinality(durations_days)=0 or cardinality(documentation_services)=0 or cardinality(documentation_deliverables)=0);

-- Drop only a broken hero override that has no matching object in the public
-- catalog bucket. The homepage then falls back to a seeded demo trip image;
-- valid admin uploads and all other homepage copy remain unchanged.
update public.home_hero_settings h set image_path=null
where h.id=true and h.image_path is not null
  and not exists (
    select 1 from storage.objects o
    where o.bucket_id='shiap-catalog-images' and o.name=h.image_path
  );

-- The 40 Activity/Rental/SHINEMA demo rows already present in Cloud/local are
-- preserved. Attach a valid local placeholder only where no cover was set.
update public.shiap_experiences
set cover_image_url='/demo/shiap-demo-experience.svg'
where (cover_image_url is null or btrim(cover_image_url)='')
  and catalog_category in ('activity','rental','documentation');

insert into public.stay_room_types(
 id,property_id,name,description,capacity,total_units,weekday_price,weekend_price,
 extra_bed_price,extra_guest_price,facilities,status
)
select v.id,p.id,v.name,'Tipe kamar dummy untuk pengujian lokal.',v.capacity,v.units,v.weekday,v.weekend,0,0,v.facilities,'active'
from (values
 ('20000000-0000-4000-8000-000000000101'::uuid,'demo-villa-bahari','DEMO — Kamar Keluarga',4,2,750000::numeric,950000::numeric,array['AC (contoh)','Kamar mandi (contoh)']::text[]),
 ('20000000-0000-4000-8000-000000000102'::uuid,'demo-villa-bahari','DEMO — Kamar Standard',2,3,400000::numeric,550000::numeric,array['AC (contoh)']::text[]),
 ('20000000-0000-4000-8000-000000000103'::uuid,'demo-homestay-pesisir','DEMO — Kamar Twin',2,3,300000::numeric,425000::numeric,array['Kipas angin (contoh)']::text[])
) v(id,slug,name,capacity,units,weekday,weekend,facilities)
join public.stay_properties p on p.slug=v.slug
on conflict (id) do nothing;

commit;

