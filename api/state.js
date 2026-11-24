import { createSupabaseAdmin, redactServerSecrets } from "./supabase-admin.js";
import { validateDemoState } from "../src/lib/contracts.js";
import { verifyActiveOperator } from "./operator-session-utils.js";
const headers = {
  "Access-Control-Allow-Origin": process.env.APP_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store"
};
function admin() {
  return createSupabaseAdmin(process.env);
}
export function createStateHandler({ admin: createAdmin = admin, env = process.env, now = () => Date.now() } = {}) {
  return async function handler(req, res) {
  Object.entries(headers).forEach(([k,v]) => res.setHeader(k,v));
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    const db = createAdmin();
    if (req.method === "GET") {
      const { data, error } = await db.from("demo_state").select("id,state,updated_at").eq("id",1).maybeSingle();
      if (error) throw error;
      if (data?.state) {
        const validation = validateDemoState(data.state);
        if (!validation.valid) return res.status(503).json({ error: "Stored demonstration state is invalid." });
      }
      const { data: lock, error: lockError } = await db.from("operator_lock").select("session_hash,expires_at").eq("id", 1).maybeSingle();
      if (lockError) throw lockError;
      const operatorConnected = Boolean(lock?.session_hash && Date.parse(lock.expires_at) > now());
      return res.status(200).json({ configured:true, state:data?.state ?? null, updatedAt:data?.updated_at ?? null, operatorConnected });
    }
    if (req.method === "POST") {
      const state = req.body?.state;
      const ownerId = req.body?.ownerId;
      const validation = validateDemoState(state);
      if (!validation.valid || typeof ownerId !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(ownerId)) {
        return res.status(400).json({error:"Invalid state payload.", details:validation.errors});
      }
      const operator = await verifyActiveOperator({ req, env, db, ownerId, now: now() });
      if (!operator.ok) return res.status(operator.status).json({ error: operator.error });
      const { data, error } = await db.from("demo_state").upsert({id:1,state,updated_at:new Date(now()).toISOString()}).select("state,updated_at").single();
      if (error) throw error;
      return res.status(200).json({state:data.state,updatedAt:data.updated_at});
    }
    res.setHeader("Allow","GET, POST, OPTIONS");
    return res.status(405).json({error:"Method not allowed."});
  } catch (e) {
    console.error("Theva state API failed", { code: e.code || null, message: redactServerSecrets(e.message, env) });
    return res.status(503).json({error:"Shared state service is not configured or temporarily unavailable."});
  }
  };
}

export default createStateHandler();
