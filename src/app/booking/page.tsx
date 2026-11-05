import BookingEngineClient from "@/components/booking/booking-engine-client";

export const metadata = {
  title: "Booking | SHIAP",
  description: "Pesan Trip, Stay, Wahana, Dokumentasi dan layanan SHIAP dalam satu keranjang.",
};

export default function BookingPage() {
  return <BookingEngineClient />;
}
