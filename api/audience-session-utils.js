import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const AUDIENCE_SESSION_SECONDS = 7 * 60;

export function createAudienceToken() {
  return randomBytes(32).toString("base64url");
}

export function hashAudienceToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatchesHash(token, expectedHash) {
  if (typeof token !== "string" || token.length < 32 || token.length > 128) return false;
  if (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(hashAudienceToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return timingSafeEqual(actual, expected);
}

export function isAudienceSessionActive(session, now = Date.now()) {
  if (!session || session.ended_at) return false;
  const expiresAt = Date.parse(session.expires_at);
  return Number.isFinite(expiresAt) && expiresAt > now;
}
