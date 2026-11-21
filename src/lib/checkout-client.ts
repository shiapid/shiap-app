"use client";

let session: Promise<void> | null = null;

async function ensureSession() {
  if (!session) session = fetch("/api/bookings/session", { method: "POST" }).then(async (response) => {
    if (!response.ok) throw new Error((await response.json()).error || "Sesi booking belum tersedia.");
  }).catch((error) => { session = null; throw error; });
  return session;
}

export async function checkoutBooking(kind: "booking" | "experience" | "unified", payload: Record<string, unknown>) {
  await ensureSession();
  const body = JSON.stringify({ kind, payload });
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))), (value) => value.toString(16).padStart(2, "0")).join("");
  const storage = "shiap_checkout:" + kind;
  let current: { fingerprint: string; id: string; bookingId?: string } | null = null;
  try { current = JSON.parse(sessionStorage.getItem(storage) || "null"); } catch {}
  if (current?.fingerprint !== fingerprint || !current.id) {
    current = { fingerprint, id: crypto.randomUUID() };
    // Retain the key after uncertain responses so refresh/retry returns the same order.
    sessionStorage.setItem(storage, JSON.stringify(current));
  }
  const response = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": current.id }, body });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) session = null;
    throw new Error(result.error || "Pesanan belum dapat diproses.");
  }
  sessionStorage.setItem(storage, JSON.stringify({ ...current, bookingId: result.id }));
  return result.id as string;
}

export function confirmCheckoutNavigation(bookingId: string) {
  // A new checkout may start after the receipt has actually loaded. Until then,
  // repeated submits and uncertain responses retain their original request key.
  for (const kind of ["booking", "experience", "unified"]) {
    const storage = "shiap_checkout:" + kind;
    try {
      const request = JSON.parse(sessionStorage.getItem(storage) || "null");
      if (request?.bookingId === bookingId) sessionStorage.removeItem(storage);
    } catch {}
  }
}
