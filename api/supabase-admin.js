import { createClient } from "@supabase/supabase-js";

const REQUEST_TIMEOUT_MS = 8_000;

function projectRefFromUrl(value) {
  try {
    const host = new URL(value).hostname;
    return host.endsWith(".supabase.co") ? host.slice(0, -".supabase.co".length) : "custom-host";
  } catch {
    return "invalid-url";
  }
}

function keyMetadata(value) {
  if (!value) return { present: false, kind: "missing", projectRef: null, role: null };
  const parts = value.split(".");
  if (parts.length !== 3) return { present: true, kind: value.startsWith("sb_secret_") ? "secret-key" : "opaque-key", projectRef: null, role: null };
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return { present: true, kind: "jwt", projectRef: payload.ref || null, role: payload.role || null };
  } catch {
    return { present: true, kind: "unreadable-jwt", projectRef: null, role: null };
  }
}

export function getSafeSupabaseConfig(env) {
  const projectRef = projectRefFromUrl(env.SUPABASE_URL || "");
  const key = keyMetadata(env.SUPABASE_SERVICE_ROLE_KEY || "");
  return {
    projectRef,
    urlPresent: Boolean(env.SUPABASE_URL),
    serviceKeyPresent: key.present,
    serviceKeyKind: key.kind,
    keyProjectRef: key.projectRef,
    keyRole: key.role,
    projectRefMatches: key.projectRef ? key.projectRef === projectRef : null
  };
}

export function redactServerSecrets(message, env = process.env) {
  return [env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.OPERATOR_ACCESS_TOKEN]
    .filter(Boolean)
    .reduce((safe, secret) => safe.split(secret).join("[redacted]"), String(message || "Unknown database error"));
}

export function createDiagnosticFetch(fetchImpl, config, timeoutMs = REQUEST_TIMEOUT_MS, secrets = []) {
  return async (input, init = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("Supabase request timed out")), timeoutMs);
    try {
      const upstream = await fetchImpl(input, { ...init, signal: controller.signal });
      const body = await upstream.arrayBuffer();
      const response = new Response(body, { status: upstream.status, statusText: upstream.statusText, headers: upstream.headers });
      if (!response.ok) {
        const requestId = response.headers.get("sb-request-id") || response.headers.get("x-request-id") || response.headers.get("cf-ray") || "unavailable";
        let details = {};
        try {
          const payload = JSON.parse(new TextDecoder().decode(body));
          details = { code: payload.code || null, message: payload.message || payload.error || "PostgREST request failed" };
        } catch { details = { code: null, message: "PostgREST request failed with a non-JSON response" }; }
        console.error("Theva Supabase request failed", {
          ...config,
          path: (() => { try { return new URL(input).pathname; } catch { return "unknown"; } })(),
          status: response.status,
          requestId,
          ...details,
          message: secrets.reduce((message, value) => value ? message.split(value).join("[redacted]") : message, details.message)
        });
      }
      return response;
    } catch (error) {
      console.error("Theva Supabase request error", {
        ...config,
        request: "PostgREST",
        error: error?.name === "AbortError" || error?.message?.includes("timed out") ? "request_timeout" : "network_error"
      });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}

export function createSupabaseAdmin(env = process.env, fetchImpl = globalThis.fetch) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    const config = getSafeSupabaseConfig(env);
    console.error("Theva Supabase server configuration missing", config);
    throw new Error("Supabase server configuration missing");
  }
  const config = getSafeSupabaseConfig(env);
  const keyIsInvalid = (config.serviceKeyKind === "jwt" && config.keyRole !== "service_role") || ["opaque-key", "unreadable-jwt"].includes(config.serviceKeyKind);
  if (config.projectRefMatches === false || keyIsInvalid) {
    console.error("Theva Supabase server key configuration mismatch", { ...config, keyConfigurationValid: false });
    throw new Error(config.projectRefMatches === false
      ? "Supabase URL and service key belong to different projects"
      : "Supabase server key is not a service-role key");
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { fetch: createDiagnosticFetch(fetchImpl, config, REQUEST_TIMEOUT_MS, [env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY]) }
  });
}
