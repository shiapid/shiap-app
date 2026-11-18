const v4Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ticketQrPayload(credential: string) {
  if (!v4Uuid.test(credential)) throw new Error("Invalid ticket credential");
  return `SHIAP1:${credential}`;
}

export function parseTicketQrPayload(value: string) {
  const match = /^SHIAP1:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(value.trim());
  return match?.[1] ?? null;
}
