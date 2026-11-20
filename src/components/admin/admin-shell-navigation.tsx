"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Bell, BedDouble, Bike, Building2, CalendarDays, Camera, ChevronDown, ChevronRight, ClipboardList, LayoutDashboard, LoaderCircle, LogOut, MapPin, Menu, Palette, PanelLeftClose, PanelLeftOpen, ScanLine, ScrollText, Search, Settings, Ship, Sparkles, UserRound, Users, Wallet, Waves, X } from "lucide-react";
import { adminLeafHref, adminLocation, adminMenu } from "@/lib/admin/admin-navigation";
import { createClient } from "@/lib/supabase/client";
import { adminReleaseHistory, adminReleaseVersion } from "@/lib/admin/release-notes";
import { NotificationBell } from "@/components/admin/notification-center";

const icons: Record<string, typeof Menu> = {
  dashboard: LayoutDashboard, bookings: ClipboardList, calendar: CalendarDays, notifications: Bell, finance: Wallet,
  checkIn: ScanLine, trip: Ship, stay: BedDouble, activity: Waves, experience: Sparkles, rental: Bike, shinema: Camera,
  places: Building2, destinations: MapPin, customers: Users, custom: Sparkles, profile: UserRound, settings: Settings, icons: Palette,
};
const row = "flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1265D8]";
const idle = "text-slate-600 hover:bg-slate-100 hover:text-[#0A2E63]";
const selectedRow = "bg-[#1265D8] text-white";

function AdminNav({ compact = false, expand, onNavigate }: { compact?: boolean; expand?: () => void; onNavigate?: () => void }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const route = `${pathname}:${search.get("view") ?? ""}:${search.get("tab") ?? ""}`;
  const current = adminLocation(pathname, search);
  const id = useId();
  const [expanded, setExpanded] = useState<{ route: string; id: string | null }>();
  const [notesOpen, setNotesOpen] = useState(false);
  const open = expanded?.route === route ? expanded.id : current?.item.id;

  return <nav aria-label="Navigasi Admin" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
    {adminMenu.map(group => <section key={group.title} aria-label={group.title} className="mb-4 space-y-1 border-b border-slate-100 pb-3 last:mb-0 last:border-0">
      {!compact && group.title !== "Places" && <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">{group.title}</p>}
      {group.items.map(item => {
        const Icon = icons[item.id];
        const active = current?.item.id === item.id;
        const label = compact ? <span className="sr-only">{item.label}</span> : <span className="min-w-0 flex-1">{item.label}</span>;
        const classes = `${row} ${compact ? "justify-center px-0" : ""}`;
        if (item.href) return <Link key={item.id} href={item.href} onClick={onNavigate} prefetch={false} title={compact ? item.label : undefined}
          aria-current={active ? current?.detail ? "location" : "page" : undefined}
          className={`${classes} ${active ? selectedRow : idle}`}><Icon size={17} aria-hidden className="shrink-0"/>{label}</Link>;

        const visible = !compact && open === item.id;
        const childrenId = `${id}-${item.id}`;
        return <div key={item.id}>
          <button type="button" onClick={() => {
            if (compact) expand?.();
            setExpanded({ route, id: visible ? null : item.id });
          }} title={compact ? item.label : undefined} aria-expanded={visible} aria-controls={childrenId}
            className={`${classes} ${active ? compact ? selectedRow : "bg-blue-50 text-[#0A2E63]" : idle}`}>
            <Icon size={17} aria-hidden className="shrink-0"/>{label}
            {!compact && <ChevronDown size={15} aria-hidden className={visible ? "rotate-180" : ""}/>}
          </button>
          <div id={childrenId} hidden={!visible} className="ml-5 mt-1 space-y-0.5 border-l border-slate-200 pl-2">
            {item.children?.map(leaf => {
              const selected = active && current?.leaf?.href === leaf.href;
              return <Link key={leaf.href} href={adminLeafHref(item, leaf, pathname, search)} onClick={onNavigate} prefetch={false}
                aria-current={selected ? current?.detail ? "location" : "page" : undefined}
                className={`flex min-h-10 items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-[#1265D8] ${selected ? selectedRow : idle}`}>{leaf.label}</Link>;
            })}
          </div>
        </div>;
      })}
      {group.title === "Lainnya" && <div>
        <button type="button" title={compact ? "Catatan Pembaruan" : undefined}
          aria-expanded={!compact && notesOpen} aria-controls={`${id}-notes`}
          onClick={() => { if (compact) expand?.(); setNotesOpen(compact || !notesOpen); }}
          className={`${row} ${idle} ${compact ? "justify-center px-0" : ""}`}>
          <ScrollText size={17} aria-hidden className="shrink-0"/>
          <span className={compact ? "sr-only" : "flex-1"}>Catatan Pembaruan</span>
          {!compact && <ChevronDown size={15} aria-hidden className={notesOpen ? "rotate-180" : ""}/>}
        </button>
        <div id={`${id}-notes`} hidden={compact || !notesOpen} className="space-y-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          {adminReleaseHistory.map(release => <article key={release.version}>
            <p className="font-bold text-[#0A2E63]">v{release.version} · {release.title}</p>
            <p className="mt-1 text-[11px]">{release.date}</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">{release.changes.map(change => <li key={change}>{change}</li>)}</ul>
          </article>)}
        </div>
      </div>}
    </section>)}
  </nav>;
}

function Breadcrumbs() {
  const current = adminLocation(usePathname(), useSearchParams());
  const name = current?.leaf?.label ?? current?.item.label ?? "Halaman Admin";
  const parent = current?.leaf?.href ?? current?.item.href;
  return <nav aria-label="Breadcrumb" className="mb-4 text-xs font-medium text-slate-600">
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <li><Link href="/admin" className="font-semibold text-[#1265D8]">Admin</Link></li>
      {current && <li className="flex items-center gap-1.5"><ChevronRight size={12} aria-hidden/>{current.group}</li>}
      {current?.leaf && current.item.id !== "places" && <li className="flex items-center gap-1.5"><ChevronRight size={12} aria-hidden/>{current.item.label}</li>}
      <li className="flex items-center gap-1.5 font-semibold text-[#0A2E63]" aria-current={current?.detail ? undefined : "page"}>
        <ChevronRight size={12} aria-hidden/>{current?.detail && parent ? <Link href={parent} className="text-[#1265D8]">{name}</Link> : name}
      </li>
      {current?.detail && <li aria-current="page" className="flex items-center gap-1.5 font-semibold text-[#0A2E63]"><ChevronRight size={12} aria-hidden/>{current.detail}</li>}
    </ol>
  </nav>;
}

export function AdminWorkspace({ children }: { children: ReactNode }) {
  const [compact, setCompact] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const query = useSearchParams().toString();

  useEffect(() => { drawer.current?.close(); }, [pathname, query]);

  useEffect(() => {
    if (!drawerOpen) return;
    const media = window.matchMedia("(min-width: 64rem)");
    const closeOnDesktop = () => { if (media.matches) drawer.current?.close(); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    media.addEventListener("change", closeOnDesktop);
    closeOnDesktop();
    return () => {
      document.body.style.overflow = previous;
      media.removeEventListener("change", closeOnDesktop);
    };
  }, [drawerOpen]);

  const closeDrawer = () => drawer.current?.close();
  return <div className={`min-h-dvh bg-[#F2F5FA] text-slate-900 lg:grid ${compact ? "lg:grid-cols-[4.5rem_minmax(0,1fr)]" : "lg:grid-cols-[16rem_minmax(0,1fr)]"}`}>
    <aside id="admin-sidebar" className="sticky top-0 hidden h-dvh min-w-0 flex-col self-start border-r border-slate-200 bg-white lg:flex">
      <div className={`flex shrink-0 items-center gap-2 p-2 ${compact ? "justify-center" : "justify-between"}`}>
        {!compact && <Link href="/admin" aria-label="SHIAP Admin"><Image src="/logo/shiap-logo.png" alt="SHIAP" width={112} height={36} className="h-9 w-28 object-contain"/></Link>}
        <button type="button" aria-controls="admin-sidebar" aria-expanded={!compact} title={compact ? "Perluas sidebar" : "Ringkas sidebar"}
          aria-label={compact ? "Perluas sidebar" : "Ringkas sidebar"} onClick={() => setCompact(!compact)}
          className="grid size-10 place-items-center rounded-lg text-[#0A2E63] hover:bg-blue-50">{compact ? <PanelLeftOpen size={19}/> : <PanelLeftClose size={19}/>}</button>
      </div>
      <AdminNav compact={compact} expand={() => setCompact(false)}/>
      {!compact && <footer className="shrink-0 border-t border-slate-100 px-4 py-3 text-[10px] font-medium text-slate-500">PT SHIAP BERSAMA MARAIS · v{adminReleaseVersion}</footer>}
    </aside>
    <div className="min-w-0">
      <AdminTopbar drawerOpen={drawerOpen} openDrawer={() => {
        if (drawer.current && !drawer.current.open) {
          drawer.current.showModal();
          setDrawerOpen(true);
        }
      }}/>
      <main className="mx-auto w-full min-w-0 max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7"><Breadcrumbs/>{children}</main>
    </div>
    <dialog ref={drawer} id="admin-drawer" aria-label="Menu Admin" onClose={() => setDrawerOpen(false)}
      onClick={event => { if (event.target === event.currentTarget) closeDrawer(); }}
      className="fixed inset-y-0 right-auto left-0 m-0 h-dvh max-h-none w-[min(88vw,20rem)] max-w-none overflow-hidden bg-white shadow-2xl backdrop:bg-[#071B39]/55">
      <div className="flex h-full flex-col pb-[env(safe-area-inset-bottom)]">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 pb-2 pt-[max(.5rem,env(safe-area-inset-top))]">
          <Image src="/logo/shiap-logo.png" alt="SHIAP" width={112} height={36} className="h-8 w-28 object-contain object-left"/>
          <button type="button" aria-label="Tutup menu" autoFocus onClick={closeDrawer} className="grid size-11 place-items-center rounded-lg text-[#0A2E63] hover:bg-slate-100"><X size={21}/></button>
        </div>
        <AdminNav onNavigate={closeDrawer}/>
      </div>
    </dialog>
  </div>;
}

function AdminTopbar({ drawerOpen, openDrawer }: { drawerOpen: boolean; openDrawer: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [identity, setIdentity] = useState<{ name: string; email: string; avatarUrl: string | null }>({ name: "Admin SHIAP", email: "", avatarUrl: null });

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
          <button type="button" onClick={openDrawer} aria-label="Buka menu admin" aria-controls="admin-drawer" aria-expanded={drawerOpen} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-[#0A2E63] lg:hidden"><Menu size={19}/></button>
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#1974FF]">SHIAP MANAGEMENT</p>
            <p className="truncate text-sm font-extrabold text-[#0A2E63]">Admin SHIAP</p>
          </div>
        </div>
        <form onSubmit={search} className="hidden h-10 w-full max-w-[340px] items-center gap-2 rounded-xl border border-slate-200 bg-[#F8FAFD] px-3 focus-within:border-[#1974FF] focus-within:bg-white md:flex">
          <Search size={16} className="shrink-0 text-slate-400"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari booking, pelanggan, atau ID..." className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"/><kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[9px] text-slate-400">↵</kbd>
        </form>
        <NotificationBell />
        <div className="relative shrink-0">
          {profileOpen && <button type="button" aria-label="Tutup menu profil" onClick={() => setProfileOpen(false)} className="fixed inset-0 z-40 cursor-default"/>}
          <button type="button" aria-label="Menu profil Admin" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)} className="relative z-50 flex max-w-[200px] items-center gap-2 rounded-xl p-1.5 text-left transition hover:bg-blue-50">
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
  </>;
}
