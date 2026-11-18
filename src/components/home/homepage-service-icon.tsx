"use client";

import { BedDouble, Bike, Building2, Camera, LifeBuoy, Waves } from "lucide-react";
import { SiteIcon } from "@/components/site/site-icon-provider";
import type { SiteIconKey } from "@/lib/site-icons";

const fallbackIcons = {
  trip: Waves,
  stay: BedDouble,
  places: Building2,
  activities: LifeBuoy,
  rental: Bike,
  shinema: Camera,
} satisfies Partial<Record<SiteIconKey, typeof Waves>>;

export default function HomepageServiceIcon({ iconKey }: { iconKey: keyof typeof fallbackIcons }) {
  const Icon = fallbackIcons[iconKey];
  return <SiteIcon iconKey={iconKey} fallback={Icon} size={24} strokeWidth={2.1} />;
}
