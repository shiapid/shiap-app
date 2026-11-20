import { AdminWorkspace } from "@/components/admin/admin-shell-navigation";
import { requireAdmin } from "@/lib/admin/guard";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <AdminWorkspace>{children}</AdminWorkspace>;
}
