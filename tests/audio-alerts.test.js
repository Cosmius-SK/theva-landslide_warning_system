import test from "node:test";
import assert from "node:assert/strict";
import { ALERT_ANNOUNCEMENTS, getAudioAlertForTransition } from "../src/lib/audio-alerts.js";

test("HIGH entry triggers one warning alert", () => {
  assert.equal(getAudioAlertForTransition("Watch", "High"), "high");
  assert.equal(getAudioAlertForTransition("High", "High"), null);
});
test("EVACUATION entry escalates to the distinct emergency alert", () => {
  assert.equal(getAudioAlertForTransition("High", "Evacuation"), "evacuation");
  assert.equal(getAudioAlertForTransition("Safe", "Evacuation"), "evacuation");
  assert.equal(getAudioAlertForTransition("Evacuation", "Evacuation"), null);
});
test("only recovery from HIGH or EVACUATION announces all-clear", () => {
  assert.equal(getAudioAlertForTransition("High", "Safe"), "allClear");
  assert.equal(getAudioAlertForTransition("Evacuation", "Safe"), "allClear");
  assert.equal(getAudioAlertForTransition("Watch", "Safe"), null);
});
test("HIGH and EVACUATION announcements are bilingual and simulation-labelled", () => {
  for (const key of ["high", "evacuation", "allClear"]) {
    assert.ok(ALERT_ANNOUNCEMENTS[key].ta.length > 20);
    assert.ok(ALERT_ANNOUNCEMENTS[key].en.toLowerCase().includes("educational") || key === "allClear");
  }
});
