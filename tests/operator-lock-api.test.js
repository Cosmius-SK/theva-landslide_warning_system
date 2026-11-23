import test from "node:test";
import assert from "node:assert/strict";
import { createOperatorLockHandler } from "../api/operator-lock.js";

const ownerId = "5d9a67a8-6d8a-45e0-b06d-634afe6b6613";
function createHandler(rpcResult = true) {
  const calls = [];
  const handler = createOperatorLockHandler({
    env: { OPERATOR_ACCESS_TOKEN: "operator-secret", APP_ORIGIN: "http://localhost:4174" },
    admin: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { data: rpcResult, error: null }; } })
  });
  return { handler, calls };
}
function response() {
  return {
    statusCode: 200, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; }
  };
}
async function invoke(handler, action, authorization = "Bearer operator-secret") {
  const res = response();
  await handler({ method: "POST", body: { action, ownerId }, headers: { authorization } }, res);
  return res;
}

test("operator lock requires the access token and routes each lease action to its RPC", async () => {
  const { handler, calls } = createHandler();
  assert.equal((await invoke(handler, "acquire", "Bearer wrong")).statusCode, 401);
  assert.equal((await invoke(handler, "acquire")).body.active, true);
  assert.equal((await invoke(handler, "renew")).body.active, true);
  assert.equal((await invoke(handler, "release")).body.active, false);
  assert.deepEqual(calls.map(call => call.name), ["acquire_operator_lock", "renew_operator_lock", "release_operator_lock"]);
  assert.ok(calls.every(call => call.args.p_owner === ownerId));
});

test("operator lock reports a competing owner and invalid renewal", async () => {
  const unavailable = createHandler(false).handler;
  assert.equal((await invoke(unavailable, "acquire")).statusCode, 409);
  assert.equal((await invoke(unavailable, "renew")).statusCode, 409);
});
