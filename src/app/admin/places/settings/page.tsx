import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { loadPlacesWhatsAppTemplate } from "@/lib/places/whatsapp-settings";
import { PlacesWhatsAppSettings } from "@/components/admin/places-whatsapp-settings";

export const dynamic = "force-dynamic";
export default async function PlacesSettingsPage() {
  await requireAdmin();
  const template = await loadPlacesWhatsAppTemplate();
  return <div className="space-y-4"><Link href="/admin/places" className="text-sm font-bold text-[#1265D8]">← Admin Places</Link><p className="text-xs text-slate-500">Places → Pengaturan</p><h1 className="text-2xl font-extrabold text-[#0A2E63]">Template WhatsApp</h1><PlacesWhatsAppSettings initialTemplate={template}/></div>;
}
