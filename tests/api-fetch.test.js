import test from "node:test";
import assert from "node:assert/strict";
import { apiFetch } from "../src/lib/api-fetch.js";

test("API fetch uses a bounded timeout with a readable error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_input, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("signal is aborted without reason", "AbortError")), { once: true });
  });
  try {
    await assert.rejects(apiFetch("/api/operator-lock", {}, 15), /timed out after 1 seconds/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("API fetch preserves non-timeout network errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  try {
    await assert.rejects(apiFetch("/api/operator-lock", {}, 100), /Failed to fetch/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
