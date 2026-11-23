import test from "node:test";
import assert from "node:assert/strict";
import { validateDemoState, validateHardwarePayload } from "../src/lib/contracts.js";

const validState = {
  sensors: [
    { id: "moisture", value: 22, healthy: true },
    { id: "rainfall", value: 18, healthy: true },
    { id: "movement", value: 12, healthy: false }
  ],
  espOnline: false,
  source: "virtual-fallback",
  mode: "auto",
  scene: "panorama"
};

test("accepts a complete state with a faulted channel kept separate from the other readings", () => {
  assert.equal(validateDemoState(validState).valid, true);
});

test("rejects corrupt, duplicate, missing, and out-of-range sensor state", () => {
  for (const value of [-1, 101, 30.5, NaN]) {
    const state = structuredClone(validState);
    state.sensors[0].value = value;
    assert.equal(validateDemoState(state).valid, false, `rejected ${value}`);
  }
  const duplicate = structuredClone(validState);
  duplicate.sensors[1].id = "moisture";
  assert.equal(validateDemoState(duplicate).valid, false);
  assert.equal(validateDemoState({ ...validState, sensors: validState.sensors.slice(0, 2) }).valid, false);
  assert.equal(validateDemoState({ ...validState, scene: "invented" }).valid, false);
});

test("validates the documented hardware payload and rejects stale or invalid samples", () => {
  const now = Date.parse("2026-11-22T10:00:00.000Z");
  const payload = {
    deviceId: "theva-esp32-01",
    sequence: 4,
    sentAt: new Date(now - 1000).toISOString(),
    controllerOnline: true,
    readings: [
      { id: "moisture", value: 58, status: "ok" },
      { id: "rainfall", value: 42, status: "ok" },
      { id: "movement", value: 3, status: "fault" }
    ]
  };
  assert.equal(validateHardwarePayload(payload, { now }).valid, true);
  assert.equal(validateHardwarePayload({ ...payload, sentAt: new Date(now - 31_000).toISOString() }, { now }).valid, false);
  assert.equal(validateHardwarePayload({ ...payload, readings: payload.readings.map((r, i) => i ? r : { ...r, value: 101 }) }, { now }).valid, false);
  assert.equal(validateHardwarePayload({ ...payload, sequence: -1 }, { now }).valid, false);
});
