import test from "node:test";
import assert from "node:assert/strict";
import { createTelemetryHandler } from "../api/telemetry.js";
import { SIMULATED_TEST_LABEL } from "../src/lib/contracts.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const now = Date.parse("2026-11-23T10:00:00.000Z");
const env = {
  TELEMETRY_DEVICE_ID: "theva-esp32-01",
  TELEMETRY_DEVICE_TOKEN: "A".repeat(43),
  SUPABASE_URL: "https://qgmvlsgzpvqabiupmnki.supabase.co",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "development/esp32-telemetry"
};
const payload = {
  deviceId: env.TELEMETRY_DEVICE_ID,
  sequence: 1,
  sentAt: new Date(now).toISOString(),
  label: SIMULATED_TEST_LABEL,
  readings: { moisture: 22, rainfall: 35, movement: 4 }
};

function recorder() {
  return { headers: {}, statusCode: 200, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

function database() {
  let saved = null;
  return {
    get saved() { return saved; },
    from(table) {
      let deviceId;
      const query = {
        select() { return query; },
        eq(key, value) { if (key === "device_id") deviceId = value; return query; },
        maybeSingle() { return Promise.resolve({ data: table === "device_telemetry" && saved?.device_id === deviceId ? saved : null, error: null }); }
      };
      return query;
    },
    async rpc(name, args) {
      if (name === "consume_device_telemetry_rate_limit") return { data: true, error: null };
      assert.equal(name, "ingest_device_telemetry");
      if (saved && args.p_sequence <= saved.sequence) return { data: { accepted: false }, error: null };
      saved = {
        device_id: args.p_device_id,
        sequence: args.p_sequence,
        observed_at: args.p_observed_at,
        received_at: new Date(now).toISOString(),
        source: args.p_source,
        readings: args.p_readings
      };
      return { data: { accepted: true }, error: null };
    }
  };
}

async function invoke(handler, { method = "POST", body = payload, authorization = `Bearer ${env.TELEMETRY_DEVICE_TOKEN}` } = {}) {
  const req = { method, body, headers: authorization ? { authorization } : {} };
  const res = recorder();
  await handler(req, res);
  return res;
}

test("telemetry API authenticates, persists simulated readings, and exposes device health", async () => {
  const db = database();
  const handler = createTelemetryHandler({ admin: () => db, env, now: () => now });
  assert.equal((await invoke(handler, { authorization: "Bearer wrong-token" })).statusCode, 401);
  const accepted = await invoke(handler);
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body.accepted, true);
  assert.equal(db.saved.source, "simulated-test");
  assert.deepEqual(db.saved.readings, payload.readings);
  const duplicate = await invoke(handler);
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.body.lastSequence, 1);
  const older = await invoke(handler, { body: { ...payload, sequence: 0 } });
  assert.equal(older.statusCode, 400);
  const live = await invoke(handler, { method: "GET", body: {} });
  assert.equal(live.body.telemetry.online, true);
  assert.equal(live.body.telemetry.sequence, 1);
  assert.equal(live.body.telemetry.label, SIMULATED_TEST_LABEL);
  assert.deepEqual(Object.keys(live.body.telemetry).sort(), ["deviceId", "label", "online", "readings", "receivedAt", "sequence"]);
});

test("telemetry API rejects malformed, stale, mismatched-device, and out-of-order payloads", async () => {
  const db = database();
  const handler = createTelemetryHandler({ admin: () => db, env, now: () => now });
  assert.equal((await invoke(handler, { body: { ...payload, deviceId: "other-device" } })).statusCode, 400);
  assert.equal((await invoke(handler, { body: { ...payload, label: "" } })).statusCode, 400);
  assert.equal((await invoke(handler, { body: { ...payload, sentAt: new Date(now - 31_000).toISOString() } })).statusCode, 400);
  assert.equal((await invoke(handler, { body: { ...payload, readings: { moisture: "22", rainfall: 35, movement: 4 } } })).statusCode, 400);
  await invoke(handler);
  assert.equal((await invoke(handler, { body: { ...payload, sequence: 1 } })).statusCode, 409);
});

test("telemetry GET reports offline when the last received packet is outside the heartbeat window", async () => {
  const db = database();
  const postResponse = recorder();
  await createTelemetryHandler({ admin: () => db, env, now: () => now })({ method: "POST", body: payload, headers: { authorization: `Bearer ${env.TELEMETRY_DEVICE_TOKEN}` } }, postResponse);
  const handler = createTelemetryHandler({ admin: () => db, env, now: () => now + 46_000 });
  const response = await invoke(handler, { method: "GET", body: {} });
  assert.equal(response.body.telemetry.online, false);
  assert.equal(response.body.telemetry.sequence, 1);
});

test("telemetry fails closed for the wrong Supabase project, production, and wrong branch", async () => {
  let adminCalls = 0;
  const base = { ...env };
  const handlerFor = overrides => createTelemetryHandler({ env: { ...base, ...overrides }, admin: () => { adminCalls++; return database(); }, now: () => now });
  assert.equal((await invoke(handlerFor({ SUPABASE_URL: "https://qrcuhszrufajncssehgz.supabase.co" }))).statusCode, 503);
  assert.equal((await invoke(handlerFor({ VITE_SUPABASE_URL: "https://qrcuhszrufajncssehgz.supabase.co" }))).statusCode, 503);
  assert.equal((await invoke(handlerFor({ VERCEL_ENV: "production" }))).statusCode, 503);
  assert.equal((await invoke(handlerFor({ VERCEL_GIT_COMMIT_REF: "main" }))).statusCode, 503);
  assert.equal(adminCalls, 0);
});

test("explicit local override allows development only with the fixed Preview project", async () => {
  const local = { TELEMETRY_DEVICE_ID: env.TELEMETRY_DEVICE_ID, TELEMETRY_DEVICE_TOKEN: env.TELEMETRY_DEVICE_TOKEN, SUPABASE_URL: env.SUPABASE_URL, TELEMETRY_LOCAL_DEVELOPMENT_OVERRIDE: "true", NODE_ENV: "development" };
  const handler = createTelemetryHandler({ env: local, admin: database, now: () => now });
  assert.equal((await invoke(handler)).statusCode, 200);
  const wrongProject = createTelemetryHandler({ env: { ...local, SUPABASE_URL: "https://qrcuhszrufajncssehgz.supabase.co" }, admin: database, now: () => now });
  assert.equal((await invoke(wrongProject)).statusCode, 503);
  const deployed = createTelemetryHandler({ env: { ...local, VERCEL: "1", VERCEL_ENV: "production" }, admin: database, now: () => now });
  assert.equal((await invoke(deployed)).statusCode, 503);
});

test("telemetry rejects oversized payloads before database work", async () => {
  let calls = 0;
  const handler = createTelemetryHandler({ env, admin: () => { calls++; return database(); }, now: () => now });
  const response = await invoke(handler, { body: "x".repeat(2049) });
  assert.equal(response.statusCode, 413);
  assert.equal(calls, 0);
});

test("persistent rate limiter rejects excess requests and does not ingest", async () => {
  const db = database();
  db.rpc = async name => name === "consume_device_telemetry_rate_limit" ? { data: false, error: null } : assert.fail("ingestion must not run after rate limiting");
  const response = await invoke(createTelemetryHandler({ admin: () => db, env, now: () => now }));
  assert.equal(response.statusCode, 429);
  assert.equal(response.headers["Retry-After"], "5");
});

test("firmware retains HTTPS verification, simulated labels, sequence persistence, and bounded Wi-Fi reconnects", async () => {
  const source = await readFile(resolve(dirname(fileURLToPath(import.meta.url)), "../firmware/esp32_simulated_telemetry/esp32_simulated_telemetry.ino"), "utf8");
  assert.match(source, /WiFi\.setAutoReconnect\(true\)/);
  assert.match(source, /WiFi\.reconnect\(\)/);
  assert.match(source, /kWifiRetryLimit/);
  assert.match(source, /telemetryUrlIsHttps\(\)/);
  assert.match(source, /strncmp\(THEVA_TELEMETRY_URL, "https:\/\/", 8\)/);
  assert.match(source, /setCACert\(THEVA_ROOT_CA\)/);
  assert.doesNotMatch(source, /setInsecure\s*\(/);
  assert.match(source, /preferences\.putULong64\("lastSequence"/);
  assert.match(source, /SIMULATED TEST ONLY/);
});
