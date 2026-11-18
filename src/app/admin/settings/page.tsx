import PaymentSettingsForm from "@/components/admin/payment-settings-form";

import HomeHeroSettingsForm from "@/components/admin/home-hero-settings-form";
import ServiceFeeSettingsForm from "@/components/admin/service-fee-settings-form";
import NotificationSettingsForm from "@/components/admin/notification-settings-form";
import BusinessContactSettingsForm from "@/components/admin/business-contact-settings-form";

export const dynamic = "force-dynamic";

export default function AdminSettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#1974FF]">ADMIN SETTINGS</p>
      <h1 className="text-2xl font-extrabold text-[#0A2E63]">Pengaturan Website</h1>
      <p className="mb-5 text-sm text-slate-500">Kelola konten yang tampil pada website dan informasi operasional SHIAP.</p>
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-extrabold text-[#0A2E63]">Banner Explore halaman utama</h2>
        <HomeHeroSettingsForm />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-extrabold text-[#0A2E63]">Pengaturan Pembayaran</h2>
        <PaymentSettingsForm />
      </section>
      <section className="pt-6">
        <h2 className="mb-3 text-lg font-extrabold text-[#0A2E63]">Biaya Layanan SHIAP</h2>
        <ServiceFeeSettingsForm />
      </section>
      <section className="pt-6">
        <h2 className="mb-3 text-lg font-extrabold text-[#0A2E63]">Pengaturan Notifikasi</h2>
        <NotificationSettingsForm />
      </section>
      <section className="pt-6">
        <h2 className="mb-3 text-lg font-extrabold text-[#0A2E63]">SHIAP Business Contact Settings</h2>
        <BusinessContactSettingsForm />
      </section>
    </div>
  );
}
