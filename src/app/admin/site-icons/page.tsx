import SiteIconSettings from "@/components/admin/site-icon-settings";

export const dynamic = "force-dynamic";

export default function AdminSiteIconsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#1974FF]">ADMIN SETTINGS / BRANDING</p>
      <h1 className="text-2xl font-extrabold text-[#0A2E63]">Ikon Website</h1>
      <p className="mb-5 max-w-3xl text-sm text-slate-500">
        Unggah PNG untuk mengganti ikon menu utama dan layanan di website pelanggan. Ikon bawaan akan digunakan jika slot belum memiliki gambar.
      </p>
      <SiteIconSettings />
    </div>
  );
}
