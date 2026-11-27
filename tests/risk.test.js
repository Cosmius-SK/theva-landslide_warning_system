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


test("classifies every integer sensor combination from 0 through 100", () => {
  for (let moisture = 0; moisture <= 100; moisture += 1) {
    for (let rainfall = 0; rainfall <= 100; rainfall += 1) {
      for (let movement = 0; movement <= 100; movement += 1) {
        const values = [moisture, rainfall, movement];
        const high = values.filter(value => value >= 60).length;
        const critical = values.filter(value => value >= 80).length;
        const expected = critical >= 2 ? "Evacuation"
          : critical >= 1 || high >= 2 ? "High"
            : values.some(value => value >= 35) ? "Watch" : "Safe";
        assert.equal(assess(values).level, expected, `Unexpected classification for ${values.join(",")}`);
      }
    }
  }
});

test("the reported 0 / 100 / 100 combination is an Evacuation state", () => {
  assert.equal(assess([0, 100, 100]).level, "Evacuation");
});
