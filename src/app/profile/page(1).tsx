import Link from "next/link";
import { ArrowLeft, UserRound } from "lucide-react";

export default function ProfilePage() {
  return (
    <main className="flex min-h-[75dvh] items-center justify-center bg-[#F7F9FC] px-5 py-12">
      <div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-7 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-[#1974FF]"><UserRound size={30} /></div>
        <h1 className="mt-5 text-xl font-bold text-[#0A2E63]">My Profile</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">Area akun pelanggan SHIAP. Nantinya pengguna dapat mengelola profil, informasi kontak, dan riwayat perjalanan.</p>
        <Link href="/trip" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#1974FF] px-5 py-3 text-xs font-bold text-white"><ArrowLeft size={15} /> Explore Trip</Link>
      </div>
    </main>
  );
}
