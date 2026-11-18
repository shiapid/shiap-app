"use client";

import { MessageCircle } from "lucide-react";

export function PlacesWhatsAppLink({ href, propertyId, refCode, className }: { href: string; propertyId: string; refCode: string; className?: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => {
    void fetch("/api/places/wa-click", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ propertyId, refCode }),
      keepalive: true,
    }).catch(() => undefined);
  }} className={className}>
    <MessageCircle size={16} aria-hidden="true" /> Hubungi via WhatsApp
  </a>;
}
