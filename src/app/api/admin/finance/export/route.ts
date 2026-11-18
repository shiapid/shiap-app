import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function nextDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10);
}
function csv(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}

export async function GET(request: Request) {
  await requireAdmin();
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "", to = url.searchParams.get("to") ?? "";
  const service = url.searchParams.get("service") ?? "", status = url.searchParams.get("status") ?? "", payment = url.searchParams.get("payment") ?? "";
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) return Response.json({ error: "Rentang tanggal tidak valid." }, { status: 400 });
  const supabase = await createClient();
  let query = supabase.from("finance_booking_profit_v").select("id,order_number,order_status,payment_status,created_at,payable_amount,gross_sales,discount_amount,net_sales,recognized_revenue,cash_received,refunds,estimated_direct_cost,actual_direct_cost,processing_fees,contribution_profit,profit_margin,receivable,service_fee_amount,service_fee_cash_received,service_fee_refunded,service_fee_recognized_revenue").order("created_at", { ascending: false }).limit(5000);
  if (from) query = query.gte("created_at", `${from}T00:00:00+08:00`);
  if (to) query = query.lt("created_at", `${nextDate(to)}T00:00:00+08:00`);
  if (status) query = query.eq("order_status", status);
  if (payment) query = query.eq("payment_status", payment);
  const { data, error } = await query;
  if (error) return Response.json({ error: "Laporan finance gagal dimuat." }, { status: 500 });
  let rows = data ?? [];
  if (service) {
    const ids = rows.map((row) => row.id);
    const items = ids.length ? await supabase.from("booking_items").select("booking_id,service_type,service_category").in("booking_id", ids) : { data: [], error: null };
    if (items.error) return Response.json({ error: "Filter layanan laporan gagal dimuat." }, { status: 500 });
    const bookings = new Set((items.data ?? []).filter((item) => (item.service_category && item.service_category !== "other" ? item.service_category : item.service_type) === service).map((item) => item.booking_id));
    rows = rows.filter((row) => bookings.has(row.id));
  }
  const headers = ["Kode booking","Status booking","Status pembayaran","Tanggal booking","Tagihan","Gross sales","Diskon","Net sales","Pendapatan terealisasi","Kas diterima","Refund","Estimasi direct cost","Biaya aktual","Biaya proses","Profit kontribusi","Margin (%)","Piutang","Biaya layanan snapshot","Biaya layanan diterima","Refund biaya layanan","Pendapatan platform terealisasi"];
  const lines = [headers.map(csv).join(","), ...rows.map((row) => [row.order_number,row.order_status,row.payment_status,row.created_at,row.payable_amount,row.gross_sales,row.discount_amount,row.net_sales,row.recognized_revenue,row.cash_received,row.refunds,row.estimated_direct_cost,row.actual_direct_cost,row.processing_fees,row.contribution_profit,row.profit_margin,row.receivable,row.service_fee_amount,row.service_fee_cash_received,row.service_fee_refunded,row.service_fee_recognized_revenue].map(csv).join(","))];
  return new Response(`\uFEFF${lines.join("\r\n")}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="shiap-finance-${from || "all"}-${to || "all"}.csv"`, "cache-control": "no-store" } });
}
