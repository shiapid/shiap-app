import { requireAdmin } from "@/lib/admin/guard";
import CatalogManager from "@/components/admin/catalog-manager";

export const dynamic = "force-dynamic";

export default async function AdminStayPage() {
  await requireAdmin();
  return <CatalogManager mode="stay" />;
}
