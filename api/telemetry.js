import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdmin, redactServerSecrets } from "./supabase-admin.js";
import { SIMULATED_TEST_LABEL, validateDeviceTelemetryPayload } from "../src/lib/contracts.js";

const ONLINE_WINDOW_MS = 45_000;
const DEVICE_TABLE = "device_telemetry";
const EXPECTED_PROJECT_REF = "qgmvlsgzpvqabiupmnki";
const EXPECTED_BRANCH = "development/esp32-telemetry";
const MAX_BODY_BYTES = 2_048;
const READING_KEYS = ["moisture", "rainfall", "movement"];

function previewProjectUrl(value) {
  let url;
  try { url = new URL(value); } catch { return false; }
  return url.protocol === "https:" && url.hostname === `${EXPECTED_PROJECT_REF}.supabase.co` && !url.username && !url.password && !url.port && url.pathname === "/" && !url.search && !url.hash;
}

function previewScopeAllowed(env) {
  if (!previewProjectUrl(env.SUPABASE_URL)) return false;
  if (env.VITE_SUPABASE_URL && !previewProjectUrl(env.VITE_SUPABASE_URL)) return false;
  if (env.VERCEL_ENV === "production") return false;
  const localEnvironment = !env.VERCEL_ENV || env.VERCEL_ENV === "development";
  const localBranchAllowed = !env.VERCEL_GIT_COMMIT_REF || env.VERCEL_GIT_COMMIT_REF === EXPECTED_BRANCH;
  const localOverride = env.TELEMETRY_LOCAL_DEVELOPMENT_OVERRIDE === "true"
    && localEnvironment && localBranchAllowed && env.NODE_ENV !== "production";
  if (localOverride) return true;
  return env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === EXPECTED_BRANCH;
}

function secretsMatch(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string" || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function bearerToken(req) {
  const authorization = req.headers?.authorization || req.headers?.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1] || "";
}

function responseTelemetry(row, now) {
  const receivedAtMs = Date.parse(row?.received_at || "");
  const readings = Object.fromEntries(READING_KEYS
    .filter(key => Number.isFinite(row?.readings?.[key]) && row.readings[key] >= 0 && row.readings[key] <= 100)
    .map(key => [key, row.readings[key]]));
  return {
    deviceId: row.device_id,
    sequence: Number(row.sequence),
    receivedAt: row.received_at,
    label: SIMULATED_TEST_LABEL,
    readings,
    online: Number.isFinite(receivedAtMs) && now - receivedAtMs <= ONLINE_WINDOW_MS && now >= receivedAtMs - 60_000
  };
}

export function createTelemetryHandler({ admin = () => createSupabaseAdmin(process.env), env = process.env, now = () => Date.now() } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    if (!previewScopeAllowed(env)) return res.status(503).json({ error: "Device telemetry is unavailable in this environment." });

    if (req.method === "GET") {
      if (!env.TELEMETRY_DEVICE_ID) return res.status(200).json({ configured: false, telemetry: null });
      try {
        const { data, error } = await admin().from(DEVICE_TABLE)
          .select("device_id,sequence,received_at,readings")
          .eq("device_id", env.TELEMETRY_DEVICE_ID)
          .maybeSingle();
        if (error) throw error;
        return res.status(200).json({ configured: true, telemetry: data ? responseTelemetry(data, now()) : null });
      } catch (error) {
        console.error("Theva telemetry read failed", { code: error.code || null, message: redactServerSecrets(error.message, env) });
        return res.status(503).json({ error: "Device telemetry is temporarily unavailable." });
      }
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed." });
    }

    if (!env.TELEMETRY_DEVICE_ID || typeof env.TELEMETRY_DEVICE_TOKEN !== "string" || !/^[A-Za-z0-9_-]{42}[AQgw]$/.test(env.TELEMETRY_DEVICE_TOKEN)) {
      return res.status(503).json({ error: "Device telemetry is not configured." });
    }
    if (!secretsMatch(bearerToken(req), env.TELEMETRY_DEVICE_TOKEN)) {
      return res.status(401).json({ error: "Device authentication failed." });
    }

    const declaredLength = Number(req.headers?.["content-length"] || req.headers?.["Content-Length"] || 0);
    let actualLength;
    try { actualLength = Buffer.byteLength(typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? "")); }
    catch { return res.status(400).json({ error: "Telemetry payload is invalid." }); }
    if ((declaredLength > 0 && declaredLength > MAX_BODY_BYTES) || actualLength > MAX_BODY_BYTES) {
      return res.status(413).json({ error: "Telemetry request is too large." });
    }

    let db;
    try {
      db = admin();
      const { data, error } = await db.rpc("consume_device_telemetry_rate_limit", { p_device_id: env.TELEMETRY_DEVICE_ID });
      if (error) throw error;
      if (data !== true) {
        res.setHeader("Retry-After", "5");
        return res.status(429).json({ error: "Telemetry request rate limit exceeded." });
      }
    } catch (error) {
      console.error("Theva telemetry rate limit failed", { code: error.code || null, message: redactServerSecrets(error.message, env) });
      return res.status(503).json({ error: "Device telemetry is temporarily unavailable." });
    }

    let payload = req.body;
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); } catch { return res.status(400).json({ error: "Telemetry payload is invalid." }); }
    }
    const validation = validateDeviceTelemetryPayload(payload, { now: now() });
    if (!validation.valid || payload.deviceId !== env.TELEMETRY_DEVICE_ID) {
      return res.status(400).json({ error: "Telemetry payload is invalid.", details: validation.errors });
    }

    try {
      const { data, error } = await db.rpc("ingest_device_telemetry", {
        p_device_id: payload.deviceId,
        p_sequence: payload.sequence,
        p_observed_at: new Date(Date.parse(payload.sentAt)).toISOString(),
        p_source: "simulated-test",
        p_readings: payload.readings
      });
      if (error) throw error;
      if (data?.accepted !== true) {
        const { data: current, error: readError } = await db.from(DEVICE_TABLE)
          .select("sequence")
          .eq("device_id", payload.deviceId)
          .maybeSingle();
        if (readError) throw readError;
        return res.status(409).json({ error: "Sequence was already accepted or is older than the latest packet.", lastSequence: Number(current?.sequence || 0) });
      }
      return res.status(200).json({ accepted: true, sequence: payload.sequence, receivedAt: new Date(now()).toISOString(), label: SIMULATED_TEST_LABEL });
    } catch (error) {
      console.error("Theva telemetry ingestion failed", { code: error.code || null, message: redactServerSecrets(error.message, env) });
      return res.status(503).json({ error: "Device telemetry could not be saved." });
    }
  };
}

export default createTelemetryHandler();
