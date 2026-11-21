import { StayV2MutationForm } from "@/components/stay-v2/mutation-form";
import { saveStayPartnerOperation } from "@/app/partner/stay/operations/actions";
import { stayPartnerItemActions, type StayPartnerCalendarNight, type StayPartnerOperations } from "@/lib/stay-v2/operations";

const input = "mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm";
const card = "min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-white p-4";
const dates = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" });

const configLabels: Record<string,string> = {
  SUBMIT: "Ajukan review", APPROVE: "Setujui onboarding", ACTIVATE: "Aktifkan Request-to-book",
  APPROVE_INSTANT: "Setujui Instant Booking", DISABLE_INSTANT: "Nonaktifkan Instant Booking",
  SUSPEND: "Tangguhkan", TERMINATE: "Akhiri kemitraan", REVOKE_BANK: "Cabut verifikasi bank",
};

type OperationsProperty = StayPartnerOperations["properties"][number];
type Room = StayPartnerOperations["rooms"][number];

function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}

function Note({ min = 10 }: { min?: number }) {
  return <label className="block text-xs font-semibold">Catatan
    <textarea name="note" required minLength={min} maxLength={500} className={input + " py-2"} />
  </label>;
}

export function StayPartnerRegistration({ stays, agreements, applications }: {
  stays: { id: string; name: string }[];
  agreements: { id: string; label: string }[];
  applications: { id: string; label: string }[];
}) {
  return <section className={card}><h2 className="font-bold">Daftarkan onboarding</h2>
    <StayV2MutationForm action={saveStayPartnerOperation} label="Buat draft onboarding">
      <Hidden name="kind" value="register" />
      {([{ name: "property", label: "Properti Stay", options: stays.map(s => ({ id: s.id, label: s.name })) },
        { name: "agreement", label: "Perjanjian Partner", options: agreements },
        { name: "application", label: "Pengajuan Partner", options: applications }]).map(field =>
        <label key={field.name} className="block text-xs font-semibold">{field.label}
          <select name={field.name} required defaultValue="" className={input}>
            <option value="">Pilih {field.label}</option>
            {field.options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>)}
      <Note />
    </StayV2MutationForm>
  </section>;
}

function Config({ property, admin }: { property: OperationsProperty; admin: boolean }) {
  const actions = property.status === "DRAFT" ? ["SUBMIT"] : [];
  if (admin) {
    if (property.status === "PENDING_REVIEW" || property.status === "SUSPENDED") actions.push("APPROVE");
    if (property.status === "APPROVED") actions.push("ACTIVATE");
    if (property.status === "ACTIVE") actions.push(property.instant_approved ? "DISABLE_INSTANT" : "APPROVE_INSTANT");
    if (["ACTIVE","APPROVED"].includes(property.status)) actions.push("SUSPEND");
    if (property.bank_verified && property.status !== "TERMINATED") actions.push("REVOKE_BANK");
    if (property.status !== "TERMINATED") actions.push("TERMINATE");
  }
  return <section className={card}>
    <h2 className="font-bold">{property.name}</h2>
    <p className="text-sm">{property.status} · {property.bank_verified ? "Bank terverifikasi" : "Bank belum diverifikasi"} · {property.booking_mode ?? "Booking belum terbuka"}</p>
    {actions.length > 0 && <StayV2MutationForm action={saveStayPartnerOperation} label="Simpan keputusan">
      <Hidden name="kind" value="config" /><Hidden name="property" value={property.property_id} />
      <label className="block text-xs font-semibold">Keputusan
        <select name="action" className={input}>{actions.map(action => <option key={action} value={action}>{configLabels[action]}</option>)}</select>
      </label><Note />
    </StayV2MutationForm>}
    {admin && property.status !== "TERMINATED" && <details>
      <summary className="min-h-11 cursor-pointer text-sm font-bold text-[#1265D8]">Verifikasi rekening</summary>
      <StayV2MutationForm action={saveStayPartnerOperation} label="Catat verifikasi bank">
        <Hidden name="kind" value="config" /><Hidden name="property" value={property.property_id} /><Hidden name="action" value="VERIFY_BANK" />
        <label className="block text-xs font-semibold">Nama bank<input name="bank" required minLength={2} maxLength={80} className={input} /></label>
        <label className="block text-xs font-semibold">Empat digit terakhir<input name="last4" required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} className={input} /></label>
        <p className="text-xs text-slate-600">Cocokkan rekening dengan dokumen sumber. Catat hasil pemeriksaan tanpa nomor rekening lengkap.</p><Note />
      </StayV2MutationForm>
    </details>}
  </section>;
}

function InventoryFields({ property, action, room }: { property: string; action: string; room?: string }) {
  return <><Hidden name="kind" value="inventory" /><Hidden name="action" value={action} />
    <Hidden name="property" value={property} />{room && <Hidden name="room" value={room} />}</>;
}

function RoomFields({ property, room }: { property: string; room?: Room }) {
  return <StayV2MutationForm action={saveStayPartnerOperation} label={room ? "Simpan kamar" : "Tambah tipe kamar"}>
    <InventoryFields property={property} action={room ? "SAVE_ROOM" : "ADD_ROOM"} room={room?.id} />
    <label className="block text-xs font-semibold">Nama kamar<input name="name" required maxLength={100} defaultValue={room?.name} className={input} /></label>
    <div className="grid gap-2 sm:grid-cols-2">
      {([
        ["capacity","Kapasitas per unit",room?.capacity,1,true],["units","Jumlah unit",room?.total_units,1,true],
        ["weekday","Weekday (Rp)",room?.weekday_price,1,true],["weekend","Weekend (Rp)",room?.weekend_price,1,true],
        ["included","Tamu termasuk per unit",room?.partner_included_guests ?? undefined,1,false],
        ["extraGuest","Tambahan per tamu per malam (Rp)",room?.extra_guest_price,0,false],
      ] as const).map(([name,label,value,min,required]) => <label className="block text-xs font-semibold" key={name}>{label}
        <input type="number" name={name} min={min} step="1" defaultValue={value} required={required} className={input} />
      </label>)}
    </div>
  </StayV2MutationForm>;
}

export function StayPartnerOperationsPanel({ data, admin, calendar, calendarRoom }: {
  data: StayPartnerOperations;
  admin: boolean;
  calendar: StayPartnerCalendarNight[];
  calendarRoom: string;
}) {
  return <div className="space-y-4">
    {!data.properties.length && <p className={card}>Belum ada properti Stay Partner dalam lingkup akun ini.</p>}
    {data.properties.map(property => <Config key={property.property_id} property={property} admin={admin} />)}
    {data.properties.map(property => <details key={property.property_id} className={card}>
      <summary className="min-h-11 cursor-pointer font-bold">Kamar, tarif & add-on · {property.name}</summary>
      <details className="rounded-xl bg-slate-50 p-3"><summary className="min-h-11 cursor-pointer text-sm font-bold">Tambah tipe kamar</summary><RoomFields property={property.property_id} /></details>
      {data.rooms.filter(room => room.property_id === property.property_id).map(room =>
        <details key={room.id} className="rounded-xl bg-slate-50 p-3">
          <summary className="min-h-11 cursor-pointer text-sm font-bold">{room.name} · {room.total_units} unit</summary>
          <div className="space-y-4">
            <RoomFields property={property.property_id} room={room} />
            <StayV2MutationForm action={saveStayPartnerOperation} label="Tambah label unit">
              <InventoryFields property={property.property_id} action="ADD_UNIT" room={room.id} />
              <label className="block text-xs font-semibold">Nomor atau nama unit fisik<input name="label" required maxLength={60} className={input} /></label>
              <p className="text-xs">{data.units.filter(unit => unit.room_type_id === room.id).map(unit => unit.label).join(", ")}</p>
            </StayV2MutationForm>
            <StayV2MutationForm action={saveStayPartnerOperation} label="Blok inventori">
              <InventoryFields property={property.property_id} action="BLOCK" room={room.id} />
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs font-semibold">Mulai<input type="date" name="start" required className={input} /></label>
                <label className="block text-xs font-semibold">Sampai<input type="date" name="end" required className={input} /></label>
              </div>
              <label className="block text-xs font-semibold">Unit diblokir (kosong untuk semua)<input type="number" name="units" min="1" step="1" className={input} /></label>
              <label className="block text-xs font-semibold">Alasan<input name="reason" required minLength={3} maxLength={240} className={input} /></label>
            </StayV2MutationForm>
            <StayV2MutationForm action={saveStayPartnerOperation} label="Simpan tarif tanggal khusus">
              <InventoryFields property={property.property_id} action="SPECIAL_RATE" room={room.id} />
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs font-semibold">Tanggal mulai tarif<input type="date" name="start" required className={input} /></label>
                <label className="block text-xs font-semibold">Tanggal akhir tarif<input type="date" name="end" required className={input} /></label>
              </div>
              <label className="block text-xs font-semibold">Harga per malam (Rp)<input type="number" name="price" min="1" step="1" required className={input} /></label>
            </StayV2MutationForm>
            {data.rates.filter(rate => rate.room_type_id === room.id).map(rate => <StayV2MutationForm key={rate.id} action={saveStayPartnerOperation} label="Hapus tarif khusus">
              <InventoryFields property={property.property_id} action="REMOVE_RATE" room={room.id} />
              <Hidden name="rateId" value={rate.id} />
              <p className="text-xs">{rate.starts_on} – {rate.ends_on} · Rp{Number(rate.price).toLocaleString("id-ID")}</p>
            </StayV2MutationForm>)}
            {data.blocks.filter(block => block.room_type_id === room.id).map(block => <StayV2MutationForm key={block.id} action={saveStayPartnerOperation} label="Buka blok">
              <InventoryFields property={property.property_id} action="UNBLOCK" room={room.id} />
              <Hidden name="blockId" value={block.id} />
              <p className="text-xs">{block.starts_on} – {block.ends_on} · {block.reason}</p>
            </StayV2MutationForm>)}
          </div>
        </details>)}
      <StayV2MutationForm action={saveStayPartnerOperation} label="Simpan add-on">
        <InventoryFields property={property.property_id} action="SAVE_ADDON" />
        <label className="block text-xs font-semibold">Nama add-on<input name="name" required minLength={2} maxLength={100} className={input} /></label>
        <label className="block text-xs font-semibold">Harga per unit per menginap (Rp)<input name="price" type="number" min="0" step="1" required className={input} /></label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked /> Aktif</label>
        <p className="text-xs">{data.addons.filter(addon => addon.property_id === property.property_id).map(addon => addon.name).join(", ")}</p>
      </StayV2MutationForm>
    </details>)}
    {data.rooms.length > 0 && <section className={card}><h2 className="font-bold">Kalender ketersediaan</h2>
      <form className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-xs font-semibold">Tipe kamar<select name="room" defaultValue={calendarRoom} className={input}>
          {data.rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
        </select></label>
        <label className="text-xs font-semibold">Mulai<input type="date" name="from" defaultValue={calendar[0]?.night} className={input} /></label>
        <button className="min-h-11 rounded-xl border border-blue-200 px-3 text-xs font-bold text-[#1265D8]">Tampilkan</button>
      </form>
      <ul className="divide-y divide-slate-100">{calendar.map(night => <li key={night.night} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
        <strong>{night.night}</strong><span>{night.available} tersedia · {night.booked} terpesan/hold · {night.blocked} diblokir</span>
      </li>)}</ul>
    </section>}
    <section className={card}><h2 className="font-bold">Reservasi Partner</h2>
      {!data.bookings.length && <p className="text-sm text-slate-600">Belum ada reservasi Partner.</p>}
      {data.bookings.map(item => {
        const actions = stayPartnerItemActions(item, admin);
        const units = data.units.filter(unit => unit.room_type_id === item.room_type_id);
        return <details className="rounded-xl bg-slate-50 p-3" key={item.item_id}>
          <summary className="min-h-11 cursor-pointer break-words text-sm font-bold">{item.order_number} · {item.service_name} · {item.status}</summary>
          <p className="text-xs">{dates.format(new Date(item.check_in_at))} – {dates.format(new Date(item.check_out_at))} WITA</p>
          <p className="my-2 text-sm">{item.quantity} unit · {item.guests} tamu · {item.payment_status}</p>
          {item.guest_name && <p className="my-2 text-sm">{item.guest_name} · {item.guest_whatsapp}</p>}
          {item.operational_hold && <p className="my-2 text-sm text-amber-800">Pemenuhan ditahan Admin.</p>}
          {actions.length > 0 && <StayV2MutationForm action={saveStayPartnerOperation} label="Catat keputusan">
            <Hidden name="kind" value="item" /><Hidden name="item" value={item.item_id} />
            <label className="block text-xs font-semibold">Aksi
              <select name="action" className={input}>{actions.map(action => <option key={action.id} value={action.id}>{action.label}</option>)}</select>
            </label>
            {item.status === "CONFIRMED" && units.length > 0 && <fieldset className="space-y-1"><legend className="text-xs font-semibold">Pilih {item.quantity} unit saat check-in</legend>
              {units.map(unit => <label key={unit.id} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="unit" value={unit.id} />{unit.label}</label>)}
            </fieldset>}
            <Note min={3} />
          </StayV2MutationForm>}
        </details>;
      })}
    </section>
  </div>;
}
