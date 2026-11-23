import test from "node:test";
import assert from "node:assert/strict";
import { createAudienceSessionHandler } from "../api/audience-session.js";
import { createDiagnosticFetch, createSupabaseAdmin, getSafeSupabaseConfig } from "../api/supabase-admin.js";

const secret = "never-print-this-service-key";
const env = {
  SUPABASE_URL: "https://qgmvlsgzpvqabiupmnki.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: secret
};

function recorder() {
  return { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("safe config reports project/key mismatch without exposing the key", () => {
  const payload = Buffer.from(JSON.stringify({ ref: "wrong-project", role: "service_role" })).toString("base64url");
  const config = getSafeSupabaseConfig({
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: `header.${payload}.signature-that-must-not-leak`
  });
  assert.equal(config.projectRef, "qgmvlsgzpvqabiupmnki");
  assert.equal(config.keyProjectRef, "wrong-project");
  assert.equal(config.keyRole, "service_role");
  assert.equal(config.projectRefMatches, false);
  assert.equal(JSON.stringify(config).includes("signature-that-must-not-leak"), false);
});

test("schema-cache missing-table response is bounded, actionable in logs, and safe to clients", async () => {
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args);
  try {
    const loggedFetch = createDiagnosticFetch(async (input, init) => {
      return new Response(JSON.stringify({ code: "PGRST205", message: "Could not find the table 'public.audience_session' in the schema cache" }), {
        status: 404,
        headers: { "content-type": "application/json", "sb-request-id": "test-request-123" }
      });
    }, { ...getSafeSupabaseConfig(env) }, 250, [secret]);
    const requests = [];
    const admin = { from(table) {
      assert.equal(table, "audience_session");
      return { select() { return this; }, eq() { return this; }, async maybeSingle() {
        const response = await loggedFetch(`${env.SUPABASE_URL}/rest/v1/audience_session?select=token_hash%2Cexpires_at%2Cended_at&id=eq.1`, { headers: { apikey: secret } });
        const error = await response.json();
        requests.push(response.status);
        return { data: null, error };
      } };
    } };
    const handler = createAudienceSessionHandler({ admin: () => admin, env: {} });
    const res = recorder();
    await handler({ method: "POST", body: { action: "validate", token: "a".repeat(43) }, headers: {} }, res);

    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, "Audience session service unavailable.");
    assert.deepEqual(requests, [404]);
    const diagnostics = JSON.stringify(logs);
    assert.match(diagnostics, /PGRST205/);
    assert.match(diagnostics, /test-request-123/);
    assert.match(diagnostics, /\/rest\/v1\/audience_session/);
    assert.match(diagnostics, /qgmvlsgzpvqabiupmnki/);
    assert.equal(diagnostics.includes(secret), false);
  } finally {
    console.error = originalError;
  }
});

test("Supabase requests abort at the configured timeout", async () => {
  const controllerSeen = [];
  const boundedFetch = createDiagnosticFetch((_input, init) => new Promise((resolve, reject) => {
    controllerSeen.push(init.signal);
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  }), getSafeSupabaseConfig(env), 15);
  await assert.rejects(boundedFetch(`${env.SUPABASE_URL}/rest/v1/audience_session`), /timed out|aborted/i);
  assert.equal(controllerSeen.length, 1);
});

test("mismatched JWT project refs are rejected before any PostgREST request", () => {
  const payload = Buffer.from(JSON.stringify({ ref: "other-project", role: "service_role" })).toString("base64url");
  const key = `header.${payload}.signature`;
  const safeEnv = { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: key };
  const oldError = console.error;
  console.error = () => {};
  try {
    assert.throws(() => createSupabaseAdmin(safeEnv, async () => { throw new Error("should not call network"); }), /different projects/);
  } finally {
    console.error = oldError;
  }
});

test("JWT keys with a non-service role are rejected without logging the token", () => {
  const payload = Buffer.from(JSON.stringify({ ref: "qgmvlsgzpvqabiupmnki", role: "anon" })).toString("base64url");
  const key = `header.${payload}.signature`;
  const safeEnv = { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: key };
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args);
  try {
    assert.throws(() => createSupabaseAdmin(safeEnv, async () => { throw new Error("should not call network"); }), /not a service-role key/);
    assert.equal(JSON.stringify(logs).includes(key), false);
    assert.match(JSON.stringify(logs), /"keyRole":"anon"/);
  } finally {
    console.error = originalError;
  }
});
