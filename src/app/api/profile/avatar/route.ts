import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { AVATAR_BUCKET, AVATAR_TYPES, MAX_AVATAR_BYTES, resolveAvatar } from "@/lib/profile-avatar";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const json = (body: { url?: string | null; error?: string }, status = 200) => Response.json(body, { headers, status });

async function account() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: json({ error: "Masuk untuk mengelola foto profil." }, 401) } as const;
  const { data: profile, error } = await supabase.from("profiles").select("avatar_path,avatar_url").eq("id", user.id).maybeSingle();
  if (error || !profile) return { response: json({ error: "Profil belum dapat dimuat." }, 503) } as const;
  return { supabase, id: user.id, profile } as const;
}

async function readImage(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks);
      size += value.byteLength;
      if (size > MAX_AVATAR_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function GET() {
  const current = await account();
  if ("response" in current) return current.response;
  return json({ url: await resolveAvatar(current.supabase, current.profile) });
}

async function updateAvatar(request?: Request) {
  const current = await account();
  if ("response" in current) return current.response;
  const { supabase, id, profile } = current;
  const bucket = supabase.storage.from(AVATAR_BUCKET);
  let path: string | null = null;
  if (request) {
    const declaredType = request.headers.get("content-type");
    if (declaredType && declaredType !== "application/octet-stream" && !AVATAR_TYPES.includes(declaredType)) return json({ error: "Pilih foto JPEG, PNG, atau WebP." }, 415);
    if (Number(request.headers.get("content-length")) > MAX_AVATAR_BYTES) return json({ error: "Ukuran foto maksimal 2 MB." }, 413);
    let output: Buffer;
    try {
      const input = await readImage(request);
      if (!input) return json({ error: "Ukuran foto maksimal 2 MB." }, 413);
      const source = sharp(input, { limitInputPixels: 40_000_000 });
      const { format } = await source.metadata();
      if (!format || !["jpeg", "png", "webp"].includes(format)) return json({ error: "Pilih foto JPEG, PNG, atau WebP." }, 415);
      output = await source.autoOrient().resize(512, 512, { fit: "cover", position: "centre" }).webp({ quality: 84 }).toBuffer();
    } catch {
      return json({ error: "Foto rusak atau formatnya tidak didukung." }, 415);
    }
    path = id + "/" + randomUUID() + ".webp";
    const { error } = await bucket.upload(path, output, { contentType: "image/webp", cacheControl: "60", upsert: false });
    if (error) return json({ error: "Foto gagal diunggah. Silakan coba lagi." }, 503);
  }

  // Compare the previous path so overlapping changes cannot delete the winner.
  const update = supabase.from("profiles").update({ avatar_path: path, avatar_url: null }).eq("id", id);
  const { data, error } = await (profile.avatar_path === null
    ? update.is("avatar_path", null)
    : update.eq("avatar_path", profile.avatar_path)).select("avatar_path").maybeSingle();
  if (error) return json({ error: "Perubahan belum dapat dikonfirmasi. Muat ulang profil sebelum mencoba lagi." }, 503);
  if (!data) {
    if (path) await bucket.remove([path]);
    return json({ error: "Foto telah berubah di sesi lain. Coba lagi." }, 409);
  }
  if (profile.avatar_path) await bucket.remove([profile.avatar_path]);
  return json({ url: await resolveAvatar(supabase, data) });
}

export function PUT(request: Request) {
  return updateAvatar(request);
}

export function DELETE() {
  return updateAvatar();
}
