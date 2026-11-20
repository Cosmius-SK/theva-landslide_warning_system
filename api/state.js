import { createClient } from "@supabase/supabase-js";
const headers = {
  "Access-Control-Allow-Origin": process.env.APP_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
  try {
    const db = admin();
    if (req.method === "GET") {
      const { data, error } = await db.from("demo_state").select("id,state,updated_at").eq("id",1).maybeSingle();
      if (error) throw error;
      return res.status(200).json({ configured:true, state:data?.state ?? null, updatedAt:data?.updated_at ?? null });
    }
    if (req.method === "POST") {
      const expected = process.env.OPERATOR_ACCESS_TOKEN;
      const supplied = (req.headers.authorization || "").replace(/^Bearer\s+/i,"");
      if (!expected || !supplied || supplied !== expected) return res.status(401).json({error:"Operator access denied."});
      const state = req.body?.state;
      const ownerId = req.body?.ownerId;
      if (!state || !Array.isArray(state.sensors) || typeof state.espOnline !== "boolean" || !ownerId) return res.status(400).json({error:"Invalid state payload."});
      const { data: lock, error: lockError } = await db.from("operator_lock").select("owner_id,expires_at").eq("id",1).maybeSingle();
      if (lockError) throw lockError;
      if (!lock || lock.owner_id !== ownerId || new Date(lock.expires_at).getTime() <= Date.now()) return res.status(409).json({error:"This operator console does not hold the active lock. Reconnect as the active operator."});
      const { data, error } = await db.from("demo_state").upsert({id:1,state,updated_at:new Date().toISOString()}).select("state,updated_at").single();
      if (error) throw error;
      return res.status(200).json({state:data.state,updatedAt:data.updated_at});
    }
    res.setHeader("Allow","GET, POST, OPTIONS");
    return res.status(405).json({error:"Method not allowed."});
  } catch (e) {
    console.error("Theva state API:",e.message);
    return res.status(503).json({error:"Shared state service is not configured or temporarily unavailable."});
  }
}