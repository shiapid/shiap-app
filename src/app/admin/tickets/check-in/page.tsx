import { requireAdmin } from "@/lib/admin/guard";
import TicketCheckinScanner from "@/components/admin/ticket-checkin-scanner";

export const dynamic = "force-dynamic";
export default async function AdminTicketCheckinPage() {
  await requireAdmin();
  return <div className="space-y-3"><p className="text-sm text-slate-500">QR tiket lunas dan status kehadiran.</p><TicketCheckinScanner/></div>;
}
