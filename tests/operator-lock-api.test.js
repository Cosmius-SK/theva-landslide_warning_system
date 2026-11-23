import test from "node:test";
import assert from "node:assert/strict";
import { createOperatorLockHandler } from "../api/operator-lock.js";
import { hashOperatorSession, verifyOperatorSession } from "../api/operator-session-utils.js";

const ownerId = "5d9a67a8-6d8a-45e0-b06d-634afe6b6613";
const env = { OPERATOR_ACCESS_TOKEN: "operator-secret", APP_ORIGIN: "http://localhost:4174", NODE_ENV: "production" };
let clock = Date.parse("2026-11-22T10:00:00.000Z");
function createHarness() {
  const calls = [];
  const db = {
    lock: null,
    from(table) {
      let id;
      const query = {
        select() { return query; },
        eq(key, value) { if (key === "id") id = value; return query; },
        maybeSingle() { return Promise.resolve({ data: table === "operator_lock" && id === 1 ? db.lock : null, error: null }); }
      };
      return query;
    },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "acquire_operator_lock") {
        const current = db.lock;
        const available = (!current && args.p_new_session) || (current && ((args.p_new_session && Date.parse(current.expires_at) <= clock) || (current.owner_id === args.p_owner && current.session_hash === args.p_session_hash)));
        if (available) db.lock = { id: 1, owner_id: args.p_owner, session_hash: args.p_session_hash, expires_at: new Date(clock + 30_000).toISOString() };
        return { data: Boolean(available), error: null };
      }
      if (name === "renew_operator_lock") {
        const valid = db.lock?.owner_id === args.p_owner && db.lock?.session_hash === args.p_session_hash && Date.parse(db.lock.expires_at) > clock;
        if (valid) db.lock.expires_at = new Date(clock + 30_000).toISOString();
        return { data: Boolean(valid), error: null };
      }
      if (name === "release_operator_lock") {
        const valid = db.lock?.owner_id === args.p_owner && db.lock?.session_hash === args.p_session_hash;
        if (valid) { db.lock.expires_at = new Date(clock).toISOString(); db.lock.session_hash = null; }
        return { data: Boolean(valid), error: null };
      }
      throw new Error("Unexpected RPC");
    }
  };
  const handler = createOperatorLockHandler({ env, admin: () => db, now: () => clock });
  return { handler, db, calls };
}
function response() {
  return { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
}
async function invoke(handler, body, { authorization, cookie, origin } = {}) {
  const res = response();
  await handler({ method: "POST", body, headers: { ...(authorization ? { authorization } : {}), ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}), host: "theva.example", "x-forwarded-proto": "https" } }, res);
  return res;
}
const cookieFrom = res => res.headers["Set-Cookie"].split(";")[0];

test("operator sign-in creates a secure cookie and server lock; renew, activity, restore and logout use it", async () => {
  clock = Date.parse("2026-11-22T10:00:00.000Z");
  const { handler, db, calls } = createHarness();
  assert.equal((await invoke(handler, { action: "acquire", ownerId }, { authorization: "Bearer wrong" })).statusCode, 401);
  assert.equal((await invoke(handler, { action: "acquire", ownerId }, { authorization: "Bearer operator-secret", origin: "https://attacker.example" })).statusCode, 403);
  const acquired = await invoke(handler, { action: "acquire", ownerId }, { authorization: "Bearer operator-secret" });
  assert.equal(acquired.statusCode, 200);
  assert.equal(acquired.body.ownerId, ownerId);
  assert.equal("token" in acquired.body, false);
  assert.match(acquired.headers["Set-Cookie"], /HttpOnly; SameSite=Strict; Max-Age=172800; Secure/);
  const cookie = cookieFrom(acquired);
  assert.equal(verifyOperatorSession({ headers: { cookie } }, env, clock).ok, true);
  assert.equal(db.lock.session_hash.length, 64);

  assert.equal((await invoke(handler, { action: "restore" }, { cookie })).body.active, true);
  assert.equal((await invoke(handler, { action: "renew", ownerId }, { cookie })).body.active, true);
  const activity = await invoke(handler, { action: "activity", ownerId }, { cookie });
  assert.equal(activity.body.active, true);
  assert.ok(activity.headers["Set-Cookie"]);
  const activeCookie = cookieFrom(activity);
  assert.deepEqual(calls.map(call => call.name), ["acquire_operator_lock", "acquire_operator_lock", "renew_operator_lock", "renew_operator_lock"]);

  assert.equal((await invoke(handler, { action: "logout", ownerId }, { cookie: activeCookie })).body.active, false);
  assert.equal(db.lock.session_hash, null);
  assert.equal((await invoke(handler, { action: "restore" }, { cookie: activeCookie })).statusCode, 409);
  assert.match((await invoke(handler, { action: "logout", ownerId }, { cookie: activeCookie })).headers["Set-Cookie"], /Max-Age=0/);
});

test("session expires after two idle hours, renewals do not extend activity, and absolute lifetime is 48 hours", async () => {
  clock = Date.parse("2026-11-22T10:00:00.000Z");
  const { handler, db } = createHarness();
  const acquired = await invoke(handler, { action: "acquire", ownerId }, { authorization: "Bearer operator-secret" });
  const cookie = cookieFrom(acquired);
  clock += 90 * 60_000;
  db.lock.expires_at = new Date(clock + 30_000).toISOString(); // Background renewal keeps the lease, but not the idle deadline.
  assert.equal((await invoke(handler, { action: "renew", ownerId }, { cookie })).body.idleExpiresAt, new Date(Date.parse("2026-11-22T12:00:00.000Z")).toISOString());
  clock += 30 * 60_000;
  const expired = await invoke(handler, { action: "renew", ownerId }, { cookie });
  assert.equal(expired.statusCode, 401);
  assert.equal(expired.body.reason, "idle_expired");
  assert.equal(db.lock.session_hash, null);

  const next = await invoke(handler, { action: "acquire", ownerId: "3d9a67a8-6d8a-45e0-b06d-634afe6b6613" }, { authorization: "Bearer operator-secret" });
  assert.equal(next.statusCode, 200);
  clock += 48 * 60 * 60_000 + 1;
  assert.equal(verifyOperatorSession({ headers: { cookie: cookieFrom(next) } }, env, clock).reason, "absolute_expired");
});

test("a competing operator cannot renew or take an unexpired lock", async () => {
  clock = Date.parse("2026-11-22T10:00:00.000Z");
  const { handler } = createHarness();
  const first = await invoke(handler, { action: "acquire", ownerId }, { authorization: "Bearer operator-secret" });
  const otherOwner = "3d9a67a8-6d8a-45e0-b06d-634afe6b6613";
  assert.equal((await invoke(handler, { action: "acquire", ownerId: otherOwner }, { authorization: "Bearer operator-secret" })).statusCode, 409);
  assert.equal((await invoke(handler, { action: "renew", ownerId: otherOwner }, { cookie: cookieFrom(first) })).statusCode, 401);
});
