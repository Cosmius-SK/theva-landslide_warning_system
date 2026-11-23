import test from "node:test";
import assert from "node:assert/strict";
import { isCurrentOrNewerUpdate } from "../src/lib/shared-state.js";

test("accepts current or newer updates and rejects out-of-order and unversioned updates", () => {
  const current = "2026-11-22T10:00:02.000Z";
  assert.equal(isCurrentOrNewerUpdate("2026-11-22T10:00:03.000Z", current), true);
  assert.equal(isCurrentOrNewerUpdate(current, current), true);
  assert.equal(isCurrentOrNewerUpdate("2026-11-22T10:00:01.000Z", current), false);
  assert.equal(isCurrentOrNewerUpdate(null, current), false);
  assert.equal(isCurrentOrNewerUpdate("2026-11-22T10:00:01.000Z", null), true);
});
