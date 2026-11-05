export type TripCategory =
  | "Semua"
  | "Open Trip"
  | "Private Trip"
  | "Snorkeling"
  | "Island Hopping";

export type Trip = {
  slug: string;
  title: string;
  location: string;
  category: Exclude<TripCategory, "Semua">[];
  duration: string;
  description: string;
  image: string;
  highlights: string[];
  featured?: boolean;
};

export const trips: Trip[] = [
  {
    slug: "kerayaan-beccuu-explorer",
    title: "Kerayaan & Beccuu Explorer",
    location: "Pulau Kerayaan, Kotabaru",
    category: ["Open Trip", "Island Hopping", "Snorkeling"],
    duration: "Paket menyesuaikan jadwal",
    description:
      "Jelajahi keindahan Pulau Kerayaan dan Kerayaan Beccuu, nikmati panorama pesisir, serta pengalaman snorkeling di perairan Kotabaru.",
    image:
      "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1200&q=85",
    highlights: [
      "Explore Pulau Kerayaan",
      "Island hopping ke Kerayaan Beccuu",
      "Snorkeling di spot pilihan",
      "Dokumentasi perjalanan",
    ],
    featured: true,
  },
  {
    slug: "teluk-tamiang-experience",
    title: "Teluk Tamiang Experience",
    location: "Teluk Tamiang, Kotabaru",
    category: ["Private Trip", "Snorkeling"],
    duration: "Paket menyesuaikan kebutuhan",
    description:
      "Nikmati suasana Teluk Tamiang dengan panorama laut, pengalaman snorkeling, dan aktivitas pesisir.",
    image:
      "https://images.unsplash.com/photo-1510414842594-a61c69b5ae57?auto=format&fit=crop&w=1200&q=85",
    highlights: [
      "Explore kawasan Teluk Tamiang",
      "Snorkeling",
      "Aktivitas pantai",
      "Pilihan dokumentasi",
    ],
    featured: true,
  },
  {
    slug: "birah-birahan-adventure",
    title: "Birah-Birahan Adventure",
    location: "Pulau Birah-Birahan, Kotabaru",
    category: ["Private Trip", "Island Hopping", "Snorkeling"],
    duration: "Paket menyesuaikan jadwal",
    description:
      "Petualangan menuju Pulau Birah-Birahan untuk menikmati lanskap pulau dan pesona alam lautnya.",
    image:
      "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1200&q=85",
    highlights: [
      "Explore Pulau Birah-Birahan",
      "Panorama laut dan pesisir",
      "Aktivitas snorkeling sesuai kondisi",
      "Dokumentasi perjalanan",
    ],
  },
];
