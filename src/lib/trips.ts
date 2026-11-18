export type TripCategory =
  | "Semua"
  | "Open Trip"
  | "Private Trip"
  | "Snorkeling"
  | "Island Hopping";

export type TripMode = "open" | "private";

export type Trip = {
  slug: string;
  title: string;
  location: string;
  category: Exclude<TripCategory, "Semua">[];
  duration: string;
  description: string;
  image: string;
  gallery: string[];
  highlights: string[];
  featured?: boolean;
  modes: TripMode[];
  openTripInfo: string;
  privateTripInfo: string;
  itinerary: { day?: string; dayTitle?: string; time: string; title: string; description: string }[];
  included: string[];
  excluded: string[];
  meetingPoint: string;
  preparation: string[];
  notes: string[];
  youtubeTourUrl?: string | null;
  pricingModel?: string | null;
  minimumPackagePrice?: number | null;
  priceTiers?: { min_pax: number; max_pax: number; price_per_person: number }[];
  minPax?: number;
  maxPax?: number;
  departures?: { id: string; departureDate: string; endDate?: string | null; pricePerPerson: number | null; minParticipants: number; maxParticipants: number; bookedSeats: number; status: string }[];
};

export const trips: Trip[] = [
  {
    slug: "kerayaan-beccuu-explorer",
    title: "Kerayaan & Beccuu Explorer",
    location: "Pulau Kerayaan, Kotabaru",
    category: ["Open Trip", "Island Hopping", "Snorkeling"],
    duration: "3 Hari 2 Malam · dapat disesuaikan",
    description:
      "Jelajahi pesona Pulau Kerayaan dan Kerayaan Beccuu. Nikmati panorama pesisir, pengalaman snorkeling di perairan pilihan, serta suasana pulau yang menjadi salah satu cerita terbaik dari Kotabaru.",
    image:
      "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1600&q=90",
    gallery: [
      "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1400&q=85",
      "https://images.unsplash.com/photo-1510414842594-a61c69b5ae57?auto=format&fit=crop&w=1000&q=85",
      "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1000&q=85",
      "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1000&q=85",
    ],
    highlights: [
      "Explore Pulau Kerayaan",
      "Island hopping ke Kerayaan Beccuu",
      "Snorkeling di spot pilihan",
      "Dokumentasi perjalanan",
    ],
    featured: true,
    modes: ["open", "private"],
    openTripInfo:
      "Gabung bersama peserta lain pada tanggal keberangkatan yang diumumkan SHIAP. Ketersediaan kursi dan harga mengikuti jadwal yang aktif.",
    privateTripInfo:
      "Tentukan tanggal perjalanan dan jumlah peserta sendiri. Tim SHIAP akan membantu menyesuaikan rute, kebutuhan aktivitas, serta penawaran harga.",
    itinerary: [
      { time: "Hari 1", title: "Menuju Kotabaru & Pulau Kerayaan", description: "Perjalanan menuju titik kumpul, dilanjutkan penyeberangan dan check-in sesuai paket." },
      { time: "Hari 2", title: "Island Hopping & Snorkeling", description: "Jelajahi pulau dan spot laut pilihan dengan pendampingan tim trip." },
      { time: "Hari 3", title: "Waktu bebas & perjalanan pulang", description: "Nikmati suasana pagi, persiapan check-out, lalu kembali sesuai jadwal." },
    ],
    included: [
      "Transportasi dan penyeberangan sesuai itinerary paket",
      "Akomodasi sesuai tipe paket yang dipilih",
      "Pemandu perjalanan",
      "Peralatan snorkeling jika tercantum pada paket",
      "Dokumentasi sesuai paket yang dipilih",
    ],
    excluded: [
      "Pengeluaran pribadi di luar fasilitas paket",
      "Makan selama perjalanan menuju meeting point",
      "Aktivitas tambahan di luar itinerary",
      "Biaya lain yang tidak disebutkan pada rincian paket",
    ],
    meetingPoint: "Meeting point dan detail keberangkatan diinformasikan saat jadwal atau penawaran dikonfirmasi oleh tim SHIAP.",
    preparation: [
      "Siapkan identitas diri dan barang pribadi secukupnya",
      "Bawa pakaian ganti, perlindungan matahari, dan obat pribadi",
      "Gunakan tas tahan air untuk barang elektronik",
      "Ikuti arahan pemandu selama aktivitas laut",
    ],
    notes: [
      "Itinerary dapat menyesuaikan cuaca, kondisi laut, dan keselamatan peserta.",
      "Foto pada halaman ini merupakan materi ilustrasi sementara dan akan diganti dengan dokumentasi asli SHIAP.",
      "Fasilitas final mengikuti rincian penawaran dan konfirmasi booking.",
    ],
  },
  {
    slug: "teluk-tamiang-experience",
    title: "Teluk Tamiang Experience",
    location: "Teluk Tamiang, Kotabaru",
    category: ["Private Trip", "Snorkeling"],
    duration: "Durasi menyesuaikan paket",
    description:
      "Nikmati suasana Teluk Tamiang dengan panorama laut, pengalaman snorkeling, dan aktivitas pesisir. Rancang perjalanan santai maupun petualangan bersama orang-orang terdekat.",
    image:
      "https://images.unsplash.com/photo-1510414842594-a61c69b5ae57?auto=format&fit=crop&w=1600&q=90",
    gallery: [
      "https://images.unsplash.com/photo-1510414842594-a61c69b5ae57?auto=format&fit=crop&w=1400&q=85",
      "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1000&q=85",
      "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1000&q=85",
    ],
    highlights: [
      "Explore kawasan Teluk Tamiang",
      "Snorkeling sesuai kondisi laut",
      "Aktivitas pantai",
      "Pilihan dokumentasi",
    ],
    modes: ["private"],
    openTripInfo: "Open Trip belum tersedia untuk destinasi ini. Hubungi tim SHIAP untuk mengetahui jadwal gabungan berikutnya.",
    privateTripInfo: "Atur tanggal, jumlah peserta, dan aktivitas yang diinginkan bersama tim SHIAP.",
    itinerary: [
      { time: "Pagi", title: "Meeting point & perjalanan", description: "Bertemu dengan tim dan memulai perjalanan menuju kawasan Teluk Tamiang." },
      { time: "Siang", title: "Explore & aktivitas laut", description: "Nikmati kawasan pesisir dan aktivitas sesuai kondisi cuaca serta laut." },
      { time: "Sore", title: "Kembali ke meeting point", description: "Persiapan pulang dan perjalanan kembali." },
    ],
    included: [
      "Transportasi sesuai penawaran",
      "Pemandu perjalanan sesuai paket",
      "Aktivitas yang tercantum dalam penawaran",
    ],
    excluded: [
      "Pengeluaran pribadi",
      "Makan dan minum di luar rincian paket",
      "Aktivitas tambahan yang tidak dipilih",
    ],
    meetingPoint: "Meeting point disepakati saat konsultasi dan konfirmasi paket.",
    preparation: [
      "Bawa pakaian ganti dan perlengkapan pribadi",
      "Gunakan alas kaki yang nyaman",
      "Bawa obat pribadi dan perlindungan matahari",
    ],
    notes: [
      "Rute dan aktivitas mengikuti kondisi cuaca serta keselamatan.",
      "Foto masih berupa ilustrasi sementara, bukan dokumentasi destinasi yang telah diverifikasi.",
    ],
  },
  {
    slug: "birah-birahan-adventure",
    title: "Birah-Birahan Adventure",
    location: "Pulau Birah-Birahan, Kotabaru",
    category: ["Private Trip", "Island Hopping", "Snorkeling"],
    duration: "Durasi menyesuaikan paket",
    description:
      "Petualangan menuju Pulau Birah-Birahan untuk menikmati lanskap pulau, suasana alam, dan pesona laut. Perjalanan disusun sesuai kondisi lapangan dan kebutuhan peserta.",
    image:
      "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1600&q=90",
    gallery: [
      "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1400&q=85",
      "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1000&q=85",
      "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1000&q=85",
    ],
    highlights: [
      "Explore Pulau Birah-Birahan",
      "Panorama laut dan pesisir",
      "Aktivitas snorkeling sesuai kondisi",
      "Dokumentasi sesuai paket",
    ],
    modes: ["private"],
    openTripInfo: "Open Trip belum tersedia untuk destinasi ini. Tanyakan kepada tim SHIAP mengenai rencana keberangkatan bersama.",
    privateTripInfo: "Perjalanan private dapat dikonsultasikan berdasarkan tanggal, jumlah peserta, dan kondisi operasional destinasi.",
    itinerary: [
      { time: "Pagi", title: "Persiapan & penyeberangan", description: "Koordinasi dengan tim, briefing keselamatan, dan perjalanan laut." },
      { time: "Siang", title: "Explore pulau", description: "Menikmati kawasan pulau dan aktivitas sesuai kondisi setempat." },
      { time: "Sore", title: "Perjalanan kembali", description: "Persiapan kembali dengan mengikuti arahan pemandu." },
    ],
    included: [
      "Transportasi laut sesuai penawaran",
      "Pemandu sesuai paket",
      "Aktivitas yang disepakati",
    ],
    excluded: [
      "Pengeluaran pribadi",
      "Kebutuhan di luar fasilitas paket",
      "Aktivitas tambahan di luar penawaran",
    ],
    meetingPoint: "Lokasi meeting point dan jam keberangkatan dikonfirmasi oleh tim SHIAP sebelum perjalanan.",
    preparation: [
      "Bawa perlengkapan pribadi dan pakaian ganti",
      "Gunakan tas tahan air",
      "Ikuti briefing keselamatan dan arahan kru kapal",
    ],
    notes: [
      "Perjalanan laut sangat bergantung pada cuaca dan kondisi gelombang.",
      "Foto masih berupa ilustrasi sementara, bukan dokumentasi destinasi yang telah diverifikasi.",
    ],
  },
];
