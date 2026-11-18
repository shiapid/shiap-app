-- Clearly labeled demo catalog for SHIAP activity and documentation services.
-- Prices are illustrative local demo data and can be edited in Admin.
begin;

with locations(code,location_name) as (
 values
  ('teluk-tamiang','Pantai Teluk Tamiang'),
  ('risalo','Pantai Risalo'),
  ('gedambaan','Pantai Gedambaan'),
  ('kerayaan','Pulau Kerayaan')
), products(
 product_key,experience_type,title,price_basis,price_unit_label,duration,
 tamiang_price,risalo_price,gedambaan_price,kerayaan_price,daily_capacity,
 short_description,highlights,inclusions
) as (
 values
  ('snorkeling','activity','Paket Snorkeling','per_person','orang','2 jam',75000,65000,55000,100000,30,'Paket demo snorkeling dengan pemandu dan perlengkapan dasar.','{"Snorkeling bersama pemandu lokal","Cocok untuk pemula"}'::text[],'{"Masker dan snorkel","Pelampung"}'::text[]),
  ('kayak','activity','Kayak / Kano Tandem','per_unit','unit','1 jam',150000,125000,100000,180000,10,'Sewa demo kayak tandem untuk menjelajahi garis pantai.','{"Kayak untuk dua orang","Briefing keselamatan"}'::text[],'{"Kayak dan dayung","Pelampung keselamatan"}'::text[]),
  ('banana-boat','activity','Banana Boat','per_unit','sesi','15 menit',300000,250000,225000,350000,16,'Wahana demo banana boat untuk keluarga dan rombongan.','{"Maksimal 5 orang per sesi","Didampingi kru wahana"}'::text[],'{"Perahu banana boat","Pelampung keselamatan"}'::text[]),
  ('jetski','activity','Jetski','per_unit','sesi','15 menit',450000,400000,375000,550000,10,'Sesi demo jetski dengan briefing dan pendampingan kru.','{"Satu pengendara per unit","Briefing keselamatan"}'::text[],'{"Jetski dan pelampung","Pendampingan kru"}'::text[]),
  ('drone-standalone','documentation','Dokumentasi Drone — Mandiri','per_unit','paket','Sesi 30 menit',1200000,1000000,900000,1500000,8,'Paket demo dokumentasi udara yang dapat dipesan tanpa Trip atau Wahana.','{"Footage udara lokasi wisata","File digital resolusi tinggi"}'::text[],'{"Sesi pengambilan gambar 30 menit","Tautan file digital"}'::text[]),
  ('mirrorless-standalone','documentation','Dokumentasi Mirrorless — Mandiri','per_unit','paket','Sesi 1 jam',650000,550000,450000,850000,10,'Paket demo foto perjalanan menggunakan kamera mirrorless, bisa dipesan mandiri.','{"Foto candid dan potret","File foto digital pilihan"}'::text[],'{"Sesi foto 1 jam","File digital pilihan"}'::text[]),
  ('underwater-standalone','documentation','Dokumentasi Underwater — Mandiri','per_unit','paket','Sesi 45 menit',850000,750000,700000,1200000,8,'Paket demo dokumentasi bawah air yang bisa dipesan terpisah.','{"Foto dan video bawah air","Didampingi operator"}'::text[],'{"Sesi underwater 45 menit","File digital pilihan"}'::text[]),
  ('drone-bundle','documentation','Add-on Drone untuk Trip / Wahana','per_unit','paket','Sesi 30 menit',850000,750000,650000,1100000,8,'Harga bundling demo jika dipesan bersamaan dengan Trip atau Wahana. Tambahkan item Trip/Wahana dan paket ini ke keranjang yang sama.','{"Harga bundling Trip atau Wahana","Footage udara lokasi wisata"}'::text[],'{"Sesi pengambilan gambar 30 menit","Tautan file digital"}'::text[]),
  ('mirrorless-bundle','documentation','Add-on Mirrorless untuk Trip / Wahana','per_unit','paket','Sesi 1 jam',450000,375000,325000,650000,10,'Harga bundling demo untuk dokumentasi kamera mirrorless bersama Trip atau Wahana.','{"Harga bundling Trip atau Wahana","Foto perjalanan pilihan"}'::text[],'{"Sesi foto 1 jam","File digital pilihan"}'::text[]),
  ('underwater-bundle','documentation','Add-on Underwater untuk Snorkeling','per_unit','paket','Sesi 45 menit',500000,450000,400000,750000,8,'Harga bundling demo untuk dokumentasi bawah air bersama snorkeling. Tambahkan paket snorkeling ke keranjang yang sama.','{"Harga bundling khusus snorkeling","Foto dan video bawah air"}'::text[],'{"Sesi underwater 45 menit","File digital pilihan"}'::text[])
), expanded as (
 select p.*,l.code,l.location_name,
  case l.code when 'teluk-tamiang' then p.tamiang_price when 'risalo' then p.risalo_price when 'gedambaan' then p.gedambaan_price else p.kerayaan_price end as listed_price
 from products p cross join locations l
)
insert into public.shiap_experiences(
 experience_type,title,slug,short_description,description,duration,location,
 base_price,price_basis,price_unit_label,min_quantity,max_quantity,daily_capacity,
 addons,highlights,inclusions,featured,status
)
select experience_type,title||' · '||location_name,product_key||'-'||code,
 short_description,
 'KONTEN DEMO SHIAP. Tarif dan ketersediaan merupakan contoh lokal, silakan sesuaikan sebelum digunakan untuk transaksi nyata.',
 duration,location_name,listed_price,price_basis,price_unit_label,1,
 case product_key when 'snorkeling' then 10 when 'kayak' then 4 when 'banana-boat' then 4 when 'jetski' then 5 else 1 end,
 case when experience_type='activity' then daily_capacity else daily_capacity end,
 case
  when product_key='snorkeling' then jsonb_build_array(jsonb_build_object('id','underwater-snorkeling','name','Add-on dokumentasi underwater','price',case code when 'teluk-tamiang' then 250000 when 'risalo' then 225000 when 'gedambaan' then 200000 else 350000 end))
  when experience_type='activity' then jsonb_build_array(jsonb_build_object('id','mirrorless-activity','name','Add-on dokumentasi mirrorless','price',case code when 'teluk-tamiang' then 300000 when 'risalo' then 250000 when 'gedambaan' then 225000 else 400000 end),jsonb_build_object('id','drone-activity','name','Add-on dokumentasi drone','price',case code when 'teluk-tamiang' then 500000 when 'risalo' then 450000 when 'gedambaan' then 400000 else 650000 end))
  else '[]'::jsonb
 end,
 highlights,inclusions,true,'published'
from expanded
on conflict(slug) do update set
 experience_type=excluded.experience_type,title=excluded.title,short_description=excluded.short_description,
 description=excluded.description,duration=excluded.duration,location=excluded.location,
 base_price=excluded.base_price,price_basis=excluded.price_basis,price_unit_label=excluded.price_unit_label,
 min_quantity=excluded.min_quantity,max_quantity=excluded.max_quantity,daily_capacity=excluded.daily_capacity,
 addons=excluded.addons,highlights=excluded.highlights,inclusions=excluded.inclusions,featured=excluded.featured,
 status=excluded.status,updated_at=now();

commit;
