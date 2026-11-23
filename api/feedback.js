import { createSupabaseAdmin, redactServerSecrets } from "./supabase-admin.js";
import { isAudienceSessionActive, tokenMatchesHash } from "./audience-session-utils.js";
import { verifyActiveOperator } from "./operator-session-utils.js";

function createAdmin(env) {
  return createSupabaseAdmin(env);
}

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
        const ownerId = req.body?.ownerId;
        const operator = await verifyActiveOperator({ req, env, db, ownerId, now: now() });
        if (!operator.ok) return res.status(operator.status).json({ error: operator.error });
        const { data, error } = await db.from("audience_feedback").select("id,created_at,rating,learning,comment").order("created_at", { ascending: false }).limit(200);
        if (error) throw error;
        return res.status(200).json({ feedback: data || [] });
      }

      return res.status(400).json({ error: "Unknown feedback action." });
    } catch (error) {
      console.error("Theva feedback API failed", { code: error.code || null, message: redactServerSecrets(error.message, env) });
      return res.status(503).json({ error: "Feedback service unavailable." });
    }
  };
}

export default createFeedbackHandler();
