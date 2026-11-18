import { cronAuthorized, dispatchNotifications } from "@/lib/notifications/server";
import { privateHeaders, routeError } from "@/lib/customer-bookings";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) return Response.json({error:"Unauthorized"},{status:401,headers:privateHeaders});
  try { return Response.json(await dispatchNotifications(),{headers:privateHeaders}); }
  catch (error) { return routeError(error); }
}
