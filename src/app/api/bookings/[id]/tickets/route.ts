import { BookingError, privateHeaders, routeError } from "@/lib/customer-bookings";
import { loadOwnedTicketData } from "@/lib/etickets/server";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const tickets = await loadOwnedTicketData(id);
    if (!tickets.length) throw new BookingError("E-Tiket sedang disiapkan. Periksa kembali sebentar lagi.", 404);
    return Response.json({ tickets }, { headers: privateHeaders });
  } catch (error) { return routeError(error); }
}
