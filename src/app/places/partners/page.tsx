import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BadgeCheck, Building2, Check, CircleHelp, Handshake, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatIdr, type PlacesPublicPlan } from "@/lib/places/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kemitraan Places", description: "Pilihan kerja sama penginapan bersama SHIAP Places dan Stay." };

const comparison = [
  ["Direktori penginapan", "Tersedia setelah proses SHIAP", "Direncanakan", "Tidak, distribusi Stay"],
  ["Kontak terverifikasi", "Ya, ditinjau berkala", "Ya, mengikuti proses", "Mengikuti proses Stay"],
  ["Galeri & profil lengkap", "Profil dasar", "Rencana", "Mengikuti kontrak"],
  ["Harga & tipe kamar", "Ditanyakan ke properti", "Rencana pengelolaan mandiri", "Dikelola sesuai kerja sama"],
  ["Kalender & booking engine", "Belum tersedia", "Direncanakan; belum aktif", "Gunakan alur Stay yang tersedia"],
  ["Dashboard pemilik", "Belum tersedia", "Direncanakan", "Operasional bersama SHIAP"],
  ["Pembayaran oleh tamu", "Langsung dikonfirmasi ke properti", "Belum tersedia", "Sesuai ketentuan/kontrak Stay"],
  ["Model komersial", "Gratis", "Langganan per properti (rencana)", "Kerja sama berdasarkan kontrak"],
];

export default async function PlacesPartnersPage() {
  let plan: PlacesPublicPlan | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("places_public_plan_v").select("premium_monthly_price_idr,price_status,max_units,premium_enabled").eq("id", true).maybeSingle();
    plan = data as PlacesPublicPlan | null;
  } catch { /* The page remains useful without a configured commercial price. */ }
  const price = plan ? formatIdr(plan.premium_monthly_price_idr) : null;
  const premiumPriceLabel = !price ? "Harga belum dikonfigurasi" : plan?.price_status === "proposed" ? `Usulan pilot ${price}/bulan/properti` : `${price}/bulan/properti`;
  const premiumState = plan?.premium_enabled ? "Tersedia sesuai proses kemitraan" : "Belum tersedia untuk pendaftaran atau booking";
  return <main className="min-h-dvh bg-[#F7F9FC] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#0A2E63]">
    <section className="bg-[#0A2E63] px-4 py-12 text-white sm:px-8 sm:py-16"><div className="mx-auto max-w-6xl">
      <p className="text-[10px] font-extrabold tracking-[.2em] text-blue-200">SHIAP FOR PARTNERS</p>
      <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">Your Property. More Possibilities.</h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-blue-100">Dari sekadar terdaftar hingga operasional reservasi yang dikelola lebih profesional. Pilih layanan SHIAP yang sesuai dengan kebutuhan bisnis Anda.</p>
      <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold"><ShieldCheck size={16} className="text-[#FF8518]"/> Kontak bisnis ditinjau secara berkala</div>
    </div></section>
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#1265D8]"><BadgeCheck size={22}/></div><p className="mt-4 text-[10px] font-extrabold tracking-[.15em] text-[#1265D8]">PLACES FREE</p><h2 className="mt-1 text-xl font-extrabold">Direktori kontak</h2><p className="mt-2 text-sm leading-6 text-slate-600">Untuk menampilkan nama properti, destinasi, dan kanal WhatsApp resmi setelah proses peninjauan.</p><p className="mt-4 text-2xl font-extrabold">Gratis</p><ul className="mt-4 space-y-2 text-xs leading-5 text-slate-600"><li className="flex gap-2"><Check size={15} className="shrink-0 text-[#1265D8]"/>Visibilitas direktori Places</li><li className="flex gap-2"><Check size={15} className="shrink-0 text-[#1265D8]"/>Kontak yang telah ditinjau SHIAP</li><li className="flex gap-2"><Check size={15} className="shrink-0 text-[#1265D8]"/>Pemeriksaan ulang mengikuti masa verifikasi</li></ul><p className="mt-4 rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">{`Pendaftaran online belum dibuka. Listing tidak diterbitkan otomatis.`}</p></article>
        <article className="relative rounded-2xl border border-blue-200 bg-white p-5 shadow-[0_12px_34px_rgba(18,101,216,.08)] sm:p-6"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1265D8] text-white"><Building2 size={22}/></div><p className="mt-4 text-[10px] font-extrabold tracking-[.15em] text-[#1265D8]">PLACES PREMIUM</p><h2 className="mt-1 text-xl font-extrabold">Property Management & Booking Engine</h2><p className="mt-2 text-sm leading-6 text-slate-600">Rencana layanan PMS mandiri per properti. Fitur dan ketentuan final hanya berlaku setelah produk dan kontrak diaktifkan.</p><p className="mt-4 text-lg font-extrabold">{premiumPriceLabel}</p><p className="mt-1 text-[11px] text-slate-500">Maksimum {plan?.max_units ?? "—"} unit pada konfigurasi plan ini.</p><span className="mt-3 inline-flex rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-bold text-amber-900">{premiumState}</span><ul className="mt-4 space-y-2 text-xs leading-5 text-slate-600"><li>Rencana profil lengkap dan galeri</li><li>Rencana tipe kamar, tarif, serta kalender ketersediaan</li><li>Rencana dashboard pemilik dan manajemen reservasi</li><li>Rencana pembayaran properti dan analitik</li></ul><p className="mt-4 rounded-xl bg-blue-50 p-3 text-[11px] leading-5 text-[#0A2E63]">Fitur PMS belum aktif. Halaman ini tidak menerima booking, pembayaran, atau langganan.</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-[#C95D00]"><Handshake size={22}/></div><p className="mt-4 text-[10px] font-extrabold tracking-[.15em] text-[#C95D00]">STAY BY SHIAP</p><h2 className="mt-1 text-xl font-extrabold">Kerja sama distribusi</h2><p className="mt-2 text-sm leading-6 text-slate-600">Model operasional berbeda: properti yang secara eksplisit dipetakan dapat memakai alur Stay SHIAP yang sudah tersedia.</p><p className="mt-4 text-2xl font-extrabold">Kerja Sama</p><ul className="mt-4 space-y-2 text-xs leading-5 text-slate-600"><li>Distribusi dan booking mengikuti katalog Stay yang aktif</li><li>Dukungan pemasaran mengikuti kesepakatan</li><li>Peran operasional dan komersial ditentukan melalui kontrak</li></ul><Link href="/stay" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-200 px-4 text-xs font-bold text-[#1265D8]">Lihat Stay SHIAP <ArrowRight size={14}/></Link></article>
      </div>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-xl font-extrabold">Bandingkan model kemitraan</h2><p className="mt-1 text-sm text-slate-500">Status fitur di bawah membedakan layanan yang sudah tersedia dengan rencana produk.</p><div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[740px] border-collapse text-left text-xs"><thead><tr className="bg-[#0A2E63] text-white"><th className="p-3 font-bold">Kemampuan</th><th className="p-3 font-bold">Places Free</th><th className="p-3 font-bold">Places Premium</th><th className="p-3 font-bold">Stay by SHIAP</th></tr></thead><tbody>{comparison.map(([label,free,premium,stay])=><tr key={label} className="border-t border-slate-100 odd:bg-white even:bg-slate-50"><th scope="row" className="p-3 font-bold text-[#0A2E63]">{label}</th><td className="p-3 text-slate-600">{free}</td><td className="p-3 text-slate-600">{premium}</td><td className="p-3 text-slate-600">{stay}</td></tr>)}</tbody></table></div><p className="mt-3 text-[10px] leading-5 text-slate-500">SHIAP tidak menjanjikan komisi, settlement marketplace, atau payment gateway untuk Places Premium. Pembayaran dan kebijakan reservasi Stay mengikuti konfigurasi serta kontrak layanan Stay yang berlaku.</p></section>
      <section className="mt-8 grid gap-5 lg:grid-cols-[.7fr_1.3fr]"><div><p className="text-[10px] font-extrabold tracking-[.15em] text-[#1265D8]">FAQ</p><h2 className="mt-1 text-2xl font-extrabold">Sebelum bermitra</h2></div><div className="space-y-3">{[
        ["Apakah pendaftaran gratis?", "Model Places Free dirancang tanpa biaya listing. Pendaftaran online belum tersedia dan properti hanya ditayangkan setelah ditinjau SHIAP."],
        ["Apa perbedaan Places dan Stay?", "Places adalah direktori kontak penginapan. Stay adalah layanan booking SHIAP yang terpisah dan hanya menampilkan properti dengan pemetaan yang diperiksa."],
        ["Apakah Premium sudah bisa dipakai?", "Belum. PMS, kalender, booking engine, pembayaran, dan dashboard pemilik masih berupa rencana; tidak ada booking atau pembayaran Premium yang diterima."],
        ["Apakah Premium mengenakan komisi?", "Belum ada kebijakan komisi Premium yang aktif. Ketentuan komersial hanya dapat ditetapkan setelah fitur dan kontrak disetujui."],
        ["Apakah pemilik dapat mengelola kamar sendiri?", "Fitur PMS untuk pengelolaan kamar belum tersedia."],
        ["Bagaimana WhatsApp digunakan?", "Pengunjung membuka WhatsApp bisnis properti untuk bertanya langsung. SHIAP tidak mengirim pesan otomatis dan tidak meminta nomor WhatsApp pengunjung."],
        ["Apa arti kontak terverifikasi?", "SHIAP telah memeriksa kanal kontak pada tanggal yang ditampilkan. Ini bukan jaminan mutu, ketersediaan, harga, atau keamanan pembayaran."],
        ["Kapan pembayaran melalui SHIAP tersedia?", "Places tidak memproses pembayaran. Jangan menganggap Stay atau gateway yang ada mendukung settlement marketplace."],
      ].map(([question,answer])=><details key={question} className="rounded-xl border border-slate-200 bg-white p-4"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold"><CircleHelp size={16} className="shrink-0 text-[#1265D8]"/>{question}</summary><p className="mt-3 pl-6 text-sm leading-6 text-slate-600">{answer}</p></details>)}</div></section>
      <section className="mt-8 rounded-2xl bg-[#0A2E63] p-5 text-white sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-7"><div><h2 className="text-xl font-extrabold">Siap mengembangkan penginapan Anda bersama SHIAP?</h2><p className="mt-2 text-sm leading-6 text-blue-100">Pendaftaran dan konsultasi mitra belum tersedia melalui aplikasi. Kami tidak menampilkan kontak yang belum dikonfigurasi.</p></div><div className="mt-4 flex flex-wrap gap-2 sm:mt-0"><button type="button" disabled title="Pendaftaran mitra online belum tersedia" className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-xl bg-white/20 px-4 text-xs font-bold text-white/70">Daftarkan Penginapan</button><button type="button" disabled title="Kanal konsultasi belum dikonfigurasi" className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-xl border border-white/30 px-4 text-xs font-bold text-white/70">Konsultasi Kemitraan</button></div></section>
    </section>
  </main>;
}
