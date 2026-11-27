import test from "node:test";
import assert from "node:assert/strict";
import { createAudienceSessionHandler } from "../api/audience-session.js";
import { hashAudienceToken, isAudienceSessionActive, tokenMatchesHash } from "../api/audience-session-utils.js";
import { createOperatorSession, hashOperatorSession } from "../api/operator-session-utils.js";

const ownerId = "5d9a67a8-6d8a-45e0-b06d-634afe6b6613";
const env = { OPERATOR_ACCESS_TOKEN: "operator-test-secret" };

function createMemoryDb(now) {
  const tables = {
    operator_lock: { id: 1, owner_id: ownerId, session_hash: "", expires_at: new Date(now() + 30_000).toISOString() },
    audience_session: null,
    demo_state: { id: 1, state: { sensors: [{ id: "moisture", value: 22, healthy: true }, { id: "rainfall", value: 35, healthy: true }, { id: "movement", value: 12, healthy: true }], espOnline: false, source: "virtual-fallback", mode: "auto", scene: "panorama" }, updated_at: new Date(now()).toISOString() }
  };
  function from(table) {
    let operation = "select";
    let rowData;
    const filters = {};
    const result = () => {
      const current = tables[table];
      const matches = current && Object.entries(filters).every(([key, value]) => current[key] === value);
      if (operation === "upsert") { tables[table] = { ...rowData }; return { data: tables[table], error: null }; }
      if (operation === "update") {
        if (matches) tables[table] = { ...current, ...rowData };
        return { data: matches ? tables[table] : null, error: null };
      }
      return { data: matches ? current : null, error: null };
    };
    const query = {
      select() { return query; },
      eq(key, value) { filters[key] = value; return query; },
      is(key, value) { filters[key] = value; return query; },
      upsert(value) { operation = "upsert"; rowData = value; return query; },
      update(value) { operation = "update"; rowData = value; return query; },
      maybeSingle() { return Promise.resolve(result()); },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); }
    };
    return query;
  }
  return { tables, from };
}

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; }
  };
}

function makeOperatorCookie(now) {
  const session = createOperatorSession(ownerId, env, now);
  return { cookie: `theva_operator_session=${session.value}`, hash: hashOperatorSession(session.claims.sessionId) };
}
function request(handler, { action, token, cookie, owner = ownerId }) {
  const req = { method: "POST", body: { action, token, ownerId: owner }, headers: cookie ? { cookie } : {} };
  const res = responseRecorder();
  return handler(req, res).then(() => res);
}

test("valid audience links restore latest state and keep their original expiry", async () => {
  let clock = Date.parse("2026-11-22T10:00:00.000Z");
  const db = createMemoryDb(() => clock);
  const operator = makeOperatorCookie(clock);
  db.tables.operator_lock.session_hash = operator.hash;
  const token = "a".repeat(43);
  const handler = createAudienceSessionHandler({ admin: () => db, env, now: () => clock, makeToken: () => token });

  const started = await request(handler, { action: "start", cookie: operator.cookie });
  assert.equal(started.statusCode, 201);
  assert.equal(started.body.token, token);
  assert.notEqual(db.tables.audience_session.token_hash, token);
  const originalExpiry = started.body.expiresAt;

  const firstRefresh = await request(handler, { action: "validate", token });
  assert.equal(firstRefresh.statusCode, 200);
  assert.equal(firstRefresh.body.expiresAt, originalExpiry);
  assert.equal(firstRefresh.body.state.scene, "panorama");

  db.tables.demo_state.state = { sensors: [{ id: "moisture", value: 22, healthy: true }, { id: "rainfall", value: 82, healthy: true }, { id: "movement", value: 12, healthy: true }], espOnline: false, source: "virtual-fallback", mode: "auto", scene: "slope_detail" };
  db.tables.demo_state.updated_at = new Date(clock + 1_000).toISOString();
  clock += 1_000;
  const afterRefresh = await request(handler, { action: "validate", token });
  assert.equal(afterRefresh.body.expiresAt, originalExpiry);
  assert.equal(afterRefresh.body.state.sensors.find(sensor => sensor.id === "rainfall").value, 82);
});

test("invalid, expired, and operator-ended audience links are rejected", async () => {
  let clock = Date.parse("2026-11-22T10:00:00.000Z");
  const db = createMemoryDb(() => clock);
  const operator = makeOperatorCookie(clock);
  db.tables.operator_lock.session_hash = operator.hash;
  const token = "b".repeat(43);
  const handler = createAudienceSessionHandler({ admin: () => db, env, now: () => clock, makeToken: () => token });

  assert.equal((await request(handler, { action: "validate", token })).statusCode, 401);
  const started = await request(handler, { action: "start", cookie: operator.cookie });
  assert.equal(started.statusCode, 201);
  assert.equal((await request(handler, { action: "validate", token: "wrong-session-token-value-123456" })).statusCode, 401);

  clock = Date.parse(started.body.expiresAt) + 1;
  assert.equal((await request(handler, { action: "validate", token })).statusCode, 410);

  clock = Date.parse("2026-11-22T10:01:00.000Z");
  db.tables.operator_lock.expires_at = new Date(clock + 30_000).toISOString();
  const next = await request(handler, { action: "start", cookie: operator.cookie });
  assert.equal(next.statusCode, 201);
  assert.equal((await request(handler, { action: "end", cookie: operator.cookie })).body.active, false);
  assert.equal((await request(handler, { action: "validate", token })).statusCode, 410);
});

test("active operator can renew an expired audience session but cannot renew an active or ended one", async () => {
  let clock = Date.parse("2026-11-22T10:00:00.000Z");
  const db = createMemoryDb(() => clock);
  const operator = makeOperatorCookie(clock);
  db.tables.operator_lock.session_hash = operator.hash;
  let tokenIndex = 0;
  const tokens = ["d".repeat(43), "e".repeat(43)];
  const handler = createAudienceSessionHandler({ admin: () => db, env, now: () => clock, makeToken: () => tokens[tokenIndex++] });

  const started = await request(handler, { action: "start", cookie: operator.cookie });
  assert.equal(started.statusCode, 201);
  const earlyRenew = await request(handler, { action: "renew", cookie: operator.cookie });
  assert.equal(earlyRenew.statusCode, 409);

  clock = Date.parse(started.body.expiresAt) + 1;
  const renewed = await request(handler, { action: "renew", cookie: operator.cookie });
  assert.equal(renewed.statusCode, 200);
  assert.equal(renewed.body.token, tokens[1]);
  assert.equal(tokenMatchesHash(tokens[1], db.tables.audience_session.token_hash), true);
  assert.equal((await request(handler, { action: "validate", token: started.body.token })).statusCode, 401);
  assert.equal((await request(handler, { action: "validate", token: renewed.body.token })).statusCode, 200);

  await request(handler, { action: "end", cookie: operator.cookie });
  clock = Date.parse(renewed.body.expiresAt) + 1;
  const endedRenew = await request(handler, { action: "renew", cookie: operator.cookie });
  assert.equal(endedRenew.statusCode, 409);
});

test("session token comparison is hash-only and expiry is server-side", () => {
  const token = "c".repeat(43);
  const session = { token_hash: hashAudienceToken(token), expires_at: "2026-11-22T10:07:00.000Z", ended_at: null };
  assert.equal(tokenMatchesHash(token, session.token_hash), true);
  assert.equal(tokenMatchesHash("other-token-value-that-is-long-enough", session.token_hash), false);
  assert.equal(isAudienceSessionActive(session, Date.parse("2026-11-22T10:06:59.999Z")), true);
  assert.equal(isAudienceSessionActive(session, Date.parse("2026-11-22T10:07:00.000Z")), false);
  assert.equal(isAudienceSessionActive({ ...session, ended_at: "2026-11-22T10:01:00.000Z" }), false);
});
