import { randomUUID } from "node:crypto";
import Link from "next/link";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, BadgeDollarSign, Banknote, FileDown, Landmark, ReceiptText, Wallet } from "lucide-react";
import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import { CashflowChart, ServiceProfitChart } from "@/components/admin/finance-charts";
import { createCostTemplate, createExpense, recalculateBookingCosts, recordTransaction, reviewExpense, toggleCostTemplate, updateCostTemplate } from "./actions";

export const dynamic = "force-dynamic";

type FinanceRow = {
  id: string; order_number: string; order_status: string; payment_status: string; created_at: string; recognized_at: string;
  payable_amount: string | number; gross_sales: string | number; discount_amount: string | number; net_sales: string | number;
  recognized_revenue: string | number; cash_received: string | number; refunds: string | number;
  service_fee_amount: string | number; service_fee_cash_received: string | number; service_fee_refunded: string | number; service_fee_recognized_revenue: string | number;
  estimated_direct_cost: string | number; actual_direct_cost: string | number; processing_fees: string | number;
  receivable: string | number; estimated_profit: string | number; contribution_profit: string | number; profit_margin: string | number;
};
type ServiceItem = { booking_id: string; service_type: string; service_category: string };
type ExpenseRow = { id: string; booking_id: string | null; booking_item_id: string | null; service_type: string | null; category_id: string; supplier_name: string | null; description: string; amount: string | number; expense_date: string; receipt_path: string | null; external_reference: string | null; status: string; status_note: string | null; created_at: string };
type TemplateRow = { id: string; name: string; service_type: string; product_id: string | null; cost_basis: string; amount: string | number; is_active: boolean; notes: string | null };
type LedgerRow = { booking_id: string; entry_type: string; amount: string | number; status: string; created_at: string; note: string | null };

const serviceOptions = [
  ["trip", "Trip"], ["stay", "Stay"], ["activity", "Activity"], ["rental", "Rental"], ["documentation", "Shinema"], ["other", "Lainnya"],
] as const;
const statusOptions = [["pending_confirmation", "Menunggu konfirmasi"], ["confirmed", "Dikonfirmasi"], ["completed", "Selesai"], ["cancelled", "Dibatalkan"], ["rejected", "Ditolak"], ["expired", "Kedaluwarsa"]] as const;
const paymentOptions = [["unpaid", "Belum dibayar"], ["pending", "Menunggu verifikasi"], ["paid", "Lunas"]] as const;
const costBases = [["fixed_per_booking", "Tetap per booking"], ["per_participant", "Per peserta"], ["per_night", "Per malam"], ["per_hour", "Per jam"], ["per_day", "Per hari"], ["per_unit", "Per unit / kendaraan"], ["percentage", "Persentase penjualan"]] as const;
const statusLabels: Record<string, string> = { pending_confirmation: "Menunggu konfirmasi", confirmed: "Dikonfirmasi", completed: "Selesai", cancelled: "Dibatalkan", rejected: "Ditolak", expired: "Kedaluwarsa" };
const paymentLabels: Record<string, string> = { unpaid: "Belum dibayar", pending: "Menunggu verifikasi", paid: "Lunas" };
const expenseLabels: Record<string, string> = { pending: "Menunggu review", approved: "Disetujui", rejected: "Ditolak", void: "Void" };
const serviceLabel = (key: string) => key === "platform" ? "Biaya Layanan SHIAP" : serviceOptions.find(([value]) => value === key)?.[1] ?? key;

function cents(value: string | number | null | undefined) {
  const raw = String(value ?? "0").trim();
  const match = raw.match(/^(-?)(\d+)(?:\.(\d{1,}))?$/);
  if (!match) return BigInt(0);
  const fraction = (match[3] ?? "").padEnd(2, "0");
  const result = BigInt(match[2]) * BigInt(100) + BigInt(fraction.slice(0, 2) || "0");
  return match[1] ? -result : result;
}
function amountText(value: bigint) {
  const sign = value < BigInt(0) ? "-" : "";
  const absolute = value < BigInt(0) ? -value : value;
  return `${sign}${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, "0")}`;
}
function sum(values: Array<string | number | null | undefined>) { return amountText(values.reduce((total, value) => total + cents(value), BigInt(0))); }
function money(value: string | number | null | undefined) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value ?? 0));
}
function percent(profit: string | number, sales: string | number) {
  const base = cents(sales); if (base <= BigInt(0)) return "0,0%";
  const value = cents(profit) * BigInt(10000) / base;
  const numeric = Number(value) / 100;
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(numeric)}%`;
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Makassar" }).format(new Date(value));
}
function nextDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10);
}
function param(params: Record<string, string | string[] | undefined>, key: string) { return typeof params[key] === "string" ? params[key] as string : ""; }
function serviceForItem(row: ServiceItem) { return row.service_category && row.service_category !== "other" ? row.service_category : row.service_type; }
function card(title: string, value: string, icon: React.ReactNode, caption: string, color: string) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold text-slate-500">{title}</p><p className="mt-2 text-xl font-extrabold tracking-tight text-[#0A2E63] sm:text-2xl">{value}</p><p className="mt-1 text-[10px] leading-4 text-slate-400">{caption}</p></div><span className={`grid size-10 place-items-center rounded-xl ${color}`}>{icon}</span></div></article>;
}
function panel(title: string, description: string, children: React.ReactNode) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4"><h2 className="text-base font-extrabold text-[#0A2E63]">{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></div>{children}</section>;
}
function formField(label: string, name: string, type = "text", required = false) {
  return <label className="grid gap-1 text-[10px] font-semibold text-slate-600">{label}<input name={name} type={type} min={type === "number" ? "0.01" : undefined} step={type === "number" ? "0.01" : undefined} required={required} className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-[#1974FF] focus:ring-2 focus:ring-blue-100" /></label>;
}
function filterDate(label: string, name: string, value: string) {
  return <label className="grid gap-1 text-[10px] font-semibold text-slate-600">{label}<input name={name} type="date" defaultValue={value} className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-[#1974FF]" /></label>;
}

const noticeMessages: Record<string, string> = {
  "template-saved": "Template biaya tersimpan.", "template-updated": "Template biaya diperbarui.", "expense-saved": "Pengeluaran tercatat dan menunggu review.",
  "expense-reviewed": "Status pengeluaran diperbarui.", "transaction-saved": "Transaksi dicatat dengan kunci idempotensi.", recalculated: "Estimasi biaya dihitung ulang dan perubahan tercatat di audit.",
  "template-invalid": "Data template tidak valid.", "template-save": "Template biaya gagal disimpan.", "expense-invalid": "Data pengeluaran tidak valid.", "receipt-invalid": "Bukti harus JPG, PNG, WebP, atau PDF maksimal 8 MB.",
  "receipt-upload": "Bukti tidak berhasil diunggah ke storage privat.", "expense-save": "Pengeluaran gagal disimpan.", "expense-review-invalid": "Status review atau alasannya tidak valid.", "expense-review": "Review pengeluaran gagal disimpan.",
  "transaction-invalid": "Nominal atau booking tidak valid.", "transaction-save": "Transaksi gagal dicatat; periksa saldo tagihan dan status booking.", "recalculate-invalid": "Alasan rekalkulasi wajib diisi.", "recalculate-failed": "Rekalkulasi gagal; periksa perubahan dan status booking.",
};

export default async function AdminFinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const from = param(params, "from"), to = param(params, "to");
  const service = param(params, "service"), status = param(params, "status"), payment = param(params, "payment");
  const supabase = await createClient();
  let bookingsQuery = supabase.from("finance_booking_profit_v").select("*").order("created_at", { ascending: false }).limit(1000);
  if (from) bookingsQuery = bookingsQuery.gte("created_at", `${from}T00:00:00+08:00`);
  if (to) bookingsQuery = bookingsQuery.lt("created_at", `${nextDate(to)}T00:00:00+08:00`);
  if (status) bookingsQuery = bookingsQuery.eq("order_status", status);
  if (payment) bookingsQuery = bookingsQuery.eq("payment_status", payment);
  const [bookingsResult, serviceResult, templateResult, categoryResult, expenseResult, ledgerResult] = await Promise.all([
    bookingsQuery,
    supabase.from("finance_service_profit_v").select("service_type,recognized_revenue,estimated_direct_cost,actual_direct_cost,contribution_profit,booking_count").order("service_type"),
    supabase.from("finance_cost_templates").select("id,name,service_type,product_id,cost_basis,amount,is_active,notes").order("created_at", { ascending: false }),
    supabase.from("finance_expense_categories").select("id,name").eq("is_active", true).order("name"),
    supabase.from("finance_expenses").select("id,booking_id,booking_item_id,service_type,category_id,supplier_name,description,amount,expense_date,receipt_path,external_reference,status,status_note,created_at").order("expense_date", { ascending: false }).limit(500),
    supabase.from("finance_transaction_entries").select("booking_id,entry_type,amount,status,created_at,note").eq("status", "posted").order("created_at", { ascending: false }).limit(2000),
  ]);
  const queryError = bookingsResult.error ?? serviceResult.error ?? templateResult.error ?? categoryResult.error ?? expenseResult.error ?? ledgerResult.error;
  const bookingRows = (bookingsResult.data ?? []) as FinanceRow[];
  const recognizedQuery = supabase.from("finance_booking_profit_v").select("*").gt("recognized_revenue", 0).order("recognized_at", { ascending: false }).limit(1000);
  let recognizedDateQuery = recognizedQuery;
  if (from) recognizedDateQuery = recognizedDateQuery.gte("recognized_at", `${from}T00:00:00+08:00`);
  if (to) recognizedDateQuery = recognizedDateQuery.lt("recognized_at", `${nextDate(to)}T00:00:00+08:00`);
  if (status) recognizedDateQuery = recognizedDateQuery.eq("order_status", status);
  if (payment) recognizedDateQuery = recognizedDateQuery.eq("payment_status", payment);
  const recognizedResult = await recognizedDateQuery;
  const recognizedRows = (recognizedResult.data ?? []) as FinanceRow[];
  const allBookingIds = [...new Set([...bookingRows, ...recognizedRows].map((row) => row.id))];
  const serviceItemsResult = allBookingIds.length ? await supabase.from("booking_items").select("booking_id,service_type,service_category").in("booking_id", allBookingIds) : { data: [], error: null };
  const serviceItems = (serviceItemsResult.data ?? []) as ServiceItem[];
  const serviceByBooking = new Map<string, Set<string>>();
  for (const item of serviceItems) {
    const types = serviceByBooking.get(item.booking_id) ?? new Set<string>(); types.add(serviceForItem(item)); serviceByBooking.set(item.booking_id, types);
  }
  const allowedService: string[] = serviceOptions.map(([key]) => key);
  const validService = allowedService.includes(service) ? service : "";
  const filteredBookings = validService ? bookingRows.filter((row) => serviceByBooking.get(row.id)?.has(validService)) : bookingRows;
  const filteredRecognized = validService ? recognizedRows.filter((row) => serviceByBooking.get(row.id)?.has(validService)) : recognizedRows;
  const categories = categoryResult.data ?? [];
  const expenses = ((expenseResult.data ?? []) as ExpenseRow[]).filter((row) => (!from || row.expense_date >= from) && (!to || row.expense_date <= to));
  const templates = (templateResult.data ?? []) as TemplateRow[];
  const ledger = (ledgerResult.data ?? []) as LedgerRow[];
  const inPeriodLedger = ledger.filter((row) => (!from || row.created_at.slice(0, 10) >= from) && (!to || row.created_at.slice(0, 10) <= to));
  const approvedExpenses = expenses.filter((row) => row.status === "approved");
  const recognizedRevenue = sum(filteredRecognized.map((row) => row.recognized_revenue));
  const platformRevenue = sum(filteredRecognized.map((row) => row.service_fee_recognized_revenue));
  const grossSales = sum(filteredRecognized.map((row) => row.gross_sales));
  const discounts = sum(filteredRecognized.map((row) => row.discount_amount));
  const netSales = sum(filteredRecognized.map((row) => row.net_sales));
  const estimateCosts = sum(filteredRecognized.map((row) => row.estimated_direct_cost));
  const expensesAmount = sum(approvedExpenses.map((row) => row.amount));
  const processingFees = sum(inPeriodLedger.filter((row) => row.entry_type === "processing_fee").map((row) => row.amount));
  const contributionCents = cents(recognizedRevenue) - cents(expensesAmount) - cents(processingFees);
  const contributionProfit = amountText(contributionCents);
  const received = sum(inPeriodLedger.filter((row) => row.entry_type === "payment").map((row) => row.amount));
  const refunds = sum(inPeriodLedger.filter((row) => row.entry_type === "refund").map((row) => row.amount));
  const receivable = sum(filteredBookings.map((row) => row.receivable));
  const bookingCount = filteredBookings.length;

  const cashByDate = new Map<string, { date: string; incomeCents: bigint; outflowCents: bigint }>();
  for (const row of inPeriodLedger) {
    const day = row.created_at.slice(0, 10); const item = cashByDate.get(day) ?? { date: day, incomeCents: BigInt(0), outflowCents: BigInt(0) };
    if (row.entry_type === "payment") item.incomeCents += cents(row.amount);
    if (row.entry_type === "refund" || row.entry_type === "processing_fee") item.outflowCents += cents(row.amount);
    cashByDate.set(day, item);
  }
  for (const row of approvedExpenses) {
    const item = cashByDate.get(row.expense_date) ?? { date: row.expense_date, incomeCents: BigInt(0), outflowCents: BigInt(0) };
    item.outflowCents += cents(row.amount); cashByDate.set(row.expense_date, item);
  }
  const cashflowData = [...cashByDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-31).map((row) => ({
    date: new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Makassar" }).format(new Date(`${row.date}T12:00:00Z`)),
    income: Number(amountText(row.incomeCents)), outflow: Number(amountText(row.outflowCents)),
  }));
  const serviceChart = ((serviceResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    service: serviceLabel(String(row.service_type)), revenue: Number(row.recognized_revenue ?? 0),
    estimatedCost: Number(row.estimated_direct_cost ?? 0), actualCost: Number(row.actual_direct_cost ?? 0),
    profit: Number(row.contribution_profit ?? 0),
  }));
  const expensePaths = expenses.filter((row) => row.receipt_path).map((row) => row.receipt_path as string);
  const signed = expensePaths.length ? await supabase.storage.from("shiap-finance-receipts").createSignedUrls(expensePaths, 300) : { data: [] };
  const signedMap = new Map((signed.data ?? []).map((row) => [row.path, row.signedUrl]));
  const success = param(params, "success"), error = param(params, "error");
  const csvQuery = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}), ...(validService ? { service: validService } : {}), ...(status ? { status } : {}), ...(payment ? { payment } : {}) }).toString();

  return <div className="space-y-6">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[10px] font-extrabold tracking-[.22em] text-[#1974FF]">ADMIN / FINANCE</p><h1 className="mt-1 text-2xl font-extrabold text-[#0A2E63]">Finance & Profit Analytics</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Pisahkan nilai booking, pendapatan terealisasi, kas masuk, piutang, estimasi biaya, dan biaya aktual.</p></div><Link href={`/api/admin/finance/export${csvQuery ? `?${csvQuery}` : ""}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0A2E63] px-4 text-xs font-bold text-white hover:bg-[#123e78]"><FileDown size={15}/>Export laporan CSV</Link></header>

    {queryError || recognizedResult.error || serviceItemsResult.error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><strong>Laporan keuangan tidak lengkap.</strong> Schema Finance lokal perlu diterapkan dan cache API diperbarui. {queryError?.message ?? recognizedResult.error?.message ?? serviceItemsResult.error?.message}</div> : null}
    {success && noticeMessages[success] ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{noticeMessages[success]}</p> : null}
    {error && noticeMessages[error] ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">{noticeMessages[error]}</p> : null}

    <form method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto_auto] lg:items-end">
      {filterDate("Dari", "from", from)}
      {filterDate("Sampai", "to", to)}
      <label className="grid gap-1 text-[10px] font-semibold text-slate-600">Layanan<select name="service" defaultValue={validService} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs"><option value="">Semua layanan</option>{serviceOptions.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label className="grid gap-1 text-[10px] font-semibold text-slate-600">Status booking<select name="status" defaultValue={status} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs"><option value="">Semua status</option>{statusOptions.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label className="grid gap-1 text-[10px] font-semibold text-slate-600">Pembayaran<select name="payment" defaultValue={payment} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs"><option value="">Semua pembayaran</option>{paymentOptions.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <button className="h-10 rounded-lg bg-[#1974FF] px-4 text-xs font-bold text-white">Terapkan</button><Link href="/admin/finance" className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-xs font-bold text-slate-600">Reset</Link>
    </form>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {card("Pendapatan terealisasi", money(recognizedRevenue), <BadgeDollarSign size={19}/>, "Hanya booking selesai dan lunas; tanggal pengakuan memakai waktu selesai.", "bg-blue-50 text-[#1974FF]")}
      {card("Pendapatan platform", money(platformRevenue), <BadgeDollarSign size={19}/>, "Komponen biaya layanan di dalam pendapatan terealisasi, setelah alokasi refund. Tidak ditambahkan lagi ke margin.", "bg-blue-50 text-[#1265D8]")}
      {card("Total booking", String(bookingCount), <ReceiptText size={19}/>, "Booking berdasarkan tanggal dibuat dan filter di atas.", "bg-indigo-50 text-indigo-600")}
      {card("Kas diterima", money(received), <ArrowDownLeft size={19}/>, `Refund: ${money(refunds)} · berdasarkan waktu entri kas.`, "bg-emerald-50 text-emerald-600")}
      {card("Piutang aktif", money(receivable), <Wallet size={19}/>, "Sisa tagihan booking aktif; booking batal/expired tidak dihitung.", "bg-orange-50 text-[#FF8518]")}
      {card("Penjualan kotor", money(grossSales), <Landmark size={19}/>, `Diskon: ${money(discounts)} · berasal dari booking selesai dan lunas.`, "bg-sky-50 text-sky-700")}
      {card("Estimasi biaya langsung", money(estimateCosts), <ArrowUpRight size={19}/>, `Estimasi profit: ${money(amountText(cents(recognizedRevenue)-cents(estimateCosts)))}.`, "bg-amber-50 text-amber-700")}
      {card("Biaya aktual disetujui", money(expensesAmount), <ReceiptText size={19}/>, `Biaya proses pembayaran: ${money(processingFees)}.`, "bg-rose-50 text-rose-600")}
      {card("Profit kontribusi", money(contributionProfit), <Banknote size={19}/>, `Margin ${percent(contributionProfit,recognizedRevenue)} setelah biaya aktual dan fee.`, contributionCents < BigInt(0) ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700")}
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
      {panel("Profit berdasarkan layanan", "Rangkuman seluruh periode; estimasi dan aktual tetap dipisahkan.", <ServiceProfitChart data={serviceChart}/ >)}
      {panel("Cashflow overview", "Kas masuk dikurangi refund, biaya pembayaran, dan pengeluaran aktual yang disetujui.", <CashflowChart data={cashflowData}/ >)}
    </section>

    {panel("Profit per booking", "Perhitungan direct cost menggunakan snapshot. Rekalkulasi hanya untuk perubahan booking yang disengaja dan selalu diaudit.", <div className="overflow-x-auto"><table className="w-full min-w-[930px] text-left text-[10px]"><thead className="bg-[#F5F8FD] text-slate-500"><tr>{["Booking", "Status", "Penjualan", "Pendapatan terealisasi", "Estimasi biaya", "Biaya aktual", "Profit kontribusi", "Piutang", "Aksi"].map((x)=><th key={x} className="px-3 py-2.5 font-bold">{x}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filteredBookings.slice(0,200).map((row)=><tr key={row.id} className="align-top"><td className="px-3 py-3"><Link href={`/admin/bookings/${row.id}`} className="font-extrabold text-[#1974FF] hover:underline">{row.order_number}</Link><p className="mt-1 text-slate-400">{dateLabel(row.created_at)}</p></td><td className="px-3 py-3"><span className="block font-semibold text-slate-700">{statusLabels[row.order_status]??row.order_status}</span><span className="mt-1 block text-slate-400">{paymentLabels[row.payment_status]??row.payment_status}</span></td><td className="px-3 py-3 font-semibold">{money(row.net_sales)}</td><td className="px-3 py-3 font-semibold text-emerald-700">{money(row.recognized_revenue)}</td><td className="px-3 py-3">{money(row.estimated_direct_cost)}</td><td className="px-3 py-3">{money(row.actual_direct_cost)}</td><td className={`px-3 py-3 font-extrabold ${cents(row.contribution_profit)<BigInt(0)?"text-red-600":"text-[#0A2E63]"}`}>{money(row.contribution_profit)}<span className="mt-1 block text-[9px] font-medium text-slate-400">{percent(row.contribution_profit,row.net_sales)}</span></td><td className="px-3 py-3 font-semibold text-orange-700">{money(row.receivable)}</td><td className="min-w-[210px] space-y-2 px-3 py-3">
        {cents(row.receivable)>BigInt(0) && cents(row.cash_received)===BigInt(0) && !["cancelled","rejected","expired"].includes(row.order_status) ? <form action={recordTransaction} className="grid gap-1"><input type="hidden" name="bookingId" value={row.id}/><input type="hidden" name="entryType" value="payment"/><input type="hidden" name="idempotencyKey" value={randomUUID()}/><input name="amount" type="hidden" value={String(row.receivable)}/><span className="text-[9px] font-semibold text-slate-500">Pelunasan {money(row.receivable)}</span><input name="reference" minLength={3} maxLength={160} required placeholder="Referensi mutasi bank" className="h-8 w-full rounded border border-slate-200 px-2 text-[10px]"/><button className="h-8 rounded bg-[#1974FF] px-2 text-[9px] font-bold text-white">Catat pelunasan 100%</button></form> : null}
        {cents(row.cash_received)>cents(row.refunds) ? <form action={recordTransaction} className="flex items-center gap-1"><input type="hidden" name="bookingId" value={row.id}/><input type="hidden" name="entryType" value="refund"/><input type="hidden" name="idempotencyKey" value={randomUUID()}/><input name="amount" inputMode="decimal" placeholder="Nominal refund" required className="h-8 w-24 rounded border border-slate-200 px-2 text-[10px]"/><button className="h-8 rounded border border-orange-200 bg-orange-50 px-2 text-[9px] font-bold text-orange-800">Refund</button></form> : null}
        {cents(row.estimated_direct_cost)>BigInt(0) ? <details><summary className="cursor-pointer text-[9px] font-bold text-slate-500">Rekalkulasi estimasi biaya</summary><form action={recalculateBookingCosts} className="mt-2 flex gap-1"><input type="hidden" name="bookingId" value={row.id}/><input name="reason" minLength={4} required placeholder="Alasan perubahan" className="h-8 min-w-0 flex-1 rounded border border-slate-200 px-2 text-[9px]"/><button className="h-8 rounded border border-slate-200 px-2 text-[9px] font-bold">Hitung</button></form></details> : null}
      </td></tr>)}{filteredBookings.length===0?<tr><td colSpan={9} className="p-8 text-center text-xs text-slate-400">Belum ada booking yang sesuai filter.</td></tr>:null}</tbody></table></div>)}

    <section className="grid gap-4 xl:grid-cols-2">
      {panel("Cost templates", "Template biaya internal untuk transaksi berikutnya; perubahan tidak mengubah snapshot booking lama.", <div className="space-y-4">
        <form action={createCostTemplate} className="grid gap-2 rounded-xl bg-[#F6F8FC] p-3 sm:grid-cols-2 lg:grid-cols-3">
          {formField("Nama biaya", "name", "text", true)}
          <label className="grid gap-1 text-[10px] font-semibold text-slate-600">Layanan<select name="serviceType" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs">{serviceOptions.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
          <label className="grid gap-1 text-[10px] font-semibold text-slate-600">Basis biaya<select name="basis" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs">{costBases.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
          {formField("Nominal / tarif (%)", "amount", "number", true)}{formField("ID produk opsional (UUID)", "productId")}{formField("Catatan", "notes")}
          <button className="h-10 rounded-lg bg-[#1974FF] px-4 text-xs font-bold text-white sm:col-span-2 lg:col-span-3">Tambah cost template</button>
        </form>
        <div className="max-h-[330px] space-y-2 overflow-y-auto">{templates.map((template)=><div key={template.id} className="rounded-xl border border-slate-100 p-3"><form action={updateCostTemplate} className="grid gap-2 sm:grid-cols-[1.2fr_.7fr_auto] sm:items-end"><input type="hidden" name="id" value={template.id}/><label className="grid gap-1 text-[9px] font-semibold text-slate-500">Nama<input name="name" defaultValue={template.name} required className="h-9 min-w-0 rounded border border-slate-200 px-2 text-[10px]"/></label><div><p className="mb-1 text-[9px] font-semibold text-slate-500">{serviceLabel(template.service_type)} · {costBases.find(([key])=>key===template.cost_basis)?.[1]}{template.product_id?" · produk khusus":" · seluruh produk"}</p><input name="amount" defaultValue={String(template.amount)} type="number" min="0.01" step="0.01" required className="h-9 w-full rounded border border-slate-200 px-2 text-[10px]"/><input type="hidden" name="notes" value={template.notes??""}/></div><button className="h-9 rounded border border-blue-200 px-3 text-[10px] font-bold text-[#1974FF]">Simpan</button></form><form action={toggleCostTemplate} className="mt-2"><input type="hidden" name="id" value={template.id}/><input type="hidden" name="isActive" value={String(template.is_active)}/><button className={`text-[9px] font-bold ${template.is_active?"text-emerald-700":"text-slate-400"}`}>{template.is_active?"Aktif · nonaktifkan":"Nonaktif · aktifkan"}</button></form></div>)}{templates.length===0?<p className="p-4 text-center text-xs text-slate-400">Belum ada template. Estimasi biaya akan bernilai nol sampai template dibuat.</p>:null}</div>
      </div>)}

      {panel("Expense management", "Masukkan pengeluaran aktual, vendor, alokasi booking/layanan, dan unggah kuitansi privat.", <div className="space-y-4">
        <form action={createExpense} encType="multipart/form-data" className="grid gap-2 rounded-xl bg-[#F6F8FC] p-3 sm:grid-cols-2">
          {formField("Deskripsi pengeluaran", "description", "text", true)}{formField("Nominal (IDR)", "amount", "number", true)}
          <label className="grid gap-1 text-[10px] font-semibold text-slate-600">Kategori<select name="categoryId" required className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs">{categories.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="grid gap-1 text-[10px] font-semibold text-slate-600">Layanan<select name="serviceType" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs"><option value="">Operasional umum</option>{serviceOptions.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
          {formField("Nama supplier", "supplier")}{formField("Tanggal", "expenseDate", "date", true)}
          {formField("ID booking opsional", "bookingId")}{formField("ID booking item opsional", "bookingItemId")}{formField("Referensi", "reference")}
          <label className="grid gap-1 text-[10px] font-semibold text-slate-600">Kuitansi (JPG/PNG/WebP/PDF, maks 8 MB)<input type="file" name="receipt" accept="image/jpeg,image/png,image/webp,application/pdf" className="h-10 rounded-lg border border-slate-200 bg-white px-2 py-2 text-[10px]"/></label>
          <button className="h-10 self-end rounded-lg bg-[#0A2E63] px-4 text-xs font-bold text-white">Simpan untuk review</button>
        </form>
        <div className="max-h-[330px] space-y-2 overflow-y-auto">{expenses.slice(0,100).map((expense)=><article key={expense.id} className="rounded-xl border border-slate-100 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[11px] font-bold text-[#0A2E63]">{expense.description}</p><p className="mt-1 text-[9px] text-slate-500">{expense.supplier_name??"Supplier tidak diisi"} · {dateLabel(expense.expense_date)} · {expense.booking_id?"Dialokasikan ke booking":"Biaya operasional"}</p></div><div className="text-right"><p className="text-xs font-extrabold text-[#0A2E63]">{money(expense.amount)}</p><p className="text-[9px] text-slate-500">{expenseLabels[expense.status]??expense.status}</p></div></div>
          {expense.receipt_path&&signedMap.get(expense.receipt_path)?<a href={signedMap.get(expense.receipt_path) as string} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[9px] font-bold text-[#1974FF]">Lihat kuitansi privat</a>:null}
          {expense.status==="pending"||expense.status==="rejected"?<form action={reviewExpense} className="mt-2 flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={expense.id}/><input name="reason" placeholder="Catatan review" className="h-8 min-w-32 flex-1 rounded border border-slate-200 px-2 text-[9px]"/><button name="status" value="approved" className="h-8 rounded bg-emerald-600 px-2 text-[9px] font-bold text-white">Setujui</button>{expense.status==="pending"?<button name="status" value="rejected" className="h-8 rounded border border-red-200 px-2 text-[9px] font-bold text-red-700">Tolak</button>:null}</form>:null}
          {expense.status==="approved"?<form action={reviewExpense} className="mt-2 flex items-center gap-2"><input type="hidden" name="id" value={expense.id}/><input name="reason" minLength={3} required placeholder="Alasan void" className="h-8 min-w-32 flex-1 rounded border border-slate-200 px-2 text-[9px]"/><button name="status" value="void" className="h-8 rounded border border-red-200 px-2 text-[9px] font-bold text-red-700">Void</button></form>:null}</article>)}{expenses.length===0?<p className="p-4 text-center text-xs text-slate-400">Belum ada pengeluaran pada filter tanggal.</p>:null}</div>
      </div>)}
    </section>

    {panel("Customer receivables & cashflow", "Booking aktif dengan saldo terutang; pembayaran manual baru dicatat saat transfer penuh terverifikasi.", <div className="grid gap-4 xl:grid-cols-[1fr_.8fr]"><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-[10px]"><thead className="bg-[#F5F8FD] text-slate-500"><tr><th className="px-3 py-2">Booking</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Tagihan</th><th className="px-3 py-2">Diterima</th><th className="px-3 py-2">Sisa</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredBookings.filter((row)=>cents(row.receivable)>BigInt(0)&&!(["cancelled","rejected","expired"].includes(row.order_status))).slice(0,100).map((row)=><tr key={row.id}><td className="px-3 py-2.5"><Link href={`/admin/bookings/${row.id}`} className="font-bold text-[#1974FF]">{row.order_number}</Link></td><td className="px-3 py-2.5">{paymentLabels[row.payment_status]??row.payment_status}</td><td className="px-3 py-2.5">{money(row.payable_amount)}</td><td className="px-3 py-2.5">{money(row.cash_received)}</td><td className="px-3 py-2.5 font-extrabold text-orange-700">{money(row.receivable)}</td></tr>)}{filteredBookings.every((row)=>cents(row.receivable)<=BigInt(0)||["cancelled","rejected","expired"].includes(row.order_status))?<tr><td colSpan={5} className="p-5 text-center text-slate-400">Tidak ada piutang aktif pada filter ini.</td></tr>:null}</tbody></table></div><div className="rounded-xl border border-slate-100 p-3"><h3 className="text-xs font-extrabold text-[#0A2E63]">Arus kas per tanggal</h3><CashflowChart data={cashflowData}/></div></div>)}

    {panel("Financial reports & definitions", "Gunakan angka ini untuk rekonsiliasi. Revenue hanya diakui ketika booking selesai dan lunas.", <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-xl bg-[#F6F8FC] p-3"><p className="text-[10px] font-bold text-[#0A2E63]">Gross sales</p><p className="mt-1 text-xs text-slate-600">Nilai booking selesai dan lunas sebelum diskon yang tercatat.</p><p className="mt-2 font-extrabold">{money(grossSales)}</p></div><div className="rounded-xl bg-[#F6F8FC] p-3"><p className="text-[10px] font-bold text-[#0A2E63]">Discount & net sales</p><p className="mt-1 text-xs text-slate-600">Net sales = gross sales − diskon − refund.</p><p className="mt-2 font-extrabold">{money(discounts)} · {money(netSales)}</p></div><div className="rounded-xl bg-[#F6F8FC] p-3"><p className="text-[10px] font-bold text-[#0A2E63]">Estimated vs actual</p><p className="mt-1 text-xs text-slate-600">Estimasi tersnapshot saat booking; aktual hanya dari pengeluaran yang disetujui.</p><p className="mt-2 font-extrabold">{money(estimateCosts)} · {money(expensesAmount)}</p></div><div className="rounded-xl bg-[#F6F8FC] p-3"><p className="text-[10px] font-bold text-[#0A2E63]">Profit contribution</p><p className="mt-1 text-xs text-slate-600">Revenue terealisasi − semua pengeluaran disetujui − payment fees.</p><p className="mt-2 font-extrabold">{money(contributionProfit)} · {percent(contributionProfit,recognizedRevenue)}</p></div></div>)}
    <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-5 text-amber-900"><AlertTriangle size={15} className="mt-0.5 shrink-0"/>Histori transaksi legacy tetap tersimpan. Booking yang memiliki catatan pembayaran lama memerlukan rekonsiliasi admin sebelum menerima transaksi baru. Diskon yang dicatat finance digunakan untuk analitik dan tidak mengubah harga booking pelanggan.</p>
  </div>;
}
