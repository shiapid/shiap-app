"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bell, BedDouble, Bike, CalendarDays, Camera, ChevronDown, ChevronRight, ClipboardList, LayoutDashboard, LoaderCircle, LogOut, Menu, Palette, Search, Settings, Ship, Sparkles, UserRound, Users, Wallet, Waves, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { adminReleaseHistory, adminReleaseVersion } from "@/lib/admin/release-notes";
import { NotificationBell } from "@/components/admin/notification-center";

const groups = [
  { label: "WORKSPACE", items: [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  ] },
  { label: "BOOKING & OPERASIONAL", items: [
    { href: "/admin/bookings", label: "Booking Center", icon: ClipboardList },
    { href: "/admin/notifications", label: "Notifikasi", icon: Bell },
    { href: "/admin/calendar", label: "Calender", icon: CalendarDays },
    { href: "/admin/finance", label: "Keuangan", icon: Wallet },
  ] },
  { label: "KATALOG SHIAP", items: [
    { href: "/admin/trips", label: "Strip", icon: Ship },
    { href: "/admin/stay", label: "Stay", icon: BedDouble },
    { href: "/admin/activities", label: "Activity", icon: Waves },
    { href: "/admin/rental", label: "Rental", icon: Bike },
    { href: "/admin/shinema", label: "Shinema", icon: Camera },
    { href: "/admin/experiences", label: "Experience", icon: Waves },
  ] },
  { label: "CUSTOMER & SETTINGS", items: [
    { href: "/admin/customers", label: "Pelanggan", icon: Users },
    { href: "/admin/custom-trip-settings", label: "Custom Trip", icon: Sparkles },
    { href: "/admin/profile", label: "Profil Admin", icon: UserRound },
    { href: "/admin/settings", label: "Pengaturan", icon: Settings },
    { href: "/admin/site-icons", label: "Ikon Website", icon: Palette },
  ] },
];

const allItems = groups.flatMap((group) => group.items);

function AdminDevelopmentFooter() {
  return <footer className="mt-4 border-t border-slate-200 px-2 pt-3 text-center">
    <p className="text-[9px] font-semibold text-slate-500">Development by <span className="font-extrabold text-[#0A2E63]">SHIAP</span></p>
    <p className="mt-0.5 text-[8px] tracking-wide text-slate-400">PT SHIAP BERSAMA MARAIS</p>
    <details className="group mt-2 text-left">
      <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[8px] font-bold text-[#1974FF] hover:bg-blue-50">Admin v{adminReleaseVersion}<span className="text-slate-400">·</span>Catatan pembaruan<ChevronDown size={11} className="transition group-open:rotate-180"/></summary>
      <div className="mt-1 max-h-40 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-[#F8FAFD] p-2.5">
        {adminReleaseHistory.map((release) => <article key={release.version}><p className="text-[9px] font-extrabold text-[#0A2E63]">v{release.version} · {release.title}</p><p className="mt-0.5 text-[8px] text-slate-400">{release.date}</p><ul className="mt-1 list-disc space-y-0.5 pl-3 text-[8px] leading-4 text-slate-500">{release.changes.map((change) => <li key={change}>{change}</li>)}</ul></article>)}
      </div>
    </details>
  </footer>;
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <>
    {groups.map((group) => <section key={group.label} className="mb-5">
      <p className="mb-2 px-3 text-[9px] font-extrabold tracking-[.16em] text-slate-400">{group.label}</p>
      <div className="space-y-1">{group.items.map(({ href, label, icon: Icon }) => {
        const active = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
        return <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition ${active ? "bg-[#1974FF] text-white shadow-md shadow-blue-900/15" : "text-slate-600 hover:bg-blue-50 hover:text-[#0A2E63]"}`}>
          <Icon size={17} className={active ? "text-white" : "text-slate-400 group-hover:text-[#1974FF]"}/><span className="min-w-0 flex-1 truncate">{label}</span>{active && <ChevronRight size={14} className="text-blue-100"/>}
        </Link>;
      })}</div>
    </section>)}
  </>;
}

export function AdminSidebar() {
  return <aside className="fixed inset-y-0 left-0 z-30 hidden w-[258px] flex-col border-r border-slate-200 bg-white px-4 pb-4 pt-5 lg:flex">
    <Link href="/admin" className="mb-7 flex h-10 items-center px-2" aria-label="SHIAP Admin overview">
      <Image src="/logo/shiap-logo.png" alt="SHIAP" width={128} height={40} className="h-9 w-28 object-contain object-left" priority/>
      <span className="ml-auto rounded-md bg-blue-50 px-2 py-1 text-[8px] font-extrabold tracking-wider text-[#1974FF]">ADMIN</span>
    </Link>
    <nav className="min-h-0 flex-1 overflow-y-auto"><NavItems/></nav>
    <AdminDevelopmentFooter />
  </aside>;
}

export function AdminTopbar() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [identity, setIdentity] = useState<{ name: string; email: string; avatarUrl: string | null }>({ name: "Admin SHIAP", email: "", avatarUrl: null });
  const currentPage = allItems.find((item) => item.href === pathname || (item.href !== "/admin" && pathname.startsWith(item.href + "/")));

  useEffect(() => {
    let active = true;
    const loadIdentity = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active || !user) return;
      const { data } = await supabase.from("profiles").select("full_name,avatar_url").eq("id", user.id).maybeSingle();
      if (!active) return;
      setIdentity({ name: data?.full_name?.trim() || user.user_metadata?.full_name || "Admin SHIAP", email: user.email ?? "", avatarUrl: data?.avatar_url ?? user.user_metadata?.avatar_url ?? null });
    };
    void loadIdentity();
    window.addEventListener("shiap-admin-profile-updated", loadIdentity);
    return () => { active = false; window.removeEventListener("shiap-admin-profile-updated", loadIdentity); };
  }, [pathname, supabase]);

  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    if (term) router.push(`/admin/bookings?search=${encodeURIComponent(term)}`);
    else router.push("/admin/bookings");
  }

  async function logout() {
    setSigningOut(true); setSignOutError("");
    const { error } = await supabase.auth.signOut();
    if (error) { setSignOutError(error.message); setSigningOut(false); return; }
    router.replace("/login");
    router.refresh();
  }

  return <>
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1440px] items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Buka menu admin" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-[#0A2E63] lg:hidden"><Menu size={19}/></button>
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#1974FF]">SHIAP MANAGEMENT</p>
            <h1 className="truncate text-sm font-extrabold text-[#0A2E63]">{currentPage?.label ?? "Admin Dashboard"}</h1>
          </div>
        </div>
        <form onSubmit={search} className="hidden h-10 w-full max-w-[340px] items-center gap-2 rounded-xl border border-slate-200 bg-[#F8FAFD] px-3 focus-within:border-[#1974FF] focus-within:bg-white md:flex">
          <Search size={16} className="shrink-0 text-slate-400"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari booking, pelanggan, atau ID..." className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"/><kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[9px] text-slate-400">↵</kbd>
        </form>
        <NotificationBell />
        <div className="relative shrink-0">
          {profileOpen && <button type="button" aria-label="Tutup menu profil" onClick={() => setProfileOpen(false)} className="fixed inset-0 z-40 cursor-default"/>}
          <button type="button" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)} className="relative z-50 flex max-w-[200px] items-center gap-2 rounded-xl p-1.5 text-left transition hover:bg-blue-50">
            {identity.avatarUrl ? <Image src={identity.avatarUrl} alt="" width={36} height={36} unoptimized className="h-9 w-9 shrink-0 rounded-full border border-blue-100 object-cover"/> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-extrabold uppercase text-[#1974FF]">{identity.name.slice(0,1)||"S"}</span>}
            <span className="hidden min-w-0 text-right sm:block"><span className="block max-w-28 truncate text-[10px] font-bold text-[#0A2E63]">{identity.name}</span><span className="block max-w-28 truncate text-[9px] text-slate-400">{identity.email||"Admin SHIAP"}</span></span><ChevronDown size={13} className="hidden text-slate-400 sm:block"/>
          </button>
          {profileOpen && <section className="absolute right-0 top-12 z-50 w-[min(88vw,290px)] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-[#0A2E63]/15">
            <div className="flex items-center gap-3 border-b border-slate-100 px-1 pb-3">{identity.avatarUrl ? <Image src={identity.avatarUrl} alt="" width={40} height={40} unoptimized className="h-10 w-10 rounded-full object-cover"/> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-sm font-extrabold uppercase text-[#1974FF]">{identity.name.slice(0,1)||"S"}</span>}<span className="min-w-0"><span className="block truncate text-xs font-bold text-[#0A2E63]">{identity.name}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500">{identity.email}</span></span></div>
            <Link href="/admin/profile" onClick={() => setProfileOpen(false)} className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-[#0A2E63] hover:bg-blue-50"><UserRound size={15} className="text-[#1974FF]"/>Profil Admin<ChevronRight size={14} className="ml-auto text-slate-300"/></Link>
            {signOutError && <p role="alert" className="mx-1 mt-2 rounded-lg bg-red-50 p-2 text-[10px] text-red-700">Logout gagal: {signOutError}</p>}
            <button type="button" disabled={signingOut} onClick={() => void logout()} className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">{signingOut?<LoaderCircle size={15} className="animate-spin"/>:<LogOut size={15}/>} {signingOut?"Keluar...":"Logout"}</button>
          </section>}
        </div>
      </div>
    </header>
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white/95 px-3 py-2 backdrop-blur lg:hidden">
      {[allItems[0], allItems[1], allItems[2]].map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return <Link key={href} href={href} className={`flex flex-col items-center gap-1 rounded-xl py-1 text-[9px] font-bold ${active ? "text-[#1974FF]" : "text-slate-500"}`}><Icon size={18}/><span>{label === "Booking Center" ? "Booking" : label}</span></Link>;
      })}
      <button type="button" onClick={() => setMenuOpen(true)} className="flex flex-col items-center gap-1 rounded-xl py-1 text-[9px] font-bold text-slate-500"><Menu size={18}/><span>Menu</span></button>
    </nav>
    {menuOpen && <div className="fixed inset-0 z-50 bg-[#071B39]/40 lg:hidden" onClick={() => setMenuOpen(false)}>
      <section role="dialog" aria-modal="true" aria-label="Menu admin" onClick={(event) => event.stopPropagation()} className="absolute inset-y-0 left-0 flex w-[min(86vw,320px)] flex-col bg-white p-4 shadow-2xl">
        <div className="mb-5 flex items-center justify-between"><Image src="/logo/shiap-logo.png" alt="SHIAP" width={112} height={36} className="h-8 w-28 object-contain object-left"/><button type="button" onClick={() => setMenuOpen(false)} aria-label="Tutup menu" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button></div>
        <nav className="flex-1 overflow-y-auto"><NavItems onNavigate={() => setMenuOpen(false)}/></nav>
        <AdminDevelopmentFooter />
      </section>
    </div>}
  </>;
}
