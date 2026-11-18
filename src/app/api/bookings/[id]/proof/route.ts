import sharp from "sharp";
import { BookingError, boundedBody, hashSecret, ownedBooking, privateHeaders, rateLimit, routeError, sameOrigin } from "@/lib/customer-bookings";

export const runtime = "nodejs";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    if (process.env.NEXT_PUBLIC_SHIAP_DEMO_MODE === "true") throw new BookingError("Pembayaran demo dinonaktifkan.", 403);
    const { id } = await params;
    const { context, order } = await ownedBooking(id);
    await rateLimit("proof-upload", context.user?.id || context.guest!, 12, 3600);
    if (!order.payment_enabled) throw new BookingError("Pembayaran belum dibuka. Hubungi SHIAP.");
    const input = await boundedBody(request, 8 * 1024 * 1024);
    if (!input.length) throw new BookingError("File bukti pembayaran kosong.");
    let output: Buffer;
    let mime: string;
    let extension: string;
    if (input.subarray(0, 5).toString("ascii") === "%PDF-") {
      if (!input.subarray(-1024).includes(Buffer.from("%%EOF"))) throw new BookingError("File PDF tidak valid.");
      output = input;
      mime = "application/pdf";
      extension = "pdf";
    } else {
      try {
        const image = sharp(input, { limitInputPixels: 40_000_000 });
        const meta = await image.metadata();
        if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format) || (meta.pages || 1) > 1) throw new Error("Unsupported image");
        output = await image.autoOrient().resize(2400, 2400, { fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
      } catch { throw new BookingError("Pilih bukti JPEG, PNG, WebP, atau PDF yang valid.", 415); }
      mime = "image/webp";
      extension = "webp";
    }
    if (output.length > 8 * 1024 * 1024) throw new BookingError("Ukuran bukti maksimal 8 MB.", 413);
    const digest = hashSecret(output.toString("base64"));
    const path = (order.user_id || order.guest_session_id) + "/" + id + "/" + digest + "." + extension;
    let name = "bukti-pembayaran." + extension;
    try { name = decodeURIComponent(request.headers.get("x-file-name") || name).replace(/[\x00-\x1f\x7f]/g, "").slice(0, 200); } catch {}
    const bucket = context.admin.storage.from("booking-payment-proofs");
    const { error: uploaded } = await bucket.upload(path, output, { upsert: false, contentType: mime, cacheControl: "0" });
    if (uploaded && !["409", "Duplicate"].includes(String(uploaded.statusCode || uploaded.name))) throw new BookingError("Bukti belum dapat diunggah. Silakan coba lagi.", 503);
    const { data, error } = await context.admin.rpc("customer_booking_action", {
      p_actor: context.user?.id ?? null, p_guest_hash: context.hash, p_booking_id: id, p_action: "proof",
      p_proof: { path, name, mime, size: output.length },
    });
    if (error) {
      // Only remove a new object after a definite database rejection.
      // An uncertain network response may have committed its proof record.
      if (!uploaded && ["P0001", "23514"].includes(error.code)) await bucket.remove([path]);
      throw new BookingError(error.code === "P0001" ? error.message : "Bukti belum dapat dikonfirmasi. Muat ulang status sebelum mencoba lagi.");
    }
    return Response.json({ id: data }, { headers: privateHeaders });
  } catch (error) { return routeError(error); }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { context } = await ownedBooking(id);
    await rateLimit("proof-read", context.user?.id || context.guest!, 60, 60);
    const proofId = new URL(request.url).searchParams.get("proof");
    const { data, error } = await context.admin.from("booking_payment_records").select("storage_path,original_file_name").eq("booking_id", id).eq("id", proofId || "").maybeSingle();
    if (error || !data) throw new BookingError("Bukti tidak ditemukan.", 404);
    const signed = await context.admin.storage.from("booking-payment-proofs").createSignedUrl(data.storage_path, 60, { download: data.original_file_name });
    if (signed.error || !signed.data?.signedUrl) throw new BookingError("Bukti belum dapat dibuka.", 503);
    return new Response(null, { status: 303, headers: { ...privateHeaders, Location: signed.data.signedUrl } });
  } catch (error) { return routeError(error); }
}
