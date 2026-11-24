import { createSupabaseAdmin, redactServerSecrets } from "./supabase-admin.js";
import {
  AUDIENCE_SESSION_SECONDS,
  createAudienceToken,
  hashAudienceToken,
  isAudienceSessionActive,
  tokenMatchesHash
} from "./audience-session-utils.js";
import { validateDemoState } from "../src/lib/contracts.js";
import { verifyActiveOperator } from "./operator-session-utils.js";

function createAdmin(env) {
  return createSupabaseAdmin(env);
}

export function createAudienceSessionHandler({ admin = () => createAdmin(process.env), env = process.env, now = () => Date.now(), makeToken = createAudienceToken } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, OPTIONS");
      return res.status(405).json({ error: "Method not allowed." });
    }

    const action = req.body?.action;
    try {
      const db = admin();
      if (action === "validate") {
        const token = req.body?.token;
        if (typeof token !== "string" || token.length > 128) return res.status(401).json({ error: "Audience session link is invalid." });
        const { data: session, error } = await db.from("audience_session").select("token_hash,expires_at,ended_at").eq("id", 1).maybeSingle();
        if (error) throw error;
        if (!session || !tokenMatchesHash(token, session.token_hash)) return res.status(401).json({ error: "Audience session link is invalid." });
        if (!isAudienceSessionActive(session, now())) return res.status(410).json({ error: "Audience session has ended." });
        const { data: current, error: stateError } = await db.from("demo_state").select("state,updated_at").eq("id", 1).maybeSingle();
        if (stateError) throw stateError;
        if (current?.state && !validateDemoState(current.state).valid) return res.status(503).json({ error: "Stored demonstration state is invalid." });
        return res.status(200).json({ active: true, expiresAt: session.expires_at, state: current?.state ?? null, updatedAt: current?.updated_at ?? null });
      }

      const ownerId = req.body?.ownerId;
      const operator = await verifyActiveOperator({ req, env, db, ownerId, now: now() });
      if (!operator.ok) return res.status(operator.status).json({ error: operator.error });

      if (action === "status") {
        const { data: session, error } = await db.from("audience_session").select("expires_at,ended_at").eq("id", 1).maybeSingle();
        if (error) throw error;
        const active = isAudienceSessionActive(session, now());
        return res.status(200).json({ active, expiresAt: active ? session.expires_at : null });
      }

      if (action === "start") {
        const token = makeToken();
        const startedAt = now();
        const expiresAt = new Date(startedAt + AUDIENCE_SESSION_SECONDS * 1000).toISOString();
        const { error } = await db.from("audience_session").upsert({
          id: 1,
          token_hash: hashAudienceToken(token),
          operator_owner_id: ownerId,
          started_at: new Date(startedAt).toISOString(),
          expires_at: expiresAt,
          ended_at: null
        });
        if (error) throw error;
        return res.status(201).json({ active: true, token, expiresAt });
      }

      if (action === "end") {
        const { error } = await db.from("audience_session").update({ ended_at: new Date(now()).toISOString() }).eq("id", 1);
        if (error) throw error;
        return res.status(200).json({ active: false });
      }

      return res.status(400).json({ error: "Unknown audience session action." });
    } catch (error) {
      console.error("Theva audience session API failed", { code: error.code || null, message: redactServerSecrets(error.message, env) });
      return res.status(503).json({ error: "Audience session service unavailable." });
    }
  };
}

export default createAudienceSessionHandler();
