import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const OPERATOR_SESSION_COOKIE = "theva_operator_session";
export const OPERATOR_IDLE_SECONDS = 2 * 60 * 60;
export const OPERATOR_ABSOLUTE_SECONDS = 48 * 60 * 60;

export function hashOperatorSession(sessionId) {
  return createHash("sha256").update(sessionId).digest("hex");
}

const ownerIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sign(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createOperatorSession(ownerId, env, now = Date.now(), previous = null) {
  if (!ownerIdPattern.test(ownerId || "")) throw new Error("Invalid operator identity.");
  if (!env.OPERATOR_ACCESS_TOKEN) throw new Error("Operator session signing key is not configured.");
  const issuedAt = previous?.issuedAt ?? now;
  const absoluteExpiresAt = previous?.absoluteExpiresAt ?? issuedAt + OPERATOR_ABSOLUTE_SECONDS * 1000;
  const claims = { ownerId, sessionId: previous?.sessionId ?? randomUUID(), issuedAt, lastActivityAt: now, absoluteExpiresAt };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return { claims, value: `${payload}.${sign(payload, env.OPERATOR_ACCESS_TOKEN)}` };
}

function cookieValue(req) {
  const header = req.headers?.cookie || "";
  const entry = header.split(";").map(part => part.trim()).find(part => part.startsWith(`${OPERATOR_SESSION_COOKIE}=`));
  return entry ? entry.slice(OPERATOR_SESSION_COOKIE.length + 1) : "";
}

export function verifyOperatorSession(req, env, now = Date.now()) {
  const value = cookieValue(req);
  if (!value) return { ok: false, reason: "missing" };
  if (value.length > 1024) return { ok: false, reason: "invalid" };
  const [payload, suppliedSignature, ...extra] = value.split(".");
  if (!payload || !suppliedSignature || extra.length || !env.OPERATOR_ACCESS_TOKEN) return { ok: false, reason: "invalid" };
  const expected = Buffer.from(sign(payload, env.OPERATOR_ACCESS_TOKEN));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return { ok: false, reason: "invalid" };
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!ownerIdPattern.test(claims.ownerId || "") || !ownerIdPattern.test(claims.sessionId || "") || !Number.isFinite(claims.issuedAt) || !Number.isFinite(claims.lastActivityAt) || !Number.isFinite(claims.absoluteExpiresAt)) return { ok: false, reason: "invalid" };
    if (claims.issuedAt > now + 60_000 || claims.lastActivityAt > now + 60_000 || claims.absoluteExpiresAt !== claims.issuedAt + OPERATOR_ABSOLUTE_SECONDS * 1000) return { ok: false, reason: "invalid" };
    if (claims.absoluteExpiresAt <= now) return { ok: false, reason: "absolute_expired", claims };
    if (now - claims.lastActivityAt >= OPERATOR_IDLE_SECONDS * 1000) return { ok: false, reason: "idle_expired", claims };
    return { ok: true, claims };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

function cookieAttributes(env, req, maxAge) {
  const secure = env.NODE_ENV === "production" || req?.headers?.["x-forwarded-proto"] === "https";
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, maxAge)}${secure ? "; Secure" : ""}`;
}

export function setOperatorSessionCookie(res, req, env, session, now = Date.now()) {
  const maxAge = Math.floor((session.claims.absoluteExpiresAt - now) / 1000);
  res.setHeader("Set-Cookie", `${OPERATOR_SESSION_COOKIE}=${session.value}; ${cookieAttributes(env, req, maxAge)}`);
}

export function clearOperatorSessionCookie(res, req, env) {
  res.setHeader("Set-Cookie", `${OPERATOR_SESSION_COOKIE}=; ${cookieAttributes(env, req, 0)}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

export function getOperatorSessionTimes(claims) {
  return {
    idleExpiresAt: new Date(claims.lastActivityAt + OPERATOR_IDLE_SECONDS * 1000).toISOString(),
    absoluteExpiresAt: new Date(claims.absoluteExpiresAt).toISOString()
  };
}

export function isTrustedOperatorOrigin(req, env) {
  const origin = req.headers?.origin;
  if (!origin) return true; // Non-browser requests are still protected by the operator secret/cookie.
  try {
    const protocol = req.headers?.["x-forwarded-proto"] || (env.NODE_ENV === "production" ? "https" : "http");
    const host = req.headers?.["x-forwarded-host"] || req.headers?.host;
    const expected = env.APP_ORIGIN || (host ? `${protocol.split(",")[0].trim()}://${host}` : "");
    return Boolean(expected) && new URL(origin).origin === new URL(expected).origin;
  } catch { return false; }
}

export async function verifyActiveOperator({ req, env, db, ownerId, now = Date.now() }) {
  if (!isTrustedOperatorOrigin(req, env)) return { ok: false, status: 403, error: "Operator requests must come from this application." };
  const verified = verifyOperatorSession(req, env, now);
  if (!verified.ok) return { ok: false, status: 401, reason: verified.reason, error: "Operator session is missing or expired. Sign in again." };
  if (ownerId && ownerId !== verified.claims.ownerId) return { ok: false, status: 401, error: "Operator identity does not match this session." };
  const { data: lock, error } = await db.from("operator_lock").select("owner_id,session_hash,expires_at").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (!lock || lock.owner_id !== verified.claims.ownerId || lock.session_hash !== hashOperatorSession(verified.claims.sessionId) || Date.parse(lock.expires_at) <= now) {
    return { ok: false, status: 409, error: "This operator session does not own the active control lock." };
  }
  return { ok: true, claims: verified.claims };
}
