"use client";

import { useParams } from "next/navigation";
import BookingDetailClient from "@/components/customer/booking-detail-client";

export default function MyBookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <BookingDetailClient key={id} id={id} />;
}
