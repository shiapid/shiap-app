import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, BadgeCheck, CalendarClock, ShieldAlert, ShieldCheck } from "lucide-react";

export const metadata: Metadata = { title: "Cara SHIAP memverifikasi kontak Places", description: "Penjelasan transparan mengenai peninjauan kontak properti pada SHIAP Places." };

export default function HowWeVerifyPage() {
  return <main className="min-h-dvh bg-[#F7F9FC] px-4 py-7 pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#0A2E63] sm:px-8 sm:py-10">
    <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-9">
      <Link href="/places" className="inline-flex min-h-10 items-center gap-2 text-xs font-bold text-[#1265D8]"><ArrowLeft size={15}/> Kembali ke Places</Link>
      <div className="mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#1265D8]"><ShieldCheck size={25}/></div>
      <p className="mt-5 text-[10px] font-extrabold tracking-[.17em] text-[#1265D8]">KETERBUKAAN PLACES</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Bagaimana SHIAP memeriksa kontak</h1>
      <p className="mt-3 text-sm leading-7 text-slate-600">Label “Kontak Terverifikasi” menjelaskan pemeriksaan terhadap kanal WhatsApp resmi yang tercantum. Label ini tidak menyatakan bahwa setiap aspek properti telah diaudit.</p>
      <div className="mt-7 space-y-5">
        <section className="flex gap-3"><BadgeCheck size={19} className="mt-0.5 shrink-0 text-[#1265D8]"/><div><h2 className="font-bold">Pemeriksaan oleh SHIAP</h2><p className="mt-1 text-sm leading-6 text-slate-600">Tim memeriksa kanal kontak melalui metode yang dicatat dalam proses verifikasi. Properti hanya dapat tampil di direktori setelah kontaknya diverifikasi dan masa verifikasi masih berlaku.</p></div></section>
        <section className="flex gap-3"><CalendarClock size={19} className="mt-0.5 shrink-0 text-[#1265D8]"/><div><h2 className="font-bold">Tanggal yang terlihat</h2><p className="mt-1 text-sm leading-6 text-slate-600">Halaman properti menampilkan tanggal pemeriksaan kontak terakhir. Listing dikeluarkan dari direktori jika masa verifikasinya berakhir sampai SHIAP memeriksanya kembali.</p></div></section>
        <section className="flex gap-3"><ShieldAlert size={19} className="mt-0.5 shrink-0 text-[#C95D00]"/><div><h2 className="font-bold">Batas perlindungan</h2><p className="mt-1 text-sm leading-6 text-slate-600">Verifikasi bukan jaminan mutu, legalitas, keamanan, harga, ketersediaan kamar, atau keamanan transaksi. Pastikan rincian dan ketentuan reservasi langsung dengan pengelola sebelum membayar.</p></div></section>
      </div>
      <Link href="/places" className="mt-8 inline-flex min-h-11 items-center rounded-xl bg-[#1265D8] px-4 text-sm font-bold text-white hover:bg-[#0A2E63]">Jelajahi Places</Link>
    </article>
  </main>;
}
