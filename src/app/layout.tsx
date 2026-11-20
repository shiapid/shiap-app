import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SiteIconProvider } from "@/components/site/site-icon-provider";
import CustomerAppShell from "@/components/layout/customer-app-shell";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#0f172a", // Sesuaikan dengan warna brand utama SHIAP
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "SHIAP — Travel, Stay & Experience",
    template: "%s | SHIAP",
  },
  description:
    "Discover the beauty of Kotabaru, Indonesia. Explore island trips, comfortable stays, underwater experiences and more with SHIAP.",
  applicationName: "SHIAP",
  keywords: [
    "SHIAP",
    "Wisata Kotabaru",
    "Trip Kotabaru",
    "Island Hopping",
    "Snorkeling",
    "Villa Kotabaru",
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SHIAP",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteIconProvider>
          <CustomerAppShell>{children}</CustomerAppShell>
        </SiteIconProvider>
      </body>
    </html>
  );
}
