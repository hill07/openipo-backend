import crypto from "crypto";

export function createSessionToken() {
  return crypto.randomBytes(48).toString("hex");
}

export function hashToken(rawToken) {
  const secret = process.env.SESSION_SECRET || "dev-secret";
  return crypto.createHmac("sha256", secret).update(rawToken).digest("hex");
}

export function getExpiryDate(hours = 168) {
  const ms = Number(hours) * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}
