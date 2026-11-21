import Link from "next/link";
import { partnerIdentity, stayV2Memberships } from "@/lib/places/partner";
import { stayV2OwnerMenu } from "@/lib/stay-v2/plans";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const identity = await partnerIdentity().catch(() => null);
  const memberships = identity ? await stayV2Memberships(identity) : null;
  const menu = memberships ? stayV2OwnerMenu(memberships.access, memberships.isOwner) : [];
  return (
    <main className="min-h-dvh bg-[#F7F9FC] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#0A2E63]">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-8">
        <header className="mb-4"><h1 className="text-2xl font-extrabold">Portal Mitra Stay</h1></header>
        <div className="grid min-w-0 gap-4 md:grid-cols-[12rem_minmax(0,1fr)]">
          {menu.length > 0 && <nav aria-label="Portal Mitra Stay" className="flex flex-wrap gap-2 md:flex-col">
            {menu.map(item => <Link key={item.href} href={item.href} className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold hover:border-blue-300 hover:text-[#1265D8]">{item.label}</Link>)}
          </nav>}
          <div className={menu.length ? "min-w-0" : "min-w-0 md:col-span-2"}>{children}</div>
        </div>
      </div>
    </main>
  );
}
