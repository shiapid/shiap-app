export const SITE_ICON_SLOTS = [
  { key: "home", label: "Beranda", description: "Menu utama Beranda." },
  { key: "explore", label: "Explore", description: "Navigasi katalog perjalanan." },
  { key: "booking", label: "Booking", description: "Navigasi keranjang booking." },
  { key: "profile", label: "Profil", description: "Navigasi akun pelanggan." },
  { key: "trip", label: "Trip", description: "Menu layanan Trip." },
  { key: "stay", label: "Stay", description: "Menu layanan Stay dan Villa." },
  { key: "activities", label: "Wahana & Aktivitas", description: "Menu aktivitas laut." },
  { key: "rental", label: "Rental", description: "Menu layanan sewa perlengkapan wisata." },
  { key: "shinema", label: "Shinema", description: "Menu layanan dokumentasi." },
  { key: "my_booking", label: "Booking Saya", description: "Menu riwayat booking pelanggan." },
  { key: "custom_trip", label: "Custom Trip", description: "Akses perancangan Custom Trip." },
  { key: "services", label: "Layanan", description: "Tombol untuk membuka menu layanan." },
  { key: "menu", label: "Menu", description: "Tombol menu pada header homepage." },
  { key: "search", label: "Pencarian", description: "Ikon kolom pencarian homepage." },
  { key: "notifications", label: "Notifikasi", description: "Ikon notifikasi pada header homepage." },
  { key: "favorites", label: "Favorit", description: "Ikon simpan trip ke daftar favorit." },
  { key: "trust_destinations", label: "Keunggulan: Destinasi", description: "Ikon informasi destinasi terkurasi di homepage." },
  { key: "trust_booking", label: "Keunggulan: Booking", description: "Ikon informasi booking mudah dan aman." },
  { key: "trust_partners", label: "Keunggulan: Partner Lokal", description: "Ikon informasi partner lokal SHIAP." },
  { key: "trust_sustainability", label: "Keunggulan: Dukungan", description: "Ikon informasi dukungan wisata berkelanjutan." },
  { key: "featured_trips", label: "Judul: Pilihan Trip", description: "Ikon pada judul section Pilihan Trip Spesial." },
  { key: "popular_destinations", label: "Judul: Destinasi Populer", description: "Ikon pada judul section destinasi populer." },
  { key: "more_experiences", label: "Judul: Pengalaman SHIAP", description: "Ikon pada judul section Pengalaman SHIAP." },
  { key: "private_trip", label: "Private Trip", description: "Ikon pengalaman Private Trip pada homepage." },
] as const;

export type SiteIconKey = (typeof SITE_ICON_SLOTS)[number]["key"];

export const SITE_ICON_LABELS: Record<SiteIconKey, string> = Object.fromEntries(
  SITE_ICON_SLOTS.map(({ key, label }) => [key, label]),
) as Record<SiteIconKey, string>;
