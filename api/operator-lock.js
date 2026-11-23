import { createClient } from "@supabase/supabase-js";

function createAdmin(env) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase server configuration missing");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

const ownerIdPattern = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

export function createOperatorLockHandler({ admin = () => createAdmin(process.env), env = process.env } = {}) {
  return async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", env.APP_ORIGIN || "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") { res.setHeader("Allow", "POST, OPTIONS"); return res.status(405).json({ error: "Method not allowed." }); }
    const expected = env.OPERATOR_ACCESS_TOKEN;
    const supplied = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!expected || !supplied || supplied !== expected) return res.status(401).json({ error: "Operator access denied." });
    const { ownerId, action } = req.body || {};
    if (!ownerIdPattern.test(ownerId || "") || !["acquire", "renew", "release"].includes(action)) return res.status(400).json({ error: "Invalid operator lock request." });
    try {
      const db = admin();
      const fn = action === "acquire" ? "acquire_operator_lock" : action === "renew" ? "renew_operator_lock" : "release_operator_lock";
      const { data, error } = await db.rpc(fn, { p_owner: ownerId });
      if (error) throw error;
      if (action === "acquire" && !data) return res.status(409).json({ error: "Another operator console is already active. Close it or wait 30 seconds after it disconnects." });
      if (action === "renew" && !data) return res.status(409).json({ error: "Operator lock was lost. This console is now read-only." });
      return res.status(200).json({ ok: true, active: action !== "release" });
    } catch (error) {
      console.error("Theva operator lock API:", error.message);
      return res.status(503).json({ error: "Operator lock service unavailable." });
    }
  };
}

export default createOperatorLockHandler();
