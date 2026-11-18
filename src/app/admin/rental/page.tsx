import ExperienceManager from "@/components/admin/experience-manager";

export const dynamic = "force-dynamic";

export default function AdminRentalPage() {
  return <ExperienceManager type="activity" catalogCategory="rental" />;
}
