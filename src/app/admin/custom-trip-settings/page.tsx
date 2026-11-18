import CustomTripSettingsForm from "@/components/admin/custom-trip-settings-form";

export const dynamic = "force-dynamic";

export default function AdminCustomTripSettingsPage() {
  return <div className="mx-auto max-w-4xl space-y-2">
    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#1974FF]">ADMIN SETTINGS / CUSTOMER EXPERIENCE</p>
    <h1 className="text-2xl font-extrabold text-[#0A2E63]">Pengaturan Custom Trip</h1>
    <p className="mb-5 text-sm text-slate-500">Atur pilihan destinasi, durasi, wahana, penginapan, dan nomor WhatsApp admin yang menerima permintaan estimasi.</p>
    <CustomTripSettingsForm />
  </div>;
}
