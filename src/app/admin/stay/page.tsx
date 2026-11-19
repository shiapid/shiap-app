import Link from "next/link";
﻿import { requireAdmin } from "@/lib/admin/guard";
import CatalogManager from "@/components/admin/catalog-manager";

export const dynamic = "force-dynamic";

export default async function AdminStayPage() {
  await requireAdmin();
  return <div className="space-y-4"><Link href="/admin/stay/partners" className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-[#1265D8]">Kemitraan &amp; perjanjian Stay →</Link><CatalogManager mode="stay" /></div>;
}
