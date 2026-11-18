import { AdminSidebar, AdminTopbar } from "@/components/admin/admin-shell-navigation";
import { requireAdmin } from "@/lib/admin/guard";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="min-h-dvh bg-[#F2F5FA] text-slate-900">
      <AdminSidebar />
      <div className="min-h-dvh min-w-0 lg:pl-[258px]">
        <AdminTopbar />
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8 lg:pb-10">
          {children}
        </main>
      </div>
    </div>
  );
}
