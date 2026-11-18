"use client";

import { BedDouble, Bike, Camera, Compass, Flame, Leaf, MapPin, ShieldCheck, Ship, Sparkles, UsersRound, Zap, Waves } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SiteIcon } from "@/components/site/site-icon-provider";
import type { SiteIconKey } from "@/lib/site-icons";

const fallbackIcons = {
  search: Compass,
  trust_destinations: ShieldCheck,
  trust_booking: Zap,
  trust_partners: UsersRound,
  trust_sustainability: Leaf,
  featured_trips: Flame,
  popular_destinations: MapPin,
  more_experiences: Compass,
  custom_trip: Sparkles,
  trip: Ship,
  private_trip: UsersRound,
  shinema: Camera,
  activities: Waves,
  stay: BedDouble,
  rental: Bike,
} satisfies Partial<Record<SiteIconKey, LucideIcon>>;

type HomepageIconKey = keyof typeof fallbackIcons;

export default function HomepageUiIcon({ iconKey, size, strokeWidth, className }: {
  iconKey: HomepageIconKey;
  size: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Fallback = fallbackIcons[iconKey];
  return <SiteIcon iconKey={iconKey} fallback={Fallback} size={size} strokeWidth={strokeWidth} className={className} />;
}
