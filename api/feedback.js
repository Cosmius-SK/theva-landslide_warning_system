import { createClient } from "@supabase/supabase-js";
import { isAudienceSessionActive, tokenMatchesHash } from "./audience-session-utils.js";

function createAdmin(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase server configuration missing");
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

const ownerIdPattern = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

export function createFeedbackHandler({ admin = () => createAdmin(process.env), env = process.env, now = () => Date.now() } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, OPTIONS");
      return res.status(405).json({ error: "Method not allowed." });
    }

    try {
      const db = admin();
      const action = req.body?.action;
      if (action === "submit") {
        const { token, rating, learning, comment = "" } = req.body || {};
        if (typeof token !== "string" || !Number.isInteger(rating) || rating < 1 || rating > 5 || !["Yes", "A little", "No"].includes(learning) || typeof comment !== "string" || comment.length > 1000) {
          return res.status(400).json({ error: "Feedback fields are invalid." });
        }
        const { data: session, error: sessionError } = await db.from("audience_session").select("token_hash,expires_at,ended_at,started_at").eq("id", 1).maybeSingle();
        if (sessionError) throw sessionError;
        if (!session || !tokenMatchesHash(token, session.token_hash) || !isAudienceSessionActive(session, now())) {
          return res.status(401).json({ error: "The audience session is no longer active. Feedback could not be saved." });
        }
        const { data, error } = await db.from("audience_feedback").insert({
          session_started_at: session.started_at,
          rating,
          learning,
          comment: comment.trim()
        }).select("id,created_at,rating,learning,comment").single();
        if (error) throw error;
        return res.status(201).json({ feedback: data });
      }

      if (action === "list") {
        const supplied = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
        const ownerId = req.body?.ownerId;
        if (!env.OPERATOR_ACCESS_TOKEN || supplied !== env.OPERATOR_ACCESS_TOKEN || !ownerIdPattern.test(ownerId || "")) {
          return res.status(401).json({ error: "Operator access denied." });
        }
        const { data: lock, error: lockError } = await db.from("operator_lock").select("owner_id,expires_at").eq("id", 1).maybeSingle();
        if (lockError) throw lockError;
        if (!lock || lock.owner_id !== ownerId || Date.parse(lock.expires_at) <= now()) {
          return res.status(409).json({ error: "This operator console does not hold the active lock." });
        }
        const { data, error } = await db.from("audience_feedback").select("id,created_at,rating,learning,comment").order("created_at", { ascending: false }).limit(200);
        if (error) throw error;
        return res.status(200).json({ feedback: data || [] });
      }

      return res.status(400).json({ error: "Unknown feedback action." });
    } catch (error) {
      console.error("Theva feedback API:", error.message);
      return res.status(503).json({ error: "Feedback service unavailable." });
    }
  };
}

export default createFeedbackHandler();
