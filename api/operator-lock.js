import { createSupabaseAdmin, redactServerSecrets } from "./supabase-admin.js";
import {
  clearOperatorSessionCookie,
  createOperatorSession,
  getOperatorSessionTimes,
  hashOperatorSession,
  isTrustedOperatorOrigin,
  setOperatorSessionCookie,
  verifyOperatorSession
} from "./operator-session-utils.js";

function createAdmin(env) {
  return createSupabaseAdmin(env);
}

const ownerIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createOperatorLockHandler({ admin = () => createAdmin(process.env), env = process.env, now = () => Date.now() } = {}) {
  return async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", env.APP_ORIGIN || "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") { res.setHeader("Allow", "POST, OPTIONS"); return res.status(405).json({ error: "Method not allowed." }); }
    if (!isTrustedOperatorOrigin(req, env)) return res.status(403).json({ error: "Operator requests must come from this application." });
    const { ownerId, action } = req.body || {};
    if (!["acquire", "restore", "renew", "activity", "logout", "release"].includes(action)) return res.status(400).json({ error: "Invalid operator lock request." });
    try {
      const db = admin();
      if (action === "acquire") {
        const expected = env.OPERATOR_ACCESS_TOKEN;
        const supplied = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
        if (!expected || !supplied || supplied !== expected) return res.status(401).json({ error: "Operator access denied." });
        if (!ownerIdPattern.test(ownerId || "")) return res.status(400).json({ error: "Invalid operator identity." });
        const session = createOperatorSession(ownerId, env, now());
        const { data, error } = await db.rpc("acquire_operator_lock", { p_owner: ownerId, p_session_hash: hashOperatorSession(session.claims.sessionId), p_new_session: true });
        if (error) throw error;
        if (!data) return res.status(409).json({ error: "Another operator console is already active. Wait for its 30-second lock to expire." });
        setOperatorSessionCookie(res, req, env, session, now());
        return res.status(200).json({ ok: true, active: true, ownerId, ...getOperatorSessionTimes(session.claims) });
      }

      if (action === "logout" || action === "release") {
        const verified = verifyOperatorSession(req, env, now());
        if (!verified.ok) {
          if ((verified.reason === "idle_expired" || verified.reason === "absolute_expired") && verified.claims) {
            const { error } = await db.rpc("release_operator_lock", { p_owner: verified.claims.ownerId, p_session_hash: hashOperatorSession(verified.claims.sessionId) });
            if (error) throw error;
          }
          clearOperatorSessionCookie(res, req, env);
          return res.status(200).json({ ok: true, active: false });
        }
        const { error } = await db.rpc("release_operator_lock", { p_owner: verified.claims.ownerId, p_session_hash: hashOperatorSession(verified.claims.sessionId) });
        if (error) throw error;
        clearOperatorSessionCookie(res, req, env);
        return res.status(200).json({ ok: true, active: false });
      }

      const verified = verifyOperatorSession(req, env, now());
      if (!verified.ok) {
        if (verified.reason !== "missing") clearOperatorSessionCookie(res, req, env);
        const expired = verified.reason === "idle_expired" || verified.reason === "absolute_expired";
        if (expired && verified.claims) {
          const { error } = await db.rpc("release_operator_lock", { p_owner: verified.claims.ownerId, p_session_hash: hashOperatorSession(verified.claims.sessionId) });
          if (error) throw error;
        }
        return res.status(401).json({ error: expired ? "Operator session expired. Sign in again." : "Operator access denied.", reason: verified.reason });
      }
      const sessionOwner = verified.claims.ownerId;
      if (ownerId && ownerId !== sessionOwner) return res.status(401).json({ error: "Operator identity does not match this session." });

      if (action === "restore") {
        const { data, error } = await db.rpc("acquire_operator_lock", { p_owner: sessionOwner, p_session_hash: hashOperatorSession(verified.claims.sessionId), p_new_session: false });
        if (error) throw error;
        if (!data) return res.status(409).json({ error: "Another operator console owns the active lock." });
        return res.status(200).json({ ok: true, active: true, ownerId: sessionOwner, ...getOperatorSessionTimes(verified.claims) });
      }

      if (action === "renew" || action === "activity") {
        const { data, error } = await db.rpc("renew_operator_lock", { p_owner: sessionOwner, p_session_hash: hashOperatorSession(verified.claims.sessionId) });
        if (error) throw error;
        if (!data) return res.status(409).json({ error: "Operator lock is no longer owned by this session." });
        if (action === "activity") {
          const refreshed = createOperatorSession(sessionOwner, env, now(), verified.claims);
          setOperatorSessionCookie(res, req, env, refreshed, now());
          return res.status(200).json({ ok: true, active: true, ownerId: sessionOwner, ...getOperatorSessionTimes(refreshed.claims) });
        }
        return res.status(200).json({ ok: true, active: true, ownerId: sessionOwner, ...getOperatorSessionTimes(verified.claims) });
      }

      return res.status(400).json({ error: "Unknown operator lock action." });
    } catch (error) {
      console.error("Theva operator lock API failed", { code: error.code || null, message: redactServerSecrets(error.message, env) });
      return res.status(503).json({ error: "Operator lock service unavailable." });
    }
  };
}

export default createOperatorLockHandler();
