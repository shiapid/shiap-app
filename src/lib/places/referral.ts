import { randomInt } from "node:crypto";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createPlacesReferralCode(): string {
  return `SHP-${Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join("")}`;
}
