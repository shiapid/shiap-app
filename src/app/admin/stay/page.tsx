import Link from "next/link";
import CatalogManager from "@/components/admin/catalog-manager";
import { StayRoomInventory } from "@/components/admin/stay-room-inventory";
import { StayScopePicker } from "@/components/admin/stay-scope-picker";
import { createClient } from "@/lib/supabase/server";
import { globalStayCalendarHref, isStayDate, staySections, todayInStay, type StayContext } from "@/lib/admin/stay-navigation";

export const dynamic = "force-dynamic";

export default async function AdminStayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const section = staySections.find(item => item.id === query.view)?.id ?? "properties";
  const db = await createClient();
  const { data: properties, error } = await db.from("stay_properties").select("id,name").order("name");
  const property = properties?.find(item => item.id === query.property) ?? properties?.[0];
  const roomsResult = section !== "properties" && property
    ? await db.from("stay_room_types").select("id,name,status").eq("property_id", property.id).order("name")
    : null;
  const rooms = roomsResult?.data ?? [];
  const room = rooms.find(item => item.id === query.room) ??
    (section === "calendar" ? rooms.find(item => item.status === "active") ?? rooms[0] : undefined);
  const context: StayContext = {
    property: property?.id,
    room: room?.id ?? (section === "properties" && typeof query.room === "string" ? query.room : undefined),
    date: isStayDate(query.date) ? query.date : todayInStay(),
    filter: query.filter === "occupied" || query.filter === "full" ? query.filter : undefined,
  };

  return <div className="space-y-4">
    {section === "properties" ? <CatalogManager mode="stay" stayContext={context}/> :
      error || roomsResult?.error ? <p role="alert" className="rounded-xl bg-white p-4 text-sm text-red-700">Data properti atau kamar gagal dimuat.</p> :
      !property ? <p className="rounded-xl bg-white p-4 text-sm">Tambahkan properti untuk mengatur kamar dan kalender.</p> : <>
        <StayScopePicker properties={properties ?? []} rooms={rooms} section={section} context={context}/>
        {section === "rooms" ? <CatalogManager key={property.id} mode="stay" roomProperty={property} stayContext={context}/> : <>
          <Link href={globalStayCalendarHref(context)} className="inline-flex min-h-11 items-center text-xs font-bold text-[#1265D8]">Buka Kalender SHIAP dengan filter Stay →</Link>
          {section === "calendar" && !room
            ? <p className="rounded-xl bg-white p-4 text-sm">Tambahkan tipe kamar untuk melihat stok per malam.</p>
            : <StayRoomInventory key={`${section}:${property.id}:${room?.id ?? ""}:${context.date}`} view={section}
                context={context} roomName={room?.name} propertyName={property.name} returnToCalendar={query.back === "calendar"}/>}
        </>}
      </>}
  </div>;
}
