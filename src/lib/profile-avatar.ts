import type { SupabaseClient } from "@supabase/supabase-js";

export const AVATAR_ENDPOINT = "/api/profile/avatar";
export const AVATAR_CHANGED = "shiap:avatar-changed";
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const AVATAR_BUCKET = "shiap-profile-avatars";
export const AVATAR_URL_LIFETIME = 600;

export async function resolveAvatar(supabase: SupabaseClient, profile: { avatar_path?: string | null; avatar_url?: string | null } | null) {
  if (!profile?.avatar_path) {
    const legacy = profile?.avatar_url ?? "";
    return /^https?:\/\//i.test(legacy) ? legacy : null;
  }
  const { data } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(profile.avatar_path, AVATAR_URL_LIFETIME);
  return data?.signedUrl ?? null;
}
