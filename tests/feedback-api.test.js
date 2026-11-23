import test from "node:test";
import assert from "node:assert/strict";
import { createFeedbackHandler } from "../api/feedback.js";
import { hashAudienceToken } from "../api/audience-session-utils.js";

const ownerId = "5d9a67a8-6d8a-45e0-b06d-634afe6b6613";
const operatorToken = "operator-test-secret";
const audienceToken = "a".repeat(43);
const clock = Date.parse("2026-11-22T10:00:00.000Z");

function createDb({ active = true } = {}) {
  const rows = [];
  const tables = {
    audience_session: active ? { id: 1, token_hash: hashAudienceToken(audienceToken), expires_at: new Date(clock + 60_000).toISOString(), ended_at: null, started_at: new Date(clock).toISOString() } : null,
    operator_lock: { id: 1, owner_id: ownerId, expires_at: new Date(clock + 60_000).toISOString() }
  };
  return {
    rows,
    from(table) {
      let filter = {};
      let inserted = null;
      const query = {
        select() { return query; },
        eq(key, value) { filter[key] = value; return query; },
        maybeSingle() {
          const row = tables[table];
          return Promise.resolve({ data: row && Object.entries(filter).every(([k, v]) => row[k] === v) ? row : null, error: null });
        },
        insert(value) { inserted = { id: `feedback-${rows.length + 1}`, created_at: new Date(clock).toISOString(), ...value }; return query; },
        single() { rows.push(inserted); return Promise.resolve({ data: inserted, error: null }); },
        order() { return query; },
        limit() { return Promise.resolve({ data: [...rows], error: null }); }
      };
      return query;
    }
  };
}

function invoke(handler, body, authorization = "") {
  const req = { method: "POST", body, headers: authorization ? { authorization: `Bearer ${authorization}` } : {} };
  const res = {
    statusCode: 200, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; }
  };
  return handler(req, res).then(() => res);
}

test("audience feedback requires a live server-validated token and persists bounded input", async () => {
  const db = createDb();
  const handler = createFeedbackHandler({ admin: () => db, env: {}, now: () => clock });
  assert.equal((await invoke(handler, { action: "submit", token: "invalid", rating: 5, learning: "Yes" })).statusCode, 401);
  assert.equal((await invoke(handler, { action: "submit", token: audienceToken, rating: 6, learning: "Yes" })).statusCode, 400);
  const submitted = await invoke(handler, { action: "submit", token: audienceToken, rating: 5, learning: "Yes", comment: "  Nice demo  " });
  assert.equal(submitted.statusCode, 201);
  assert.equal(db.rows[0].comment, "Nice demo");
  assert.equal(db.rows[0].session_started_at, new Date(clock).toISOString());
  const oversized = await invoke(handler, { action: "submit", token: audienceToken, rating: 5, learning: "Yes", comment: "x".repeat(1001) });
  assert.equal(oversized.statusCode, 400);
});

test("feedback retrieval requires the active operator lock and operator token", async () => {
  const db = createDb();
  db.rows.push({ id: "feedback-1", rating: 4, learning: "A little", comment: "Good" });
  const handler = createFeedbackHandler({ admin: () => db, env: { OPERATOR_ACCESS_TOKEN: operatorToken }, now: () => clock });
  assert.equal((await invoke(handler, { action: "list", ownerId }, "wrong")).statusCode, 401);
  const listed = await invoke(handler, { action: "list", ownerId }, operatorToken);
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.body.feedback.length, 1);
});

test("ended audience sessions cannot submit feedback", async () => {
  const db = createDb({ active: false });
  const handler = createFeedbackHandler({ admin: () => db, env: {}, now: () => clock });
  assert.equal((await invoke(handler, { action: "submit", token: audienceToken, rating: 5, learning: "Yes" })).statusCode, 401);
});
