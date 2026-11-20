import { createClient } from "@supabase/supabase-js";
const headers = {
  "Access-Control-Allow-Origin": process.env.APP_ORIGIN || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store"
};
function admin() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase server configuration missing");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
export default async function handler(req, res) {
  Object.entries(headers).forEach(([k,v]) => res.setHeader(k,v));
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") { res.setHeader("Allow","POST, OPTIONS"); return res.status(405).json({error:"Method not allowed."}); }
  const expected = process.env.OPERATOR_ACCESS_TOKEN;
  const supplied = (req.headers.authorization || "").replace(/^Bearer\s+/i,"");
  if (!expected || !supplied || supplied !== expected) return res.status(401).json({error:"Operator access denied."});
  const { ownerId, action } = req.body || {};
  if (!ownerId || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(ownerId) || !["acquire","renew","release"].includes(action)) return res.status(400).json({error:"Invalid operator lock request."});
  try {
    const db = admin();
    const fn = action === "acquire" ? "acquire_operator_lock" : action === "renew" ? "renew_operator_lock" : "release_operator_lock";
    const { data, error } = await db.rpc(fn, { p_owner: ownerId });
    if (error) throw error;
    if (action === "acquire" && !data) return res.status(409).json({error:"Another operator console is already active. Close it or wait 30 seconds after it disconnects."});
    if (action === "renew" && !data) return res.status(409).json({error:"Operator lock was lost. This console is now read-only."});
    return res.status(200).json({ok:true, active:action !== "release"});
  } catch (e) {
    console.error("Theva operator lock API:",e.message);
    return res.status(503).json({error:"Operator lock service unavailable."});
  }
}
