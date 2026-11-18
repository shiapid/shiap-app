import { BedDouble, Bike, Camera, Compass, Layers3, Ship, Waves } from "lucide-react";

const categoryIcons = {
  trip: Ship, stay: BedDouble, rental: Bike, activity: Waves, experience: Compass,
  documentation: Camera, shinema: Camera, other: Layers3, all: Layers3,
};

export default function ServiceCategoryIcon({ category, size = 16, className = "" }: {
  category: string; size?: number; className?: string;
}) {
  const Icon = categoryIcons[category as keyof typeof categoryIcons] || Layers3;
  return <Icon aria-hidden size={size} strokeWidth={1.8} className={"shrink-0 " + className} />;
}
