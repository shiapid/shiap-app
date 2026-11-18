begin;

-- Experience V1 demo catalog; local seed only. Products remain admin-editable
-- and every title is visibly labeled DEMO. No sessions/inventory are invented.
insert into public.shiap_experience_categories(slug,name,description,sort_order,is_demo)
values
 ('ocean-academy','Ocean Academy','Kelas dan pengenalan keterampilan laut. (DEMO)',1,true),
 ('ocean-adventure','Ocean Adventure','Pengalaman petualangan laut. (DEMO)',2,true),
 ('beach-dining','Beach Dining','Pengalaman makan privat tepi pantai. (DEMO)',3,true),
 ('outdoor-adventure','Outdoor Adventure','Workshop alam dan keterampilan luar ruang. (DEMO)',4,true),
 ('private-special-moments','Private & Special Moments','Persiapan momen khusus. (DEMO)',5,true)
on conflict(slug) do nothing;

insert into public.shiap_experience_products(category_id,slug,title,tagline,description,duration,location_label,cover_image_url,
  highlights,inclusions,exclusions,prerequisites,safety_information,status,is_demo,sort_order)
select c.id,v.slug,v.title,v.tagline,v.description,v.duration,'DEMO — lokasi dikonfirmasi setelah operasional diverifikasi','/demo/shiap-demo-experience.svg',v.highlights,v.inclusions,v.exclusions,v.prerequisites,v.safety,'published',true,v.sort_order
from (values
 ('ocean-academy','freediving-class','DEMO — Freediving Class — Discover the Ocean','Learn to Dive Beyond the Surface.','Pengalaman pengenalan keterampilan dasar, kepercayaan diri di air, dan eksplorasi laut yang bertanggung jawab. Produk DEMO; instruktur, tempat, jadwal, dan operasi harus diverifikasi admin sebelum penawaran nyata.','3–5 jam, tergantung paket',array['Pengenalan keterampilan dasar (DEMO)','Briefing keselamatan (DEMO)','Tidak menjanjikan kedalaman atau sertifikasi']::text[],array['Briefing keselamatan (DEMO)','Air minum (DEMO)']::text[],array['Transport menuju lokasi (belum ditentukan)']::text[],array['Skrining kesesuaian kesehatan','Ukuran perlengkapan dikonfirmasi admin']::text[],array['Tidak berlatih menahan napas sendirian','Pengawasan dan sistem buddy wajib','Rencana respons darurat wajib diverifikasi','Tidak menjanjikan kedalaman atau sertifikasi']::text[],1),
 ('beach-dining','beach-private-dinner','DEMO — Private Beach Dinner — An Evening to Remember','A Private Moment by the Ocean.','Konsep makan malam privat yang dikonfigurasi sesuai menu, kebutuhan diet, dekorasi, cuaca, dan lokasi setelah admin mengonfirmasi ketersediaan. Produk DEMO.','2–4 jam, estimasi DEMO',array['Pilihan tema (DEMO)','Kebutuhan diet dikonfirmasi admin','Lokasi dan mitigasi cuaca belum tersedia']::text[],array['Setup dasar (DEMO)']::text[],array['Transport dan kebutuhan khusus dikonfirmasi admin']::text[],array['Kebutuhan diet dikirim saat permintaan']::text[],array['Pelaksanaan bergantung pada kondisi cuaca dan konfirmasi lokasi']::text[],2),
 ('ocean-adventure','spearfishing-experience','DEMO — Guided Spearfishing Experience','Skill, Respect, and Responsibility Beneath the Surface.','Workshop keterampilan dan keselamatan tanpa aktivitas berburu. Ini satu-satunya paket Spearfishing yang boleh ditampilkan. Paket berburu tetap draft sampai legalitas, pemandu, lokasi, cuaca, dan rencana keselamatan terverifikasi.','Durasi dikonfirmasi admin',array['Workshop tanpa live hunting','Tidak ada jaminan ketersediaan sesi']::text[],array['Materi keselamatan (DEMO)']::text[],array['Aktivitas berburu dan penggunaan alat tidak termasuk']::text[],array['Pengalaman dan kondisi kesehatan dikonfirmasi admin']::text[],array['Tidak ada aktivitas berburu pada produk yang diterbitkan','Aturan perikanan lokal wajib diverifikasi sebelum layanan lain dipublikasikan']::text[],3),
 ('outdoor-adventure','outdoor-survival-experience','DEMO — Outdoor Survival — Learn Beyond Comfort','Build Skills. Explore Responsibly.','Workshop dasar navigasi, shelter, komunikasi darurat, dan prinsip Leave No Trace. Aktivitas berisiko tidak dilakukan tanpa supervisi berkualifikasi yang diverifikasi. Produk DEMO.','Durasi dikonfirmasi admin',array['Navigasi dasar (DEMO)','Dasar shelter (DEMO)','Komunikasi darurat (DEMO)']::text[],array['Materi workshop (DEMO)']::text[],array['Transport dan peralatan tambahan dikonfirmasi admin']::text[],array['Persyaratan peserta dikonfirmasi sebelum sesi']::text[],array['Aktivitas berisiko memerlukan supervisi dan kontrol operasional yang sesuai']::text[],4),
 ('private-special-moments','special-moment-setup','DEMO — Special Moments — Beautifully Arranged','Your Moment, Thoughtfully Created.','Konsep setup ulang tahun, proposal, anniversary, dan honeymoon. Tema, lokasi, cuaca, personel, dan vendor dikonfirmasi admin sebelum menerima pembayaran. Produk DEMO.','Setup sesuai paket, perlu konfirmasi admin',array['Preferensi tema dan warna','Lokasi belum dikonfirmasi','Kustomisasi melalui permintaan']::text[],array['Konsep dekorasi (DEMO)']::text[],array['Vendor dan layanan tambahan dikonfirmasi terpisah']::text[],array['Tanggal, jumlah tamu, preferensi tema']::text[],array['Tanggal dan lokasi harus disetujui admin sebelum pembayaran']::text[],5)
) v(category_slug,slug,title,tagline,description,duration,highlights,inclusions,exclusions,prerequisites,safety,sort_order)
join public.shiap_experience_categories c on c.slug=v.category_slug
on conflict(slug) do nothing;

insert into public.shiap_experiences(experience_type,title,slug,short_description,description,duration,location,base_price,price_basis,price_unit_label,status,catalog_category,addons)
select 'activity',p.title||' — service '||v.package_slug,p.slug||'-'||v.package_slug,left(v.description,220),v.description,p.duration,'DEMO — lokasi belum terverifikasi',v.price,case when v.basis='per_person' then 'per_person' else 'per_unit' end,v.label,'draft','activity','[]'::jsonb
from (values
 ('freediving-class','discovery-freediving',750000::numeric,'per_person','peserta','Pengenalan keterampilan dasar. DEMO.'),
 ('freediving-class','beginner-freediving',1250000::numeric,'per_person','peserta','Workshop pengenalan. DEMO.'),
 ('freediving-class','private-coaching',2500000::numeric,'per_session','sesi','Sesi privat; kualifikasi instruktur wajib diverifikasi.'),
 ('beach-private-dinner','sunset-dinner',1250000::numeric,'per_couple','pasangan','Konsep sunset dinner. DEMO.'),
 ('beach-private-dinner','romantic-dinner',1950000::numeric,'per_couple','pasangan','Konsep romantic dinner. DEMO.'),
 ('beach-private-dinner','premium-celebration-dinner',3500000::numeric,'fixed_package','paket','Konsep celebration dinner. DEMO.'),
 ('spearfishing-experience','skills-safety-workshop',850000::numeric,'per_person','peserta','Workshop keselamatan tanpa live hunting. DEMO.'),
 ('spearfishing-experience','guided-hunting-draft',1500000::numeric,'per_person','peserta','DRAFT — jangan terbitkan sebelum verifikasi legalitas dan keselamatan.'),
 ('spearfishing-experience','private-hunting-draft',3500000::numeric,'per_group','grup','DRAFT — jangan terbitkan sebelum verifikasi legalitas dan keselamatan.'),
 ('outdoor-survival-experience','survival-basics',450000::numeric,'per_person','peserta','Keterampilan dasar. DEMO.'),
 ('outdoor-survival-experience','coastal-survival-workshop',850000::numeric,'per_person','peserta','Workshop pesisir. DEMO.'),
 ('outdoor-survival-experience','private-survival',2500000::numeric,'per_group','grup','Sesi privat. DEMO.'),
 ('special-moment-setup','birthday-setup',950000::numeric,'fixed_package','paket','Setup ulang tahun. DEMO.'),
 ('special-moment-setup','proposal-setup',1750000::numeric,'fixed_package','paket','Setup proposal. DEMO.'),
 ('special-moment-setup','anniversary-premium',2500000::numeric,'fixed_package','paket','Setup anniversary. DEMO.'),
 ('special-moment-setup','honeymoon-setup',3500000::numeric,'fixed_package','paket','Setup honeymoon. DEMO.')
) v(product_slug,package_slug,price,basis,label,description)
join public.shiap_experience_products p on p.slug=v.product_slug
on conflict(slug) do nothing;

insert into public.shiap_experience_packages(product_id,catalog_service_id,slug,title,description,duration,price,pricing_basis,price_label,booking_mode,min_guests,max_guests,status,requires_manual_approval,is_demo,sort_order)
select p.id,e.id,v.package_slug,v.package_title,v.description,p.duration,v.price,v.basis,v.label,v.mode,v.min_guests,v.max_guests,v.status,v.manual,true,v.sort_order
from (values
 ('freediving-class','discovery-freediving','Discovery Freediving',750000::numeric,'per_person','peserta','request_to_book',1,10,'published',true,1,'Pengenalan keterampilan dan keselamatan. DEMO.'),
 ('freediving-class','beginner-freediving','Beginner Freediving',1250000::numeric,'per_person','peserta','request_to_book',1,8,'draft',true,2,'Workshop tingkat pemula. DEMO.'),
 ('freediving-class','private-coaching','Private Coaching',2500000::numeric,'per_session','sesi','request_to_book',1,4,'draft',true,3,'Sesi privat. Kualifikasi pengajar belum diverifikasi.'),
 ('beach-private-dinner','sunset-dinner','Sunset Dinner',1250000::numeric,'per_couple','pasangan','request_to_book',2,2,'published',true,1,'Konsep dinner untuk pasangan. DEMO.'),
 ('beach-private-dinner','romantic-dinner','Romantic Dinner',1950000::numeric,'per_couple','pasangan','request_to_book',2,2,'draft',true,2,'Konsep romantic dinner. DEMO.'),
 ('beach-private-dinner','premium-celebration-dinner','Premium Celebration Dinner',3500000::numeric,'fixed_package','paket','request_to_book',2,10,'draft',true,3,'Konsep celebration dinner. DEMO.'),
 ('spearfishing-experience','skills-safety-workshop','Skills & Safety Workshop',850000::numeric,'per_person','peserta','request_to_book',1,8,'published',true,1,'Workshop tanpa live hunting. DEMO.'),
 ('spearfishing-experience','guided-hunting-draft','Guided Hunting (DRAFT)',1500000::numeric,'per_person','peserta','request_to_book',1,4,'draft',true,2,'DRAFT — legalitas, guide, lokasi, cuaca, dan keselamatan belum diverifikasi.'),
 ('spearfishing-experience','private-hunting-draft','Private Guided Hunting (DRAFT)',3500000::numeric,'per_group','grup','request_to_book',1,4,'draft',true,3,'DRAFT — tidak untuk penjualan.'),
 ('outdoor-survival-experience','survival-basics','Survival Basics',450000::numeric,'per_person','peserta','request_to_book',1,12,'published',true,1,'Workshop dasar. DEMO.'),
 ('outdoor-survival-experience','coastal-survival-workshop','Coastal Survival Workshop',850000::numeric,'per_person','peserta','request_to_book',1,12,'draft',true,2,'Workshop pesisir. DEMO.'),
 ('outdoor-survival-experience','private-survival','Private Survival Experience',2500000::numeric,'per_group','grup','request_to_book',1,10,'draft',true,3,'Sesi privat. DEMO.'),
 ('special-moment-setup','birthday-setup','Birthday Surprise Setup',950000::numeric,'fixed_package','paket','request_to_book',1,20,'published',true,1,'Setup ulang tahun. DEMO.'),
 ('special-moment-setup','proposal-setup','Romantic Proposal Setup',1750000::numeric,'fixed_package','paket','request_to_book',1,10,'draft',true,2,'Setup proposal. DEMO.'),
 ('special-moment-setup','anniversary-premium','Anniversary Premium Setup',2500000::numeric,'fixed_package','paket','request_to_book',1,20,'draft',true,3,'Setup anniversary. DEMO.'),
 ('special-moment-setup','honeymoon-setup','Honeymoon Experience Setup',3500000::numeric,'fixed_package','paket','request_to_book',1,10,'draft',true,4,'Setup honeymoon. DEMO.')
) v(product_slug,package_slug,package_title,price,basis,label,mode,min_guests,max_guests,status,manual,sort_order,description)
join public.shiap_experience_products p on p.slug=v.product_slug
join public.shiap_experiences e on e.slug=p.slug||'-'||v.package_slug
on conflict(product_id,slug) do nothing;

insert into public.shiap_experience_addons(package_id,slug,name,description,price,pricing_basis,is_demo,sort_order)
select k.id,v.slug,v.name,'Add-on contoh. Konfirmasi ketersediaan oleh admin.',v.price,case when k.pricing_basis='per_person' then 'participant' else 'package' end,true,v.sort_order
from (values
 ('freediving-class','discovery-freediving','underwater-photo','Underwater photography',150000::numeric,1),
 ('freediving-class','discovery-freediving','equipment-rental','Equipment rental',100000::numeric,2),
 ('beach-private-dinner','sunset-dinner','floral-decoration','Floral decoration',250000::numeric,1),
 ('beach-private-dinner','sunset-dinner','photography','Photography',450000::numeric,2),
 ('beach-private-dinner','sunset-dinner','live-acoustic','Live acoustic music',850000::numeric,3),
 ('beach-private-dinner','sunset-dinner','custom-cake','Custom cake',300000::numeric,4),
 ('outdoor-survival-experience','survival-basics','camping-equipment','Camping equipment',175000::numeric,1),
 ('outdoor-survival-experience','survival-basics','meals','Meals',85000::numeric,2),
 ('outdoor-survival-experience','survival-basics','transport','Transport',250000::numeric,3),
 ('outdoor-survival-experience','survival-basics','documentation','Documentation',350000::numeric,4),
 ('special-moment-setup','birthday-setup','photography','Photography',350000::numeric,1),
 ('special-moment-setup','birthday-setup','videography','Videography',450000::numeric,2),
 ('special-moment-setup','birthday-setup','floral-arrangement','Floral arrangements',300000::numeric,3),
 ('special-moment-setup','birthday-setup','custom-cake','Custom cake',250000::numeric,4),
 ('special-moment-setup','birthday-setup','private-dinner','Private dinner',750000::numeric,5),
 ('special-moment-setup','birthday-setup','live-music','Live music',850000::numeric,6)
) v(product_slug,package_slug,slug,name,price,sort_order)
join public.shiap_experience_products p on p.slug=v.product_slug
join public.shiap_experience_packages k on k.product_id=p.id and k.slug=v.package_slug
on conflict(package_id,slug) do nothing;

commit;

