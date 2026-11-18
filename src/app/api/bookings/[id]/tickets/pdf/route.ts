import { BookingError, privateHeaders, routeError } from "@/lib/customer-bookings";
import { createTicketPdf } from "@/lib/etickets/pdf";
import { loadOwnedTicketData } from "@/lib/etickets/server";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tickets = await loadOwnedTicketData(id);
    if (!tickets.length) throw new BookingError("E-Tiket belum tersedia.", 404);
    const pdf = await createTicketPdf(tickets);
    const bookingCode = tickets[0].bookingCode.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "BOOKING";
    return new Response(new Uint8Array(pdf), { status: 200, headers: {
      ...privateHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="SHIAP-E-TICKET-${bookingCode}.pdf"; filename*=UTF-8''SHIAP-E-TICKET-${bookingCode}.pdf`,
      "Content-Length": String(pdf.byteLength),
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return routeError(error); }
}
