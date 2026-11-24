import test from "node:test";
import assert from "node:assert/strict";
import { simulateSlopeReadings } from "../src/lib/simulation.js";

test("simulated slope readings stay within sensor bounds", () => {
  for (let tick = 0; tick < 72; tick++) {
    const readings = simulateSlopeReadings(tick);
    for (const key of ["moisture", "rainfall", "movement"]) {
      assert.ok(Number.isInteger(readings[key]));
      assert.ok(readings[key] >= 0 && readings[key] <= 100);
    }
  }
});

test("simulated readings evolve over time and repeat on a full cycle", () => {
  assert.notDeepEqual(simulateSlopeReadings(0), simulateSlopeReadings(9));
  assert.deepEqual(simulateSlopeReadings(0), simulateSlopeReadings(72));
});

test("simulated rainfall leads soil moisture and ground movement", () => {
  const early = simulateSlopeReadings(0);
  const rising = simulateSlopeReadings(18);
  assert.ok(rising.rainfall > early.rainfall);
  assert.ok(rising.moisture > early.moisture);
});
