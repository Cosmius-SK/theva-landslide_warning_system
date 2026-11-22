import test from "node:test";
import assert from "node:assert/strict";
import { assess } from "../src/lib/risk.js";

test("classifies representative Safe, Watch, High, and Evacuation readings", () => {
  const cases = [
    { values: [12, 22, 34], level: "Safe", tone: "safe" },
    { values: [35, 18, 12], level: "Watch", tone: "watch" },
    { values: [60, 60, 0], level: "High", tone: "high" },
    { values: [80, 80, 0], level: "Evacuation", tone: "critical" }
  ];

  for (const { values, level, tone } of cases) {
    const result = assess(values);
    assert.equal(result.level, level, `Expected ${values.join(", ")} to be ${level}`);
    assert.equal(result.tone, tone, `Expected ${values.join(", ")} to use the ${tone} tone`);
  }
});

test("keeps intermediate values in the correct bands at threshold boundaries", () => {
  assert.equal(assess([34, 34, 34]).level, "Safe");
  assert.equal(assess([35, 59, 34]).level, "Watch");
  assert.equal(assess([59, 59, 0]).level, "Watch");
  assert.equal(assess([60, 0, 0]).level, "Watch");
  assert.equal(assess([60, 60, 0]).level, "High");
  assert.equal(assess([79, 60, 0]).level, "High");
  assert.equal(assess([80, 0, 0]).level, "High");
  assert.equal(assess([80, 79, 0]).level, "High");
  assert.equal(assess([80, 80, 0]).level, "Evacuation");
});

test("reports Unavailable when every sensor is unhealthy", () => {
  assert.equal(assess([]).level, "Unavailable");
});
