import { prepareGuestSession, revokeGuestSession, sameOrigin, routeError, privateHeaders } from "@/lib/customer-bookings";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await prepareGuestSession();
    return Response.json({ ready: true }, { headers: privateHeaders });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    await revokeGuestSession();
    return Response.json({ revoked: true }, { headers: privateHeaders });
  } catch (error) { return routeError(error); }
}
