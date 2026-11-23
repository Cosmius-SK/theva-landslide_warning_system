import test from "node:test";
import assert from "node:assert/strict";
import { createStateHandler } from "../api/state.js";
import { createOperatorSession, hashOperatorSession } from "../api/operator-session-utils.js";

const ownerId = "5d9a67a8-6d8a-45e0-b06d-634afe6b6613";
const fixedNow = Date.parse("2026-11-22T10:00:00.000Z");
const session = createOperatorSession(ownerId, { OPERATOR_ACCESS_TOKEN: "test-token" }, fixedNow);
const cookie = `theva_operator_session=${session.value}`;
const sessionHash = hashOperatorSession(session.claims.sessionId);
const state = {
  sensors: [
    { id: "moisture", value: 22, healthy: true },
    { id: "rainfall", value: 18, healthy: true },
    { id: "movement", value: 12, healthy: true }
  ],
  espOnline: false,
  source: "virtual-fallback",
  mode: "auto",
  scene: "panorama"
};

function recorder() {
  return {
    headers: {}, statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; }
  };
}

function database({ lock = { owner_id: ownerId, session_hash: sessionHash, expires_at: "2026-11-22T10:01:00.000Z" } } = {}) {
  const saved = { state: null, updated_at: null };
  return {
    saved,
    lock,
    from(table) {
      let filters = {};
      let row;
      const query = {
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        maybeSingle() { return Promise.resolve({ data: table === "operator_lock" && filters.id === 1 ? lock : saved.state ? saved : null, error: null }); },
        upsert(value) { row = value; return query; },
        single() { Object.assign(saved, { state: row.state, updated_at: row.updated_at }); return Promise.resolve({ data: saved, error: null }); }
      };
      return query;
    }
  };
}

function invoke(handler, { method = "POST", body = { state, ownerId }, requestCookie = cookie } = {}) {
  const req = { method, body, headers: requestCookie ? { cookie: requestCookie } : {} };
  const res = recorder();
  return handler(req, res).then(() => res);
}

test("state API rejects invalid readings before writing shared state", async () => {
  const db = database();
  const handler = createStateHandler({ admin: () => db, env: { OPERATOR_ACCESS_TOKEN: "test-token" }, now: () => fixedNow });
  const invalid = structuredClone(state);
  invalid.sensors[0].value = 240;
  const response = await invoke(handler, { body: { state: invalid, ownerId } });
  assert.equal(response.statusCode, 400);
  assert.equal(db.saved.state, null);
});

test("public state reports operator lease health without exposing lock ownership", async () => {
  const now = fixedNow;
  const db = database();
  const handler = createStateHandler({ admin: () => db, env: { OPERATOR_ACCESS_TOKEN: "test-token" }, now: () => now });
  const live = await invoke(handler, { method: "GET", body: {} });
  assert.equal(live.statusCode, 200);
  assert.equal(live.body.operatorConnected, true);
  assert.equal("ownerId" in live.body, false);
  db.saved.state = null;
  db.lock.expires_at = new Date(now - 1).toISOString();
  const offline = await invoke(handler, { method: "GET", body: {} });
  assert.equal(offline.body.operatorConnected, false);
});

test("state API requires operator authorization and active ownership, then publishes valid state", async () => {
  const now = Date.parse("2026-11-22T10:00:00.000Z");
  const db = database();
  const handler = createStateHandler({ admin: () => db, env: { OPERATOR_ACCESS_TOKEN: "test-token" }, now: () => now });
  assert.equal((await invoke(handler, { requestCookie: "theva_operator_session=invalid" })).statusCode, 401);
  const success = await invoke(handler);
  assert.equal(success.statusCode, 200);
  assert.deepEqual(success.body.state, state);
  const expiredDb = database({ lock: { owner_id: ownerId, session_hash: sessionHash, expires_at: new Date(now - 1).toISOString() } });
  const expiredHandler = createStateHandler({ admin: () => expiredDb, env: { OPERATOR_ACCESS_TOKEN: "test-token" }, now: () => now });
  assert.equal((await invoke(expiredHandler)).statusCode, 409);
});
