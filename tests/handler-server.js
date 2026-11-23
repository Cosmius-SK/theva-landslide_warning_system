import http from "node:http";
import { createServer as createViteServer } from "vite";
import { createStateHandler } from "../api/state.js";
import { createOperatorLockHandler } from "../api/operator-lock.js";
import { createAudienceSessionHandler } from "../api/audience-session.js";
import { createFeedbackHandler } from "../api/feedback.js";

const token = "theva-e2e-operator-token";
let clock = Date.now();
const initialState = {
  sensors: [
    { id: "moisture", name: "Soil moisture", value: 22, healthy: true },
    { id: "rainfall", name: "Rainfall", value: 18, healthy: true },
    { id: "movement", name: "Ground movement", value: 12, healthy: true }
  ],
  espOnline: false,
  source: "virtual-fallback",
  mode: "auto",
  scene: "panorama",
  publishedAt: new Date(clock).toISOString()
};
const tables = {
  operator_lock: null,
  audience_session: null,
  demo_state: { id: 1, state: initialState, updated_at: new Date(clock).toISOString() },
  audience_feedback: []
};

const memoryAdmin = {
  from(table) {
    let operation = "select";
    let filters = {};
    let input = null;
    let limit = null;
    const execute = () => {
      const source = tables[table];
      const matches = row => row && Object.entries(filters).every(([key, value]) => row[key] === value);
      if (operation === "select") {
        if (Array.isArray(source)) return { data: source.slice(0, limit || undefined), error: null };
        return { data: matches(source) ? source : null, error: null };
      }
      if (operation === "upsert") { tables[table] = { ...input }; return { data: tables[table], error: null }; }
      if (operation === "update") {
        if (matches(source)) tables[table] = { ...source, ...input };
        return { data: matches(source) ? tables[table] : null, error: null };
      }
      if (operation === "insert") {
        const row = { id: `feedback-${source.length + 1}`, created_at: new Date(clock).toISOString(), ...input };
        source.unshift(row);
        return { data: row, error: null };
      }
      return { data: null, error: null };
    };
    const query = {
      select() { return query; },
      eq(key, value) { filters[key] = value; return query; },
      upsert(value) { operation = "upsert"; input = value; return query; },
      update(value) { operation = "update"; input = value; return query; },
      insert(value) { operation = "insert"; input = value; return query; },
      order() { return query; },
      limit(value) { limit = value; return query; },
      maybeSingle() { return Promise.resolve(execute()); },
      single() { return Promise.resolve(execute()); },
      then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); }
    };
    return query;
  },
  async rpc(name, { p_owner: ownerId, p_session_hash: sessionHash, p_new_session: isNewSession }) {
    const current = tables.operator_lock;
    if (name === "acquire_operator_lock") {
      const available = (!current && isNewSession) || (current && ((isNewSession && Date.parse(current.expires_at) <= clock) || (current.owner_id === ownerId && current.session_hash === sessionHash)));
      if (available) tables.operator_lock = { id: 1, owner_id: ownerId, session_hash: sessionHash, expires_at: new Date(clock + 30_000).toISOString() };
      return { data: available, error: null };
    }
    if (name === "renew_operator_lock") {
      const valid = current?.owner_id === ownerId && current?.session_hash === sessionHash && Date.parse(current.expires_at) > clock;
      if (valid) current.expires_at = new Date(clock + 30_000).toISOString();
      return { data: Boolean(valid), error: null };
    }
    if (name === "release_operator_lock") {
      const valid = current?.owner_id === ownerId && current?.session_hash === sessionHash;
      if (valid) { current.expires_at = new Date(clock).toISOString(); current.session_hash = null; }
      return { data: Boolean(valid), error: null };
    }
    return { data: null, error: new Error("Unknown test RPC") };
  }
};

const env = { OPERATOR_ACCESS_TOKEN: token };
const handlers = {
  "/api/state": createStateHandler({ admin: () => memoryAdmin, env, now: () => clock }),
  "/api/operator-lock": createOperatorLockHandler({ admin: () => memoryAdmin, env }),
  "/api/audience-session": createAudienceSessionHandler({ admin: () => memoryAdmin, env, now: () => clock }),
  "/api/feedback": createFeedbackHandler({ admin: () => memoryAdmin, env, now: () => clock })
};

async function runHandler(handler, req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (body.length > 64 * 1024) {
    res.writeHead(413, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Request too large." }));
    return;
  }
  try { req.body = body ? JSON.parse(body) : {}; }
  catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Malformed JSON." }));
    return;
  }
  res.statusCode = 200;
  res.status = code => { res.statusCode = code; return res; };
  res.json = value => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(value));
    return res;
  };
  try { await handler(req, res); }
  catch (error) {
    console.error("Browser test API handler error:", error);
    if (!res.writableEnded) { res.statusCode = 500; res.end(JSON.stringify({ error: "Test API failure." })); }
  }
}

const vite = await createViteServer({ server: { middlewareMode: true, watch: { ignored: ["**/artifacts/**"] } }, appType: "spa" });
const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (url.pathname === "/__test/advance") {
    const seconds = Number(url.searchParams.get("seconds")) || 0;
    clock += Math.max(0, Math.min(seconds, 60 * 60)) * 1000;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ now: clock }));
    return;
  }
  if (handlers[url.pathname]) return runHandler(handlers[url.pathname], req, res);
  vite.middlewares(req, res);
});

const port = Number(process.env.PORT || 4174);
server.listen(port, "127.0.0.1", () => console.log(`Theva handler-backed test server listening on http://127.0.0.1:${port}`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(async () => { await vite.close(); process.exit(0); }));
