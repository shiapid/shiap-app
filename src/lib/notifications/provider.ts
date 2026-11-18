export type EmailMessage = { from: string; to: string[]; subject: string; text: string; html: string };
export type DeliveryResult = { state: "sent" | "retry" | "failed"; reference?: string; error?: string };
export interface EmailProvider { idempotent:boolean; send(message: EmailMessage, idempotencyKey: string): Promise<DeliveryResult>; verifySender(email: string): Promise<boolean> }
export function resendProvider(apiKey: string, fetcher: typeof fetch = fetch): EmailProvider {
  return {
    idempotent:true,
    async verifySender(email) {
      try {
        const response = await fetcher("https://api.resend.com/domains", { headers: { Authorization: "Bearer " + apiKey }, signal: AbortSignal.timeout(12000) });
        if (!response.ok) return false;
        const body = await response.json();
        const domain = email.split("@")[1]?.toLowerCase();
        return Array.isArray(body.data) && body.data.some((item: {name?: string; status?: string}) => item.name?.toLowerCase() === domain && item.status === "verified");
      } catch { return false; }
    },
    async send(message, idempotencyKey) {
      try {
        const response = await fetcher("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(message), signal: AbortSignal.timeout(15000) });
        if (!response.ok) return { state: response.status === 429 || response.status >= 500 ? "retry" : "failed", error: "PROVIDER_HTTP_" + response.status };
        const body = await response.json();
        if (typeof body.id !== "string") return { state: "retry", error: "PROVIDER_RESPONSE_INVALID" };
        return { state: "sent", reference: body.id };
      } catch { return { state: "retry", error: "PROVIDER_CONNECTION_FAILURE" }; }
    },
  };
}
